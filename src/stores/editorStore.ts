import { create } from "zustand";
import * as monaco from "monaco-editor";
import { readFile, writeFile } from "@/tauri";
import { getFileName, getLanguageFromPath } from "@/lib/languages";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";
import { ContentStore } from "@/lib/contentStore";
import type { EditorStoreState, Tab } from "@/types/editor";

// Undo history is lost when the Monaco model is disposed
function disposeMonacoModel(path: string): void {
  const model = monaco.editor.getModel(monaco.Uri.file(path));
  model?.dispose();
}

function makeTab(path: string, content: string, language?: string, encoding?: string): Tab {
  return {
    id: path,
    path,
    name: getFileName(path),
    language: language ?? getLanguageFromPath(path),
    isDirty: false,
    savedContent: content,
    currentContent: content,
    cursor: { line: 1, col: 1 },
    encoding: encoding ?? "UTF-8",
    pinned: false,
  };
}

const saveEpochs = new Map<string, number>();
const pendingSaves = new Map<string, Promise<void>>();

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  openTabs: [],
  activeTabId: null,
  lastClosedTab: null,
  pendingExternalChange: null,
  tabHistory: [],

  openFile: async (path) => {
    const existing = get().openTabs.find((t) => t.id === path);
    if (existing) {
      set((s) => ({
        activeTabId: path,
        tabHistory: s.tabHistory[s.tabHistory.length - 1] === path
          ? s.tabHistory
          : [...s.tabHistory, path].slice(-50),
      }));
      return;
    }
    let content: string;
    try {
      content = await readFile(path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useToastStore.getState().addToast("error", `Failed to open ${path}: ${msg}`);
      return;
    }
    const isLarge = content.length > 5_000_000;
    if (isLarge) {
      ContentStore.set(path, content);
      console.warn("[editorStore] large file:", path, content.length);
    }
    const tab = { ...makeTab(path, isLarge ? "" : content), isLargeFile: isLarge };
    set((s) => {
      const insertAfter = s.activeTabId
        ? s.openTabs.findIndex((t) => t.id === s.activeTabId) + 1
        : s.openTabs.length;
      const next = [...s.openTabs];
      next.splice(insertAfter, 0, tab);
      return { openTabs: next, activeTabId: path, tabHistory: [...s.tabHistory, path].slice(-50) };
    });
  },

  closeTab: async (id, options) => {
    const tab = get().openTabs.find((t) => t.id === id);
    if (!tab) return true;
    if (tab.pinned && !options?.force) return false;
    if (tab.isDirty && !options?.force) return false;
    set((s) => {
      const idx = s.openTabs.findIndex((t) => t.id === id);
      const next = s.openTabs.filter((t) => t.id !== id);
      let nextActive = s.activeTabId;
      if (s.activeTabId === id) {
        if (next.length === 0) nextActive = null;
        else nextActive = next[Math.min(idx, next.length - 1)]?.id ?? null;
      }
      return { openTabs: next, activeTabId: nextActive, tabHistory: s.tabHistory.filter((t) => t !== id) };
    });
    ContentStore.delete(id);
    saveEpochs.delete(id);
    disposeMonacoModel(id);
    return true;
  },

  setActiveTab: (id) => {
    if (get().openTabs.some((t) => t.id === id)) {
      set((s) => ({
        activeTabId: id,
        tabHistory: s.tabHistory[s.tabHistory.length - 1] === id
          ? s.tabHistory
          : [...s.tabHistory, id].slice(-50),
      }));
    }
  },

  updateContent: (id, content) => {
    set((s) => ({
      openTabs: s.openTabs.map((t) => {
        if (t.id !== id) return t;
        if (t.isLargeFile) {
          ContentStore.set(t.path, content);
          return { ...t, isDirty: true };
        }
        return { ...t, currentContent: content, isDirty: content !== t.savedContent };
      }),
    }));
  },

  saveFile: (id) => {
    const existing = pendingSaves.get(id);
    if (existing) return existing;
    const promise = (async () => {
      const tab = get().openTabs.find((t) => t.id === id);
      if (!tab) return;
      const epoch = (saveEpochs.get(id) ?? 0) + 1;
      saveEpochs.set(id, epoch);
      let content = tab.isLargeFile ? (ContentStore.get(tab.path) ?? "") : tab.currentContent;
      if (useSettingsStore.getState().editor.formatOnSave) {
        const model = monaco.editor.getModel(monaco.Uri.file(tab.path));
        if (model) {
          const editors = monaco.editor.getEditors();
          const ed = editors.find((e) => e.getModel() === model);
          if (ed) {
            await ed.getAction("editor.action.formatDocument")?.run();
            content = model.getValue();
          }
        }
      }
      await writeFile(tab.path, content);
      if (tab.isLargeFile) ContentStore.set(tab.path, content);
      set((s) => ({
        openTabs: s.openTabs.map((t) =>
          t.id === id
            ? { ...t, savedContent: tab.isLargeFile ? "" : content, isDirty: false }
            : t,
        ),
      }));
    })();
    pendingSaves.set(id, promise);
    void promise.finally(() => pendingSaves.delete(id));
    return promise;
  },

  saveAll: async () => {
    await Promise.all(get().openTabs.filter((t) => t.isDirty).map((t) => get().saveFile(t.id)));
  },

  closeAll: async (options) => {
    if (!options?.force) {
      const dirty = get().openTabs.filter((t) => t.isDirty && !t.pinned);
      if (dirty.length > 0) return;
    }
    const all = get().openTabs;
    const pinned = all.filter((t) => t.pinned);
    const toClose = all.filter((t) => !t.pinned);
    const last = toClose[toClose.length - 1];
    for (const t of toClose) {
      ContentStore.delete(t.path);
      saveEpochs.delete(t.id);
      disposeMonacoModel(t.id);
    }
    set({
      openTabs: pinned,
      activeTabId: pinned.length > 0 ? pinned[0].id : null,
      lastClosedTab: last ? { path: last.path, name: last.name } : null,
    });
  },

  closeOthers: async (id, options) => {
    if (!options?.force) {
      const dirty = get().openTabs.filter((t) => t.isDirty && t.id !== id && !t.pinned);
      if (dirty.length > 0) return;
    }
    set((s) => {
      const keep = s.openTabs.filter((t) => t.id === id || t.pinned);
      const removed = s.openTabs.filter((t) => t.id !== id && !t.pinned);
      const last = removed[removed.length - 1];
      for (const t of removed) {
        ContentStore.delete(t.path);
        saveEpochs.delete(t.id);
        disposeMonacoModel(t.id);
      }
      return {
        openTabs: keep,
        activeTabId: id,
        lastClosedTab: last ? { path: last.path, name: last.name } : null,
      };
    });
  },

  closeToTheRight: (id) => {
    set((s) => {
      const idx = s.openTabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const keepLeft = s.openTabs.slice(0, idx + 1);
      const rightTabs = s.openTabs.slice(idx + 1);
      const pinnedRight = rightTabs.filter((t) => t.pinned);
      const dirtyRight = rightTabs.filter((t) => !t.pinned && t.isDirty);
      const toRemove = rightTabs.filter((t) => !t.pinned && !t.isDirty);
      for (const t of toRemove) {
        ContentStore.delete(t.path);
        saveEpochs.delete(t.id);
        disposeMonacoModel(t.id);
      }
      let active = s.activeTabId;
      const activeIdx = s.openTabs.findIndex((t) => t.id === active);
      if (active !== null && activeIdx > idx && !s.openTabs[activeIdx]?.pinned) {
        active = id;
      }
      return { openTabs: [...keepLeft, ...dirtyRight, ...pinnedRight], activeTabId: active };
    });
  },

  togglePin: (id) => {
    set((s) => {
      const next = s.openTabs.map((t) =>
        t.id === id ? { ...t, pinned: !t.pinned } : t,
      );
      next.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
      return { openTabs: next };
    });
  },

  cycleTab: (direction) => {
    const { openTabs, activeTabId } = get();
    if (openTabs.length < 2) return;
    const idx = openTabs.findIndex((t) => t.id === activeTabId);
    const nextIdx =
      direction === 1
        ? (idx + 1) % openTabs.length
        : (idx - 1 + openTabs.length) % openTabs.length;
    const nextId = openTabs[nextIdx].id;
    set((s) => ({
      activeTabId: nextId,
      tabHistory: s.tabHistory[s.tabHistory.length - 1] === nextId
        ? s.tabHistory
        : [...s.tabHistory, nextId].slice(-50),
    }));
  },

  reorderTab: (fromIndex, toIndex) => {
    set((s) => {
      const next = [...s.openTabs];
      const [moved] = next.splice(fromIndex, 1);
      const pinCount = next.filter((t) => t.pinned).length;
      if (moved.pinned) {
        toIndex = Math.min(toIndex, pinCount);
      } else {
        toIndex = Math.max(toIndex, pinCount);
      }
      next.splice(toIndex, 0, moved);
      return { openTabs: next };
    });
  },

  navigateBack: () => {
    const { openTabs, activeTabId, tabHistory } = get();
    if (tabHistory.length < 1) return;
    const history = [...tabHistory];
    if (history[history.length - 1] === activeTabId) {
      history.pop();
    }
    while (history.length > 0) {
      const prevId = history.pop();
      if (openTabs.some((t) => t.id === prevId)) {
        set({ activeTabId: prevId, tabHistory: history });
        return;
      }
    }
  },

  navigateForward: () => {
    // Stub — will be implemented with a forward history stack later
  },

  setCursor: (id, line, col) => {
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === id ? { ...t, cursor: { line, col } } : t,
      ),
    }));
  },

  handleExternalChange: (path) => {
    const { openTabs } = get();
    const tab = openTabs.find((t) => t.id === path);
    if (!tab) return;
    const epoch = saveEpochs.get(path) ?? 0;
    if (epoch > 0) {
      saveEpochs.delete(path);
      return;
    }
    if (tab.isDirty) {
      set({ pendingExternalChange: { path, tabName: tab.name } });
      return;
    }
    void (async () => {
      try {
        const disk = await readFile(path);
        if (tab.isLargeFile) ContentStore.set(path, disk);
        set((s) => ({
          openTabs: s.openTabs.map((t) =>
            t.id === path
              ? {
                  ...t,
                  currentContent: tab.isLargeFile ? "" : disk,
                  savedContent: tab.isLargeFile ? "" : disk,
                  isDirty: false,
                }
              : t,
          ),
        }));
      } catch (err) {
        console.error("[editorStore] external reload failed:", err);
      }
    })();
  },

  clearExternalChange: () => {
    set({ pendingExternalChange: null });
  },

  acceptExternalChange: async (path) => {
    const { openTabs } = get();
    const tab = openTabs.find((t) => t.id === path);
    if (!tab) {
      set({ pendingExternalChange: null });
      return;
    }
    try {
      const disk = await readFile(path);
      if (tab.isLargeFile) ContentStore.set(path, disk);
      set((s) => ({
        openTabs: s.openTabs.map((t) =>
          t.id === path
            ? {
                ...t,
                currentContent: tab.isLargeFile ? "" : disk,
                savedContent: tab.isLargeFile ? "" : disk,
                isDirty: false,
              }
            : t,
        ),
        pendingExternalChange: null,
      }));
    } catch (err) {
      console.error("[editorStore] acceptExternalChange failed:", err);
      set({ pendingExternalChange: null });
      useToastStore.getState().addToast(
        "error",
        `Failed to reload ${path}: ${(err as Error)?.message ?? "Unknown error"}`,
      );
    }
  },

  getActiveTab: () => {
    const { openTabs, activeTabId } = get();
    return openTabs.find((t) => t.id === activeTabId) ?? null;
  },

  setLastClosedTab: (tab) => set({ lastClosedTab: tab }),

  splitEditorId: null,
  splitPosition: 50,
  markdownPreview: false,

  setSplitEditor: (id) => set({ splitEditorId: id }),

  setSplitPosition: (position) => set({ splitPosition: position }),

  toggleSplitEditor: (id) => {
    set((s) => ({
      splitEditorId: s.splitEditorId === id ? null : id,
    }));
  },

  toggleMarkdownPreview: () => {
    set((s) => ({ markdownPreview: !s.markdownPreview }));
  },
}));
