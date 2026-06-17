import { scanExtensions } from "./scanner";
import { loadExtensionEntry } from "./loader";
import { createAPI } from "./api";
import { useExtensionStore } from "./store";
import { editorBus } from "./api/editorBus";
import { useEditorStore } from "@/stores/editorStore";
import { deleteEntry, watchDirectory, unwatchAll } from "@/tauri/fs";
import { isTauri } from "@/lib/platform";
import { ensureBundledExtensions } from "@/lib/extensionBundler";
import { lspManager } from "@/lib/lsp";
import type { ExtensionAPI, Document } from "./types";

interface ActiveExtension {
  id: string;
  api: ExtensionAPI;
  disposables: (() => void)[];
  cleanup: (() => void) | null;
}

let initialized = false;
const activeExtensions = new Map<string, ActiveExtension>();
let hotReloadCleanup: (() => void) | null = null;

function tabToDocument(tab: { path: string; language: string; currentContent: string; isDirty: boolean }): Document {
  return {
    path: tab.path,
    language: tab.language,
    content: tab.currentContent,
    isDirty: tab.isDirty,
  };
}

function setupEditorSubscriptions(): void {
  useEditorStore.subscribe((state, prev) => {
    const added = state.openTabs.filter((t) => !prev.openTabs.some((p) => p.id === t.id));
    for (const tab of added) {
      editorBus.emitOpen(tabToDocument(tab));
    }

    const removed = prev.openTabs.filter((p) => !state.openTabs.some((t) => t.id === p.id));
    for (const tab of removed) {
      editorBus.emitClose(tabToDocument(tab));
    }

    for (const tab of state.openTabs) {
      const prevTab = prev.openTabs.find((t) => t.id === tab.id);
      if (prevTab && prevTab.isDirty && !tab.isDirty && prevTab.savedContent !== tab.savedContent) {
        editorBus.emitSave(tabToDocument(tab));
      }
    }
  });

  useEditorStore.subscribe((state, prev) => {
    const active = state.getActiveTab();
    if (active) {
      const prevTab = prev.openTabs.find((t) => t.id === prev.activeTabId);
      const prevCursor = prevTab?.cursor;
      if (active.cursor.line !== prevCursor?.line || active.cursor.col !== prevCursor?.col) {
        editorBus.emitCursor({
          path: active.path,
          line: active.cursor.line,
          col: active.cursor.col,
        });
      }
    }
  });

  const changeDebounces = new Map<string, ReturnType<typeof setTimeout>>();
  useEditorStore.subscribe((state, prev) => {
    for (const tab of state.openTabs) {
      const prevTab = prev.openTabs.find((t) => t.id === tab.id);
      if (!prevTab || prevTab.currentContent === tab.currentContent) continue;

      const existing = changeDebounces.get(tab.id);
      if (existing) clearTimeout(existing);
      changeDebounces.set(tab.id, setTimeout(() => {
        changeDebounces.delete(tab.id);
        editorBus.emitChange({ path: tab.path, content: tab.currentContent });
      }, 300));
    }

    for (const tab of prev.openTabs) {
      if (!state.openTabs.some((t) => t.id === tab.id)) {
        const existing = changeDebounces.get(tab.id);
        if (existing) {
          clearTimeout(existing);
          changeDebounces.delete(tab.id);
        }
      }
    }
  });

  useEditorStore.subscribe((state, prev) => {
    if (state.activeTabId !== prev.activeTabId) {
      const activeTab = state.getActiveTab();
      editorBus.emitActiveEditor(activeTab ? tabToDocument(activeTab) : null);
    }
  });
}

function makeDocumentFromSave(id: string, content: string): Document {
  const tab = useEditorStore.getState().openTabs.find((t) => t.id === id);
  return tab ? tabToDocument(tab) : { path: id, language: "", content, isDirty: false };
}

export function emitSaveEvent(id: string, content: string): void {
  editorBus.emitSave(makeDocumentFromSave(id, content));
}

export async function initExtensionHost(): Promise<void> {
  if (initialized) return;
  initialized = true;

  store_setLoading(true);

  try {
    // Gracefully handle bundled extensions — may fail in browser mode
    try {
      await ensureBundledExtensions();
    } catch (err) {
      console.warn("[ext:host] bundled extensions unavailable:", err);
    }

    const scanned = await scanExtensions();
    const extInfos = scanned.map((s) => ({
      id: s.id,
      manifest: s.manifest,
      isActive: false,
      error: null as string | null,
    }));
    useExtensionStore.getState().setExtensions(extInfos);

    setupEditorSubscriptions();

    for (const ext of scanned) {
      await activateExtension(ext.id);
    }

    // Start hot-reload watcher (Tauri only)
    if (isTauri()) {
      await setupHotReload();
    }
  } catch (err) {
    console.error("[ext:host] init failed:", err);
  } finally {
    store_setLoading(false);
  }
}

/**
 * Set up hot-reload by watching the extensions directory for file changes.
 * When files change, re-scan and reload affected extensions.
 */
async function setupHotReload(): Promise<void> {
  try {
    const { ensureExtensionsDir } = await import("./scanner");
    const extDir = await ensureExtensionsDir();

    // Watch the extensions directory
    await watchDirectory(extDir);

    // Listen for file change events from Tauri
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<{
      root: string;
      kind: string;
      paths: string[];
    }>("fs:change", (event) => {
      // Only process changes in the extensions directory
      if (!event.payload.root.includes(".code-editor/extensions")) return;
      scheduleHotReload();
    });

    hotReloadCleanup = () => {
      unlisten();
    };
  } catch (err) {
    console.warn("[ext:host] hot-reload not available (running outside Tauri?)", err);
  }
}

let hotReloadTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced hot-reload: wait 500ms after the last change, then re-scan
 * and reload any extensions that changed.
 */
function scheduleHotReload(): void {
  if (hotReloadTimer) clearTimeout(hotReloadTimer);
  hotReloadTimer = setTimeout(async () => {
    hotReloadTimer = null;
    try {
      await performHotReload();
    } catch (err) {
      console.error("[ext:host] hot-reload failed:", err);
    }
  }, 500);
}

async function performHotReload(): Promise<void> {
  const currentExts = useExtensionStore.getState().extensions;
  const currentIds = new Set(currentExts.map((e) => e.id));

  const scanned = await scanExtensions();
  const scannedIds = new Set(scanned.map((s) => s.id));

  // Reload extensions that still exist (might have been modified)
  for (const ext of scanned) {
    if (currentIds.has(ext.id)) {
      // Extension was modified — reload it
      await reloadExtension(ext.id);
    } else {
      // New extension — add and activate
      const extInfo = {
        id: ext.id,
        manifest: ext.manifest,
        isActive: false,
        error: null as string | null,
      };
      useExtensionStore.getState().setExtensions([
        ...useExtensionStore.getState().extensions,
        extInfo,
      ]);
      await activateExtension(ext.id);
    }
  }

  // Deactivate extensions that were removed from disk
  for (const id of currentIds) {
    if (!scannedIds.has(id)) {
      await deactivateExtension(id);
      useExtensionStore.getState().removeExtension(id);
    }
  }
}

export async function activateExtension(id: string): Promise<void> {
  const ext = useExtensionStore.getState().extensions.find((e) => e.id === id);
  if (!ext) return;

  const mainPath = `${ext.manifest.path}/${ext.manifest.main}`;
  const mod = await loadExtensionEntry(mainPath);
  if (!mod) {
    useExtensionStore.getState().setExtensionError(id, `Failed to load entry: ${ext.manifest.main}`);
    return;
  }

  const extensionApi = createAPI(id, ext.manifest.path);

  let cleanup: (() => void) | null = null;
  let disposables: (() => void)[];

  try {
    const result = mod.activate(extensionApi);
    if (result instanceof Promise) {
      const ACTIVATION_TIMEOUT = 10_000;
      const resolved = await Promise.race([
        result,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Extension "${id}" activation timed out after ${ACTIVATION_TIMEOUT}ms`)), ACTIVATION_TIMEOUT),
        ),
      ]);
      if (typeof resolved === "function") {
        cleanup = resolved;
      }
    } else if (typeof result === "function") {
      cleanup = result;
    }

    disposables = collectDisposables(extensionApi);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ext:host] activation failed for "${id}":`, err);
    useExtensionStore.getState().setExtensionError(id, msg);
    return;
  }

  activeExtensions.set(id, {
    id,
    api: extensionApi,
    disposables,
    cleanup,
  });

  useExtensionStore.getState().setExtensionActive(id, true);
}

function collectDisposables(api: ExtensionAPI): (() => void)[] {
  const fns: (() => void)[] = [];

  const collect = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    for (const val of Object.values(obj)) {
      if (typeof val === "object" && val !== null && "dispose" in val && typeof val.dispose === "function") {
        fns.push(() => val.dispose());
      }
      if (val && typeof val === "object" && !Array.isArray(val)) {
        collect(val);
      }
    }
  };

  collect(api);
  return fns;
}

export async function deactivateExtension(id: string): Promise<void> {
  const active = activeExtensions.get(id);
  if (!active) return;

  active.cleanup?.();
  active.disposables.forEach((fn) => {
    try { fn(); } catch { /* noop */ }
  });

  activeExtensions.delete(id);
  useExtensionStore.getState().setExtensionActive(id, false);
}

export function reloadExtension(id: string): Promise<void> {
  return deactivateExtension(id).then(() => activateExtension(id));
}

export async function removeExtension(id: string): Promise<void> {
  await deactivateExtension(id);
  const ext = useExtensionStore.getState().extensions.find((e) => e.id === id);
  if (ext) {
    try {
      await deleteEntry(ext.manifest.path);
    } catch (err) {
      console.warn(`[ext:host] failed to delete folder for "${id}":`, err);
    }
    useExtensionStore.getState().removeExtension(id);
  }
}

/**
 * Clean up all hot-reload listeners and deactivate all extensions.
 */
export function shutdownExtensionHost(): void {
  lspManager.shutdownAll();
  hotReloadCleanup?.();
  hotReloadCleanup = null;
  for (const id of activeExtensions.keys()) {
    deactivateExtension(id);
  }
  // Also unwatch all filesystem watchers
  unwatchAll().catch(() => {});
}

function store_setLoading(val: boolean) {
  const set = useExtensionStore.getState().setLoading;
  if (set) set(val);
}
