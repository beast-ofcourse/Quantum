import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	createDirectory as fsCreateDirectory,
	createFile as fsCreateFile,
	deleteEntry as fsDeleteEntry,
	listFiles,
	pathExists,
	readDirectory,
	renameEntry as fsRenameEntry,
	resolveHome,
	stat,
	unwatchAll,
	watchDirectory,
} from "@/tauri/fs";
import { useEditorStore } from "@/stores/editorStore";
import {
	detectSeparator,
	joinPath,
	parentPath,
	basename,
	nameFromRoot,
	validateName,
	applyCustomOrder,
	findCommonParent,
} from "@/lib/pathUtils";
import { useToastStore } from "@/stores/toastStore";
import type {
	FileEntry,
	FileNode,
	FileTreeWorkerRequest,
	FileTreeWorkerResponse,
	FsChangeEvent,
	ReadDirResult,
} from "@/types/file";
import FileTreeWorker from "@/workers/fileTree.worker?worker";

// Shallow depth: only load immediate children on open.
// Subdirectories are lazy-loaded when the user expands them.
const SHALLOW_DEPTH = 1;

// ── Flat file index ──────────────────────────────────────────────────────────
// Used by QuickOpen / SearchBar for instant file search without traversing the
// in-memory tree. Updated lazily in the background after folder open.

export interface FlatFileEntry {
	/** Relative path from root, e.g. "src/components/Button.tsx" */
	rel: string;
	/** Basename, e.g. "Button.tsx" */
	name: string;
	/** Absolute path */
	path: string;
}

let flatFileCache: FlatFileEntry[] = [];
let flatFileCacheTimer: ReturnType<typeof setTimeout> | null = null;

async function rebuildFlatFileIndex(root: string): Promise<void> {
	try {
		const [relPaths] = await listFiles(root, 8);
		const sep = root.includes("\\") ? "\\" : "/";
		flatFileCache = relPaths.map((rel) => {
			const parts = rel.split(/[/\\]/);
			const name = parts[parts.length - 1];
			return { rel, name, path: root + sep + rel };
		});
		void root;
	} catch (err) {
		console.error("[fileStore] flat index failed:", err);
	}
}

function scheduleFlatRebuild(root: string) {
	if (flatFileCacheTimer) clearTimeout(flatFileCacheTimer);
	// Defer so the UI renders first, then build the index in the background.
	flatFileCacheTimer = setTimeout(() => {
		flatFileCacheTimer = null;
		void rebuildFlatFileIndex(root);
	}, 500);
}

/** Returns the flat file list for the current root (may be stale briefly). */
export function getFlatFileIndex(): FlatFileEntry[] {
	return flatFileCache;
}

// ── Worker pool (tree builder) ───────────────────────────────────────────────

let workerInstance: Worker | null = null;
let workerCounter = 0;
const workerCallbacks = new Map<
	string,
	(res: FileTreeWorkerResponse) => void
>();

function ensureWorker(): Worker {
	if (workerInstance) return workerInstance;
	workerInstance = new FileTreeWorker();
	workerInstance.addEventListener(
		"message",
		(event: MessageEvent<FileTreeWorkerResponse>) => {
			const cb = workerCallbacks.get(event.data.requestId);
			if (cb) {
				workerCallbacks.delete(event.data.requestId);
				cb(event.data);
			}
		},
	);
	return workerInstance;
}

function buildTreeAsync(
	rootPath: string,
	entries: FileEntry[],
	gitignore: string | null,
	showHidden: boolean,
): Promise<FileNode[]> {
	return new Promise((resolve, reject) => {
		const requestId = `req-${++workerCounter}`;
		workerCallbacks.set(requestId, (res) => {
			if (res.type === "built" && res.tree) resolve(res.tree);
			else reject(new Error(res.error ?? "Worker build failed"));
		});
		const req: FileTreeWorkerRequest = {
			type: "build",
			requestId,
			rootPath,
			entries,
			gitignore,
			showHidden,
		};
		ensureWorker().postMessage(req);
	});
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function filterExistingFiles(paths: string[]): Promise<string[]> {
	const results = await Promise.all(
		paths.map(async (path) => {
			try {
				const meta = await stat(path);
				return meta.isDir ? null : path;
			} catch {
				return null;
			}
		}),
	);
	return results.filter((p): p is string => p !== null);
}

/** Splice new children into the tree for a given directory path. */
function spliceChildren(
	tree: FileNode[],
	dirPath: string,
	children: FileNode[],
): FileNode[] {
	return tree.map((node) => {
		if (node.path === dirPath) {
			return { ...node, children };
		}
		if (node.children && dirPath.startsWith(node.path)) {
			return {
				...node,
				children: spliceChildren(node.children, dirPath, children),
			};
		}
		return node;
	});
}

// ── FS watcher ───────────────────────────────────────────────────────────────

const fsChangeListeners = new Set<UnlistenFn>();
let refreshDebounce: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(refresh: () => Promise<void>) {
	if (refreshDebounce) clearTimeout(refreshDebounce);
	refreshDebounce = setTimeout(() => {
		refreshDebounce = null;
		void refresh();
	}, 400);
}

async function setupWatcher(rootPath: string, refresh: () => Promise<void>) {
	await teardownWatcher();
	try {
		await watchDirectory(rootPath);
	} catch (err) {
		console.error("[fileStore] watch failed:", err);
		return;
	}
	const unlisten = await listen<FsChangeEvent>("fs:change", (event) => {
		const payload = event.payload;
		if (!payload) return;
		if (payload.root !== rootPath) return;
		scheduleRefresh(refresh);
	});
	fsChangeListeners.add(unlisten);
}

async function teardownWatcher() {
	for (const u of fsChangeListeners) {
		u();
	}
	fsChangeListeners.clear();
	try {
		await unwatchAll();
	} catch {
		/* ignore */
	}
}

// ── Store interface ───────────────────────────────────────────────────────────

interface FileState {
	rootPath: string | null;
	rootName: string;
	fileTree: FileNode[];
	expanded: Record<string, boolean>;
	/** Paths of directories currently being lazily loaded */
	loadingDirs: Set<string>;
	selectedFile: string | null;
	loading: boolean;
	error: string | null;
	treeTruncated: boolean;
	showHidden: boolean;
	lastRefreshed: number;
	customOrder: Record<string, string[]>;

	openFolder: (path: string) => Promise<void>;
	openFiles: (paths: string[]) => Promise<string | null>;
	closeFolder: () => void;
	refreshTree: () => Promise<void>;
	toggleHidden: () => void;
	/** Toggle or force-set expansion. Lazy-loads children when opening a dir. */
	toggleExpand: (path: string, force?: boolean) => void;
	/** Load children of `dirPath` on demand (called by toggleExpand). */
	expandDir: (dirPath: string) => Promise<void>;
	expandAncestors: (path: string) => void;
	selectFile: (path: string | null) => void;
	createFile: (parentPath: string, name: string) => Promise<string>;
	createFolder: (parentPath: string, name: string) => Promise<string>;
	rename: (oldPath: string, newName: string) => Promise<void>;
	remove: (path: string) => Promise<void>;
	resolveTilde: (path: string) => Promise<string>;
	reorderItems: (parentPath: string, orderedNames: string[]) => void;
	moveItem: (sourcePath: string, targetDirPath: string) => Promise<void>;
}

export const useFileStore = create<FileState>()(
	persist(
		(set, get) => ({
			rootPath: null,
			rootName: "",
			fileTree: [],
			expanded: {},
			loadingDirs: new Set(),
			selectedFile: null,
			loading: false,
			error: null,
			treeTruncated: false,
			showHidden: false,
			lastRefreshed: 0,
			customOrder: {},

			// ── openFolder ─────────────────────────────────────────────────────
			// Reads only depth-1 (immediate children) to stay instant on huge
			// repos. The flat search index is built in the background afterwards.
			openFolder: async (path) => {
				if (!path) return;
				if (!(await pathExists(path))) {
					set({ error: `Path does not exist: ${path}` });
					return;
				}
				set({
					loading: true,
					error: null,
					rootPath: path,
					rootName: nameFromRoot(path),
				});
				try {
					const result: ReadDirResult = await readDirectory({
						path,
						maxDepth: SHALLOW_DEPTH,
						includeHidden: get().showHidden,
					});
					const truncated = result.truncated ?? false;
					const tree = await buildTreeAsync(
						path,
						result.entries,
						result.gitignore,
						get().showHidden,
					);
					const sorted = applyCustomOrder(tree, get().customOrder);
					set({
						fileTree: sorted,
						loading: false,
						treeTruncated: truncated,
						lastRefreshed: Date.now(),
						expanded: { [path]: true },
						selectedFile: null,
					});
					// Skip recursive watcher for huge trees — it'd spam refreshes.
					if (!truncated) {
						await setupWatcher(path, () => get().refreshTree());
					}
					// Build flat search index in background only if tree is manageable.
					if (!truncated) {
						scheduleFlatRebuild(path);
					}
				} catch (err) {
					set({
						error: err instanceof Error ? err.message : String(err),
						loading: false,
					});
				}
			},

			// ── openFiles ───────────────────────────────────────────────────────
			openFiles: async (paths) => {
				if (!paths || paths.length === 0) return null;
				const requested = paths.filter(
					(p) => typeof p === "string" && p.length > 0,
				);
				if (requested.length === 0) return null;

				const valid = await filterExistingFiles(requested);
				if (valid.length === 0) return null;

				const { openFolder, rootPath, expandAncestors, selectFile } = get();

				const isWindows =
					typeof navigator !== "undefined" &&
					/win/i.test(navigator.platform ?? "");
				const norm = (s: string) => (isWindows ? s.toLowerCase() : s);
				const sep =
					valid[0].includes("\\") && !valid[0].includes("/") ? "\\" : "/";
				const normRoot = rootPath ? rootPath.replace(/[/\\]+$/, "") : null;
				const allInside = normRoot
					? valid.every((p) => norm(p).startsWith(norm(normRoot + sep)))
					: false;

				if (!allInside && valid.length > 1) {
					const parent = findCommonParent(valid);
					if (parent) {
						await openFolder(parent);
					}
				}

				let lastOpened: string | null = null;
				for (const path of valid) {
					try {
						await useEditorStore.getState().openFile(path);
						lastOpened = path;
					} catch (err) {
						console.error("[fileStore] openFile failed:", path, err);
					}
				}

				const last = lastOpened ?? valid[valid.length - 1];
				if (last) {
					expandAncestors(last);
					selectFile(last);
				}
				return last;
			},

			// ── closeFolder ─────────────────────────────────────────────────────
			closeFolder: () => {
				void teardownWatcher();
				flatFileCache = [];
				// root cleared on rebuild
				set({
					rootPath: null,
					rootName: "",
					fileTree: [],
					expanded: {},
					loadingDirs: new Set(),
					selectedFile: null,
					error: null,
					treeTruncated: false,
				});
			},

			// ── refreshTree ─────────────────────────────────────────────────────
			// Refreshes only the first level. Each already-expanded directory
			// re-fetches its own children lazily via expandDir.
			refreshTree: async () => {
				const { rootPath, showHidden, expanded } = get();
				if (!rootPath) return;
				try {
					const result = await readDirectory({
						path: rootPath,
						maxDepth: SHALLOW_DEPTH,
						includeHidden: showHidden,
					});
					const truncated = result.truncated ?? false;
					const tree = await buildTreeAsync(
						rootPath,
						result.entries,
						result.gitignore,
						showHidden,
					);
					const sorted = applyCustomOrder(tree, get().customOrder);
					set({
						fileTree: sorted,
						treeTruncated: truncated,
						lastRefreshed: Date.now(),
					});

					// Re-expand directories that were open before the refresh.
					const expandedPaths = Object.entries(expanded)
						.filter(([, v]) => v)
						.map(([k]) => k)
						.filter((k) => k !== rootPath);
					for (const dirPath of expandedPaths) {
						try {
							await get().expandDir(dirPath);
						} catch {
							// Directory may have been deleted — ignore.
						}
					}

					// Rebuild flat search index only if tree is manageable.
					if (!truncated) {
						scheduleFlatRebuild(rootPath);
					}
				} catch (err) {
					console.error("[fileStore] refresh failed:", err);
					set({ error: err instanceof Error ? err.message : String(err) });
				}
			},

			// ── toggleHidden ────────────────────────────────────────────────────
			toggleHidden: () => {
				const next = !get().showHidden;
				set({ showHidden: next });
				void get().refreshTree();
			},

			// ── expandDir ────────────────────────────────────────────────────────
			// Lazy-loads immediate children of a directory node.
			expandDir: async (dirPath: string) => {
				const { rootPath, showHidden, fileTree, customOrder } = get();
				if (!rootPath) return;

				// Mark as loading.
				set((s) => ({
					loadingDirs: new Set([...s.loadingDirs, dirPath]),
				}));
				try {
					const result = await readDirectory({
						path: dirPath,
						maxDepth: SHALLOW_DEPTH,
						includeHidden: showHidden,
					});
					const childNodes = await buildTreeAsync(
						dirPath,
						result.entries,
						result.gitignore,
						showHidden,
					);
					const orderedChildren = applyCustomOrder(childNodes, customOrder);
					const updatedTree = spliceChildren(
						fileTree,
						dirPath,
						orderedChildren,
					);
					set({
						fileTree: updatedTree,
						loadingDirs: (() => {
							const next = new Set(get().loadingDirs);
							next.delete(dirPath);
							return next;
						})(),
					});
				} catch (err) {
					console.error("[fileStore] expandDir failed:", dirPath, err);
					set((s) => {
						const next = new Set(s.loadingDirs);
						next.delete(dirPath);
						return { loadingDirs: next };
					});
				}
			},

			// ── toggleExpand ────────────────────────────────────────────────────
			toggleExpand: (path, force) => {
				const cur = get().expanded[path] ?? false;
				const next = force === undefined ? !cur : force;
				set((s) => ({
					expanded: { ...s.expanded, [path]: next },
				}));
				// Lazy-load children when opening a directory for the first time.
				if (next) {
					// Check if we already have children loaded.
					const findNode = (
						nodes: FileNode[],
						p: string,
					): FileNode | undefined => {
						for (const n of nodes) {
							if (n.path === p) return n;
							if (n.children) {
								const found = findNode(n.children, p);
								if (found) return found;
							}
						}
						return undefined;
					};
					const node = findNode(get().fileTree, path);
					// Load if the node has no children or children array is empty
					// (shallow placeholder).
					if (!node?.children || node.children.length === 0) {
						void get().expandDir(path);
					}
				}
			},

			// ── expandAncestors ─────────────────────────────────────────────────
			expandAncestors: (path) => {
				const { rootPath, expanded } = get();
				if (!rootPath) return;
				const root = rootPath.replace(/[/\\]+$/, "");
				const normalized = path;
				if (normalized === root) return;
				if (!normalized.startsWith(root)) return;
				const rel = normalized.slice(root.length + 1);
				const parts = rel.split(/[/\\]/);
				const sep = detectSeparator(root);
				const updates: Record<string, boolean> = {};
				let acc = root;
				for (let i = 0; i < parts.length - 1; i++) {
					acc = acc + sep + parts[i];
					updates[acc] = true;
				}
				set({ expanded: { ...expanded, ...updates } });

				// Lazy-load each ancestor that isn't yet populated.
				const findNode = (
					nodes: FileNode[],
					p: string,
				): FileNode | undefined => {
					for (const n of nodes) {
						if (n.path === p) return n;
						if (n.children) {
							const found = findNode(n.children, p);
							if (found) return found;
						}
					}
					return undefined;
				};
				for (const ancestorPath of Object.keys(updates)) {
					const node = findNode(get().fileTree, ancestorPath);
					if (!node?.children || node.children.length === 0) {
						void get().expandDir(ancestorPath);
					}
				}
			},

			selectFile: (path) => set({ selectedFile: path }),

			// ── createFile ──────────────────────────────────────────────────────
			createFile: async (parentPath, name) => {
				validateName(name);
				const fullPath = joinPath(parentPath, name);
				await fsCreateFile(fullPath);
				await get().expandDir(parentPath);
				scheduleFlatRebuild(get().rootPath!);
				return fullPath;
			},

			// ── createFolder ────────────────────────────────────────────────────
			createFolder: async (parentPath, name) => {
				validateName(name);
				const fullPath = joinPath(parentPath, name);
				await fsCreateDirectory(fullPath);
				await get().expandDir(parentPath);
				scheduleFlatRebuild(get().rootPath!);
				return fullPath;
			},

			// ── rename ──────────────────────────────────────────────────────────
			rename: async (oldPath, newName) => {
				validateName(newName);
				const parent = parentPath(oldPath);
				if (!parent) throw new Error("Cannot rename a root path");
				const newPath = joinPath(parent, newName);
				if (newPath === oldPath) return;
				await fsRenameEntry(oldPath, newPath);
				const { selectedFile, rootPath, expanded } = get();
				const next: Record<string, boolean> = {};
				for (const [k, v] of Object.entries(expanded)) {
					if (k === oldPath) next[newPath] = v;
					else if (
						k.startsWith(oldPath + "/") ||
						k.startsWith(oldPath + "\\")
					) {
						next[k.replace(oldPath, newPath)] = v;
					} else {
						next[k] = v;
					}
				}
				set({
					expanded: next,
					selectedFile: selectedFile === oldPath ? newPath : selectedFile,
					rootPath: rootPath === oldPath ? newPath : rootPath,
				});
				await get().expandDir(parent);
				scheduleFlatRebuild(get().rootPath!);
			},

			// ── remove ──────────────────────────────────────────────────────────
			remove: async (path) => {
				const { selectedFile, expanded, rootPath } = get();
				const parent = parentPath(path);
				await fsDeleteEntry(path);
				const nextExpanded: Record<string, boolean> = {};
				for (const [k, v] of Object.entries(expanded)) {
					if (
						k === path ||
						k.startsWith(path + "/") ||
						k.startsWith(path + "\\")
					) {
						continue;
					}
					nextExpanded[k] = v;
				}
				set({
					expanded: nextExpanded,
					selectedFile: selectedFile === path ? null : selectedFile,
					rootPath: rootPath === path ? null : rootPath,
				});
				if (parent) await get().expandDir(parent);
				if (get().rootPath) scheduleFlatRebuild(get().rootPath!);
			},

			// ── resolveTilde ────────────────────────────────────────────────────
			resolveTilde: async (path) => {
				if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
					const home = await resolveHome();
					if (path === "~") return home;
					return home + path.slice(1);
				}
				return path;
			},

			// ── reorderItems ────────────────────────────────────────────────────
			reorderItems: (parentPath, orderedNames) => {
				set((s) => {
					const next = { ...s.customOrder, [parentPath]: orderedNames };
					const sorted = applyCustomOrder(s.fileTree, next);
					return { customOrder: next, fileTree: sorted };
				});
			},

			// ── moveItem ────────────────────────────────────────────────────────
			moveItem: async (sourcePath, targetDirPath) => {
				const name = basename(sourcePath);
				const targetPath = joinPath(targetDirPath, name);
				if (targetPath === sourcePath) return;
				await fsRenameEntry(sourcePath, targetPath);
				const { expanded, selectedFile } = get();
				const nextExpanded: Record<string, boolean> = {};
				for (const [k, v] of Object.entries(expanded)) {
					let newKey = k;
					if (
						k === sourcePath ||
						k.startsWith(sourcePath + "/") ||
						k.startsWith(sourcePath + "\\")
					) {
						newKey = k.replace(sourcePath, targetPath);
					}
					nextExpanded[newKey] = v;
				}
				set({
					expanded: nextExpanded,
					selectedFile: selectedFile === sourcePath ? targetPath : selectedFile,
				});
				const srcParent = parentPath(sourcePath);
				if (srcParent) await get().expandDir(srcParent);
				await get().expandDir(targetDirPath);
				if (get().rootPath) scheduleFlatRebuild(get().rootPath!);
			},
		}),
		{
			name: "code-editor:files",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				rootPath: state.rootPath,
				rootName: state.rootName,
				showHidden: state.showHidden,
				customOrder: state.customOrder,
			}),
			onRehydrateStorage: () => (state) => {
				if (!state?.rootPath) return;
				const stalePath = state.rootPath;
				const staleName =
					state.rootName ||
					stalePath.split(/[/\\]/).filter(Boolean).pop() ||
					"";
				// Defer to next tick so the UI renders first.
				setTimeout(async () => {
					try {
						if (!(await pathExists(stalePath))) {
							useFileStore.setState({
								rootPath: null,
								rootName: "",
								fileTree: [],
								error: null,
							});
							return;
						}
						// Lightweight head-count: if root has way too many immediate
						// children, skip auto-reopen to avoid freeze on restart.
						const probe = await readDirectory({
							path: stalePath,
							maxDepth: 1,
							includeHidden: state.showHidden ?? false,
						});
						if (probe.entries.length > 10_000) {
							useToastStore
								.getState()
								.addToast(
									"warn",
									`"${staleName}" is very large (${probe.entries.length} items) — open manually to avoid freezing.`,
								);
							useFileStore.setState({
								rootPath: null,
								rootName: "",
								fileTree: [],
								error: null,
							});
							return;
						}
						await useFileStore.getState().openFolder(stalePath);
					} catch (err) {
						console.error("[fileStore] rehydrate failed:", err);
						useFileStore.setState({
							rootPath: null,
							rootName: "",
							fileTree: [],
							error: err instanceof Error ? err.message : String(err),
						});
					}
				}, 0);
			},
		},
	),
);
