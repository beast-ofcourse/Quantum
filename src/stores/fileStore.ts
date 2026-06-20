import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	createDirectory as fsCreateDirectory,
	createFile as fsCreateFile,
	deleteEntry as fsDeleteEntry,
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
import type {
	FileEntry,
	FileNode,
	FileTreeWorkerRequest,
	FileTreeWorkerResponse,
	FsChangeEvent,
	ReadDirResult,
} from "@/types/file";
import FileTreeWorker from "@/workers/fileTree.worker?worker";

export const DEFAULT_TREE_DEPTH = 10;

interface FileState {
	rootPath: string | null;
	rootName: string;
	fileTree: FileNode[];
	expanded: Record<string, boolean>;
	selectedFile: string | null;
	loading: boolean;
	error: string | null;
	showHidden: boolean;
	lastRefreshed: number;
	customOrder: Record<string, string[]>;

	openFolder: (path: string) => Promise<void>;
	openFiles: (paths: string[]) => Promise<string | null>;
	closeFolder: () => void;
	refreshTree: () => Promise<void>;
	toggleHidden: () => void;
	toggleExpand: (path: string, force?: boolean) => void;
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

const fsChangeListeners = new Set<UnlistenFn>();
let refreshDebounce: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(refresh: () => Promise<void>) {
	if (refreshDebounce) clearTimeout(refreshDebounce);
	refreshDebounce = setTimeout(() => {
		refreshDebounce = null;
		void refresh();
	}, 200);
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

export const useFileStore = create<FileState>()(
	persist(
		(set, get) => ({
			rootPath: null,
			rootName: "",
			fileTree: [],
			expanded: {},
			selectedFile: null,
			loading: false,
			error: null,
			showHidden: false,
			lastRefreshed: 0,
			customOrder: {},

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
						maxDepth: DEFAULT_TREE_DEPTH,
						includeHidden: get().showHidden,
					});
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
						lastRefreshed: Date.now(),
						expanded: { [path]: true },
						selectedFile: null,
					});
					await setupWatcher(path, () => get().refreshTree());
				} catch (err) {
					set({
						error: err instanceof Error ? err.message : String(err),
						loading: false,
					});
				}
			},

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
				const normRoot = rootPath ? rootPath.replace(/[\\/]+$/, "") : null;
				const allInside = normRoot
					? valid.every((p) => norm(p).startsWith(norm(normRoot + sep)))
					: false;

				// ponytail: only open folder when files need a new sidebar root.
				// Single file with no existing folder → just open the file.
				// Multiple files sharing a common parent → open that parent.
				// Files outside current root → expand to new root.
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

			closeFolder: () => {
				void teardownWatcher();
				set({
					rootPath: null,
					rootName: "",
					fileTree: [],
					expanded: {},
					selectedFile: null,
					error: null,
				});
			},

			refreshTree: async () => {
				const { rootPath, showHidden } = get();
				if (!rootPath) return;
				try {
					const result = await readDirectory({
						path: rootPath,
						maxDepth: DEFAULT_TREE_DEPTH,
						includeHidden: showHidden,
					});
					const tree = await buildTreeAsync(
						rootPath,
						result.entries,
						result.gitignore,
						showHidden,
					);
					const sorted = applyCustomOrder(tree, get().customOrder);
					set({ fileTree: sorted, lastRefreshed: Date.now() });
				} catch (err) {
					console.error("[fileStore] refresh failed:", err);
					set({ error: err instanceof Error ? err.message : String(err) });
				}
			},

			toggleHidden: () => {
				const next = !get().showHidden;
				set({ showHidden: next });
				void get().refreshTree();
			},

			toggleExpand: (path, force) => {
				const cur = get().expanded[path] ?? false;
				const next = force === undefined ? !cur : force;
				set((s) => ({
					expanded: { ...s.expanded, [path]: next },
				}));
			},

			expandAncestors: (path) => {
				const { rootPath, expanded } = get();
				if (!rootPath) return;
				const root = rootPath.replace(/[\\/]+$/, "");
				const normalized = path;
				if (normalized === root) return;
				if (!normalized.startsWith(root)) return;
				const rel = normalized.slice(root.length + 1);
				const parts = rel.split(/[\\/]/);
				const sep = detectSeparator(root);
				const updates: Record<string, boolean> = {};
				let acc = root;
				for (let i = 0; i < parts.length - 1; i++) {
					acc = acc + sep + parts[i];
					updates[acc] = true;
				}
				set({ expanded: { ...expanded, ...updates } });
			},

			selectFile: (path) => set({ selectedFile: path }),

			createFile: async (parentPath, name) => {
				validateName(name);
				const fullPath = joinPath(parentPath, name);
				await fsCreateFile(fullPath);
				await get().refreshTree();
				return fullPath;
			},

			createFolder: async (parentPath, name) => {
				validateName(name);
				const fullPath = joinPath(parentPath, name);
				await fsCreateDirectory(fullPath);
				await get().refreshTree();
				return fullPath;
			},

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
				await get().refreshTree();
			},

			remove: async (path) => {
				const { selectedFile, expanded, rootPath } = get();
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
				await get().refreshTree();
			},

			resolveTilde: async (path) => {
				if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
					const home = await resolveHome();
					if (path === "~") return home;
					return home + path.slice(1);
				}
				return path;
			},

			reorderItems: (parentPath, orderedNames) => {
				set((s) => {
					const next = { ...s.customOrder, [parentPath]: orderedNames };
					const sorted = applyCustomOrder(s.fileTree, next);
					return { customOrder: next, fileTree: sorted };
				});
			},

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
				await get().refreshTree();
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
				void (async () => {
					// openFolder swallows errors into state.error rather than rejecting,
					// so we pre-validate the path and clear persisted state on failure.
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
						await state.openFolder(stalePath);
					} catch (err) {
						console.error("[fileStore] rehydrate failed:", err);
						useFileStore.setState({
							rootPath: null,
							rootName: "",
							fileTree: [],
							error: err instanceof Error ? err.message : String(err),
						});
					}
				})();
			},
		},
	),
);
