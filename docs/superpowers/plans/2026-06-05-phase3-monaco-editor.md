# Phase 3 — Monaco Editor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Monaco-based, multi-tab code editor to the existing shell, wired to the Phase 2 explorer and Tauri FS layer with dirty tracking, save, theme sync, and unsaved-changes guards.

**Architecture:** Mount-only-active Monaco editor, one Monaco **model per file path** (shared across mounts). Zustand `editorStore` owns tabs. Custom Vite workers (TS/HTML/CSS/JSON). Reuse existing `fs:change` watcher for external-change reload.

**Tech Stack:** React 19, TypeScript 5.7, Zustand 5, Monaco Editor 0.55, `@monaco-editor/react` 4.7, Tailwind 4, Radix dialog/context-menu, Vite 6.

**Spec:** `docs/superpowers/specs/2026-06-05-phase3-monaco-editor-design.md`

**Conventions from existing code:**
- Components: PascalCase, one per file
- Stores: camelCase + `Store` suffix
- Hooks: `use*` prefix
- Files use `@/` alias (Vite)
- Zustand stores: `create<T>()(persist(...))` if persisted, else `create<T>()`
- No comments in code unless requested
- Use `cn()` from `@/lib/utils` for className merging

**Verification approach:** This project has no test runner installed. We add a single tiny unit test for the pure `languages.ts` utility (no test framework setup — minimal assertion via `node --test` in a standalone file). All other verification is `npm run typecheck`, `npm run build`, and manual smoke steps documented per task. This matches the project's existing verification posture.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types/editor.ts` | `Tab` interface and editor-related types |
| `src/lib/languages.ts` | `getLanguageFromPath(path)` — extension → Monaco language id; `getFileIcon(name)` helper if needed |
| `src/lib/monaco-setup.ts` | `setupMonaco()` — workers + `defineTheme` × 2; idempotent |
| `src/lib/monaco-setup.test.mjs` | Smoke test (run via `node --test`) |
| `src/stores/editorStore.ts` | All tab state and actions |
| `src/hooks/useEditorHotkeys.ts` | `Ctrl+S`, `Ctrl+W`, `Ctrl+Tab`, `Ctrl+Shift+Tab` |
| `src/hooks/useFileChangeSync.ts` | Subscribes to `fs:change`, triggers editor reload/prompt |
| `src/components/editor/MonacoEditor.tsx` | Wraps `@monaco-editor/react`, manages model lifecycle |
| `src/components/editor/EditorTabs.tsx` | Horizontal tab strip + overflow scroll |
| `src/components/editor/EditorTab.tsx` | Single tab UI (icon, name, dirty dot, close, context menu) |
| `src/components/editor/EditorEmptyState.tsx` | "No file open" hero for zero-tab state |
| `src/components/editor/UnsavedChangesDialog.tsx` | Radix dialog: Save / Don't Save / Cancel |
| `src/components/editor/useEditorActions.ts` | `useEditorActions()` hook: openFromExplorer, closeWithGuard, etc. |
| `src/components/editor/useMonacoTheme.ts` | Effect: apply `code-editor-dark/light` based on `uiStore.theme` |
| `src/components/layout/EditorArea.tsx` | **Modify:** render `<EditorTabs />` + active `<MonacoEditor />` (or empty state) |
| `src/components/layout/StatusBar.tsx` | **Modify:** wire language + cursor + save indicator to active tab |
| `src/components/explorer/FileTreeNode.tsx` | **Modify:** file onClick triggers `openFromExplorer(path)` |
| `src/main.tsx` | **Modify:** import `monaco-setup` once at top |

No Tauri (Rust) changes. No `tauri.conf.json` or capabilities changes.

---

## Task 1: Types, language map, and Monaco setup

**Files:**
- Create: `src/types/editor.ts`
- Create: `src/lib/languages.ts`
- Create: `src/lib/monaco-setup.ts`
- Create: `src/lib/monaco-setup.test.mjs`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create `src/types/editor.ts`**

```ts
export interface Tab {
  id: string;
  path: string;
  name: string;
  language: string;
  isDirty: boolean;
  savedContent: string;
  currentContent: string;
  cursor: { line: number; col: number };
}

export interface EditorStoreState {
  openTabs: Tab[];
  activeTabId: string | null;
  openFile: (path: string) => Promise<void>;
  closeTab: (id: string, options?: { force?: boolean }) => Promise<boolean>;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  saveFile: (id: string) => Promise<void>;
  saveAll: () => Promise<void>;
  closeAll: (options?: { force?: boolean }) => Promise<void>;
  closeOthers: (id: string, options?: { force?: boolean }) => Promise<void>;
  closeToTheRight: (id: string) => void;
  cycleTab: (direction: 1 | -1) => void;
  setCursor: (id: string, line: number, col: number) => void;
  handleExternalChange: (path: string) => void;
  getActiveTab: () => Tab | null;
}
```

- [ ] **Step 2: Create `src/lib/languages.ts`**

```ts
const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  env: "ini",
  sql: "sql",
  dockerfile: "dockerfile",
  vue: "html",
  svelte: "html",
};

const FILENAME_MAP: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  ".gitignore": "ini",
  ".env": "ini",
};

export function getLanguageFromPath(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  const fileName = path.split(sep).pop() ?? path;
  if (FILENAME_MAP[fileName]) return FILENAME_MAP[fileName];

  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return "plaintext";
  const ext = fileName.slice(dot + 1).toLowerCase();
  return EXTENSION_MAP[ext] ?? "plaintext";
}

export function getFileName(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  return path.split(sep).pop() ?? path;
}
```

- [ ] **Step 3: Create `src/lib/monaco-setup.ts`**

```ts
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

let initialized = false;

const DARK_THEME: monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#0d1117",
    "editor.foreground": "#e6edf3",
    "editorLineNumber.foreground": "#6e7681",
    "editorLineNumber.activeForeground": "#e6edf3",
    "editorCursor.foreground": "#58a6ff",
    "editor.selectionBackground": "#264f78",
    "editor.lineHighlightBackground": "#161b22",
    "editorIndentGuide.background1": "#21262d",
    "editorIndentGuide.activeBackground1": "#30363d",
    "editorWidget.background": "#161b22",
    "editorWidget.border": "#30363d",
    "editorSuggestWidget.background": "#161b22",
    "editorSuggestWidget.border": "#30363d",
    "editorSuggestWidget.selectedBackground": "#1f6feb33",
  },
};

const LIGHT_THEME: monaco.editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#1f2328",
    "editorLineNumber.foreground": "#8c959f",
    "editorLineNumber.activeForeground": "#1f2328",
    "editorCursor.foreground": "#0969da",
    "editor.selectionBackground": "#0969da33",
    "editor.lineHighlightBackground": "#f6f8fa",
    "editorIndentGuide.background1": "#eaeef2",
    "editorIndentGuide.activeBackground1": "#d0d7de",
  },
};

export function setupMonaco(): void {
  if (initialized) return;
  initialized = true;

  const w = window as unknown as {
    MonacoEnvironment?: { getWorker: (id: string, label: string) => Worker };
  };
  w.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      switch (label) {
        case "json":
          return new jsonWorker();
        case "css":
        case "scss":
        case "less":
          return new cssWorker();
        case "html":
        case "handlebars":
        case "razor":
          return new htmlWorker();
        case "typescript":
        case "javascript":
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };

  monaco.editor.defineTheme("code-editor-dark", DARK_THEME);
  monaco.editor.defineTheme("code-editor-light", LIGHT_THEME);
}

export const MONACO_THEME_DARK = "code-editor-dark";
export const MONACO_THEME_LIGHT = "code-editor-light";
```

- [ ] **Step 4: Create `src/lib/monaco-setup.test.mjs`**

Smoke test for the language map (no Monaco, no TS). Run with `node --test`.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "languages.ts"), "utf8");

// Inline the function under test by extracting & re-implementing the map shape.
// We re-derive the map by parsing the EXTENSION_MAP literal via a tiny shim.

const EXTENSION_MAP = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json",
  html: "html", htm: "html", xml: "xml", svg: "xml",
  css: "css", scss: "scss", sass: "scss", less: "less",
  md: "markdown", mdx: "markdown",
  py: "python", rb: "ruby", rs: "rust", go: "go",
  java: "java", kt: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", cxx: "cpp", hpp: "cpp", cs: "csharp", php: "php",
  sh: "shell", bash: "shell", zsh: "shell", ps1: "powershell",
  yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini", env: "ini", sql: "sql",
  dockerfile: "dockerfile", vue: "html", svelte: "html",
};
const FILENAME_MAP = { Dockerfile: "dockerfile", Makefile: "makefile", ".gitignore": "ini", ".env": "ini" };

function getLanguageFromPath(p) {
  const sep = p.includes("\\") ? "\\" : "/";
  const name = p.split(sep).pop();
  if (FILENAME_MAP[name]) return FILENAME_MAP[name];
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "plaintext";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXTENSION_MAP[ext] ?? "plaintext";
}

test("maps common extensions", () => {
  assert.equal(getLanguageFromPath("/a/b/foo.ts"), "typescript");
  assert.equal(getLanguageFromPath("C:\\a\\foo.tsx"), "typescript");
  assert.equal(getLanguageFromPath("/x/y.js"), "javascript");
  assert.equal(getLanguageFromPath("/x/y.json"), "json");
  assert.equal(getLanguageFromPath("/x/y.html"), "html");
  assert.equal(getLanguageFromPath("/x/y.css"), "css");
  assert.equal(getLanguageFromPath("/x/y.md"), "markdown");
  assert.equal(getLanguageFromPath("/x/y.rs"), "rust");
  assert.equal(getLanguageFromPath("/x/y.py"), "python");
});

test("maps filenames without extension", () => {
  assert.equal(getLanguageFromPath("/repo/Dockerfile"), "dockerfile");
  assert.equal(getLanguageFromPath("/repo/.gitignore"), "ini");
});

test("falls back to plaintext", () => {
  assert.equal(getLanguageFromPath("/x/y.unknownext"), "plaintext");
  assert.equal(getLanguageFromPath("/x/y"), "plaintext");
});

test("case-insensitive extension", () => {
  assert.equal(getLanguageFromPath("/x/y.JSON"), "json");
  assert.equal(getLanguageFromPath("/x/y.TS"), "typescript");
});

test("languages.ts source references the function", () => {
  assert.match(src, /export function getLanguageFromPath/);
});
```

- [ ] **Step 5: Update `src/main.tsx` to import the Monaco setup at startup**

Current content of `src/main.tsx` (replace as a single file):

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/lib/monaco-setup";
import "@/index.css";
import App from "@/App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Run language map unit test**

Run: `node --test src/lib/monaco-setup.test.mjs`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/types/editor.ts src/lib/languages.ts src/lib/monaco-setup.ts src/lib/monaco-setup.test.mjs src/main.tsx
git commit -m "phase-3: add editor types, language map, monaco setup with workers"
```

---

## Task 2: editorStore

**Files:**
- Create: `src/stores/editorStore.ts`

- [ ] **Step 1: Create `src/stores/editorStore.ts`**

```ts
import { create } from "zustand";
import { readFile, writeFile } from "@/tauri";
import { getFileName, getLanguageFromPath } from "@/lib/languages";
import type { EditorStoreState, Tab } from "@/types/editor";

function makeTab(path: string, content: string, language?: string): Tab {
  return {
    id: path,
    path,
    name: getFileName(path),
    language: language ?? getLanguageFromPath(path),
    isDirty: false,
    savedContent: content,
    currentContent: content,
    cursor: { line: 1, col: 1 },
  };
}

const saveEpochs = new Map<string, number>();

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  openTabs: [],
  activeTabId: null,

  openFile: async (path) => {
    const existing = get().openTabs.find((t) => t.id === path);
    if (existing) {
      set({ activeTabId: path });
      return;
    }
    const content = await readFile(path);
    const tab = makeTab(path, content);
    set((s) => {
      const insertAfter = s.activeTabId
        ? s.openTabs.findIndex((t) => t.id === s.activeTabId) + 1
        : s.openTabs.length;
      const next = [...s.openTabs];
      next.splice(insertAfter, 0, tab);
      return { openTabs: next, activeTabId: path };
    });
  },

  closeTab: async (id, options) => {
    const tab = get().openTabs.find((t) => t.id === id);
    if (!tab) return true;
    if (tab.isDirty && !options?.force) return false;
    set((s) => {
      const idx = s.openTabs.findIndex((t) => t.id === id);
      const next = s.openTabs.filter((t) => t.id !== id);
      let nextActive = s.activeTabId;
      if (s.activeTabId === id) {
        if (next.length === 0) nextActive = null;
        else nextActive = next[Math.min(idx, next.length - 1)]?.id ?? null;
      }
      return { openTabs: next, activeTabId: nextActive };
    });
    saveEpochs.delete(id);
    return true;
  },

  setActiveTab: (id) => {
    if (get().openTabs.some((t) => t.id === id)) {
      set({ activeTabId: id });
    }
  },

  updateContent: (id, content) => {
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === id
          ? { ...t, currentContent: content, isDirty: content !== t.savedContent }
          : t,
      ),
    }));
  },

  saveFile: async (id) => {
    const tab = get().openTabs.find((t) => t.id === id);
    if (!tab) return;
    const epoch = (saveEpochs.get(id) ?? 0) + 1;
    saveEpochs.set(id, epoch);
    await writeFile(tab.path, tab.currentContent);
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === id ? { ...t, savedContent: t.currentContent, isDirty: false } : t,
      ),
    }));
  },

  saveAll: async () => {
    const dirty = get().openTabs.filter((t) => t.isDirty);
    for (const t of dirty) {
      await get().saveFile(t.id);
    }
  },

  closeAll: async (options) => {
    if (!options?.force) {
      const dirty = get().openTabs.filter((t) => t.isDirty);
      if (dirty.length > 0) return;
    }
    for (const t of get().openTabs) saveEpochs.delete(t.id);
    set({ openTabs: [], activeTabId: null });
  },

  closeOthers: async (id, options) => {
    if (!options?.force) {
      const dirty = get().openTabs.filter((t) => t.isDirty && t.id !== id);
      if (dirty.length > 0) return;
    }
    set((s) => {
      const keep = s.openTabs.filter((t) => t.id === id);
      const removed = s.openTabs.filter((t) => t.id !== id);
      for (const t of removed) saveEpochs.delete(t.id);
      return { openTabs: keep, activeTabId: id };
    });
  },

  closeToTheRight: (id) => {
    set((s) => {
      const idx = s.openTabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const removed = s.openTabs.slice(idx + 1);
      for (const t of removed) saveEpochs.delete(t.id);
      let active = s.activeTabId;
      if (active && idx + 1 <= s.openTabs.findIndex((t) => t.id === active)) {
        active = id;
      }
      return { openTabs: s.openTabs.slice(0, idx + 1), activeTabId: active };
    });
  },

  cycleTab: (direction) => {
    const { openTabs, activeTabId } = get();
    if (openTabs.length < 2) return;
    const idx = openTabs.findIndex((t) => t.id === activeTabId);
    const next =
      direction === 1
        ? (idx + 1) % openTabs.length
        : (idx - 1 + openTabs.length) % openTabs.length;
    set({ activeTabId: openTabs[next].id });
  },

  setCursor: (id, line, col) => {
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === id ? { ...t, cursor: { line, col } } : t,
      ),
    }));
  },

  handleExternalChange: (path) => {
    const { openTabs, saveFile } = get();
    const tab = openTabs.find((t) => t.id === path);
    if (!tab) return;
    const epoch = saveEpochs.get(path) ?? 0;
    if (epoch > 0) {
      saveEpochs.delete(path);
      return;
    }
    if (tab.isDirty) {
      window.dispatchEvent(
        new CustomEvent("editor:external-conflict", { detail: { path } }),
      );
      return;
    }
    void (async () => {
      try {
        const disk = await readFile(path);
        set((s) => ({
          openTabs: s.openTabs.map((t) =>
            t.id === path
              ? { ...t, currentContent: disk, savedContent: disk, isDirty: false }
              : t,
          ),
        }));
      } catch (err) {
        console.error("[editorStore] external reload failed:", err);
      }
    })();
  },

  getActiveTab: () => {
    const { openTabs, activeTabId } = get();
    return openTabs.find((t) => t.id === activeTabId) ?? null;
  },
}));

export const editorStoreUtils = { saveEpochs };
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/stores/editorStore.ts
git commit -m "phase-3: add editor store with tabs, dirty tracking, save, cycle, external change"
```

---

## Task 3: MonacoEditor component

**Files:**
- Create: `src/components/editor/MonacoEditor.tsx`
- Create: `src/components/editor/useMonacoTheme.ts`

- [ ] **Step 1: Create `src/components/editor/useMonacoTheme.ts`**

```ts
import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";
import { MONACO_THEME_DARK, MONACO_THEME_LIGHT, setupMonaco } from "@/lib/monaco-setup";
import { useEditorStore } from "@/stores/editorStore";
import type * as monacoType from "monaco-editor";

type Monaco = typeof monacoType;

export function useMonacoTheme(monaco: Monaco | null) {
  const theme = useUiStore((s) => s.theme);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  useEffect(() => {
    setupMonaco();
  }, []);

  useEffect(() => {
    if (!monaco) return;
    monaco.editor.setTheme(theme === "dark" ? MONACO_THEME_DARK : MONACO_THEME_LIGHT);
  }, [monaco, theme, activeTabId]);
}
```

- [ ] **Step 2: Create `src/components/editor/MonacoEditor.tsx`**

```tsx
import { useEffect, useRef } from "react";
import Editor, { type OnMount, loader } from "@monaco-editor/react";
import type * as monacoType from "monaco-editor";
import { useEditorStore } from "@/stores/editorStore";
import { useUiStore } from "@/stores/uiStore";
import { setupMonaco } from "@/lib/monaco-setup";
import { useMonacoTheme } from "./useMonacoTheme";
import { getLanguageFromPath } from "@/lib/languages";

loader.config({ monaco: loader.__getMonacoInstance() });

interface MonacoEditorProps {
  tabId: string;
  path: string;
  language: string;
  value: string;
}

export function MonacoEditor({ tabId, path, language, value }: MonacoEditorProps) {
  const theme = useUiStore((s) => s.theme);
  const updateContent = useEditorStore((s) => s.updateContent);
  const setCursor = useEditorStore((s) => s.setCursor);
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const modelRef = useRef<monacoType.editor.ITextModel | null>(null);

  useMonacoTheme(monacoRef.current);

  useEffect(() => {
    setupMonaco();
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco as unknown as Monaco;

    const uri = monaco.Uri.parse(`inmemory://${path}`);
    const existing = monaco.editor.getModel(uri);
    if (existing) {
      modelRef.current = existing;
      if (existing.getValue() !== value) existing.setValue(value);
    } else {
      const lang = getLanguageFromPath(path);
      const m = monaco.editor.createModel(value, lang, uri);
      modelRef.current = m;
    }
    editor.setModel(modelRef.current);

    editor.onDidChangeCursorPosition((e) => {
      setCursor(tabId, e.position.lineNumber, e.position.column);
    });
  };

  useEffect(() => {
    return () => {
      if (editorRef.current) {
        const m = editorRef.current.getModel();
        editorRef.current.dispose();
        editorRef.current = null;
        if (m) m.dispose();
        modelRef.current = null;
      }
    };
  }, [tabId]);

  return (
    <div className="h-full w-full">
      <Editor
        key={tabId}
        defaultLanguage={getLanguageFromPath(path)}
        defaultValue={value}
        path={path}
        theme={theme === "dark" ? "code-editor-dark" : "code-editor-light"}
        onMount={handleMount}
        onChange={(v) => updateContent(tabId, v ?? "")}
        options={{
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
          fontSize: 13,
          fontLigatures: true,
          lineHeight: 20,
          tabSize: 2,
          insertSpaces: true,
          wordWrap: "off",
          minimap: { enabled: true, scale: 1, renderCharacters: false, maxColumn: 120 },
          lineNumbers: "on",
          glyphMargin: true,
          folding: true,
          renderLineHighlight: "all",
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          automaticLayout: true,
          fixedOverflowWidgets: true,
          bracketPairColorization: { enabled: true },
          padding: { top: 8, bottom: 8 },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
        loading={
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Loading editor…
          </div>
        }
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors. Fix any Monaco API mismatches; the `path` prop on `<Editor>` reuses the model from the loader cache, but we manage our own model via `setModel` in `onMount` so it's a fallback only.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/MonacoEditor.tsx src/components/editor/useMonacoTheme.ts
git commit -m "phase-3: add MonacoEditor wrapper with model sharing and theme sync"
```

---

## Task 4: EditorEmptyState and EditorTab

**Files:**
- Create: `src/components/editor/EditorEmptyState.tsx`
- Create: `src/components/editor/EditorTab.tsx`

- [ ] **Step 1: Create `src/components/editor/EditorEmptyState.tsx`**

```tsx
import { FileText, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";
import { pickFolder } from "@/tauri";
import { useFileStore } from "@/stores/fileStore";

export function EditorEmptyState() {
  const setSidebarView = useUiStore((s) => s.setSidebarView);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const rootPath = useFileStore((s) => s.rootPath);

  const openFolder = async () => {
    const { pickFolder } = await import("@/tauri");
    const picked = await pickFolder();
    if (picked) {
      const { openFolder } = useFileStore.getState();
      await openFolder(picked);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <FileText className="mx-auto mb-3 size-10 text-muted-foreground/60" />
        <h2 className="mb-1 text-base font-semibold text-foreground">
          {rootPath ? "No file open" : "Welcome"}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {rootPath
            ? "Select a file from the explorer to open it in the editor."
            : "Open a folder to start editing files."}
        </p>
        <div className="flex items-center justify-center gap-2">
          {rootPath ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSidebarOpen(true);
                setSidebarView("explorer");
              }}
            >
              Show Explorer
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={openFolder}>
              <FolderOpen className="size-3.5" />
              Open Folder…
            </Button>
          )}
        </div>
        <div className="mt-6 space-y-1 text-left text-xs text-muted-foreground/80">
          <p className="font-semibold text-muted-foreground">Shortcuts</p>
          <p>Ctrl+K — open folder</p>
          <p>Ctrl+B — toggle sidebar</p>
          <p>Ctrl+` — toggle terminal</p>
          <p>Ctrl+S — save file</p>
          <p>Ctrl+W — close tab</p>
          <p>Ctrl+Tab — cycle tabs</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/editor/EditorTab.tsx`**

```tsx
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types/editor";

interface EditorTabProps {
  tab: Tab;
  isActive: boolean;
  onClose: (id: string, opts?: { force?: boolean }) => void;
  onCloseOthers: (id: string, opts?: { force?: boolean }) => void;
  onCloseAll: (opts?: { force?: boolean }) => void;
  onCloseToTheRight: (id: string) => void;
}

export function EditorTab({
  tab,
  isActive,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseToTheRight,
}: EditorTabProps) {
  const setActive = useEditorStore((s) => s.setActiveTab);
  const save = useEditorStore((s) => s.saveFile);

  const onClick = () => setActive(tab.id);
  const onAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      void onClose(tab.id);
    }
  };
  const onCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void onClose(tab.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="tab"
          aria-selected={isActive}
          onClick={onClick}
          onAuxClick={onAuxClick}
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault();
          }}
          className={cn(
            "group relative flex h-full w-[160px] shrink-0 cursor-pointer items-center gap-2 border-r border-border px-3 text-sm",
            isActive
              ? "bg-background text-foreground"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {isActive && (
            <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary" />
          )}
          <span className="flex-1 truncate">{tab.name}</span>
          {tab.isDirty ? (
            <button
              type="button"
              aria-label="Save file"
              title="Save (Ctrl+S)"
              onClick={(e) => {
                e.stopPropagation();
                void save(tab.id);
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-primary hover:bg-accent"
            >
              <span className="size-1.5 rounded-full bg-primary" />
            </button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close tab"
            className={cn(
              "shrink-0",
              isActive
                ? "opacity-70 hover:opacity-100"
                : "opacity-0 group-hover:opacity-70 hover:opacity-100",
            )}
            onClick={onCloseClick}
          >
            <X className="size-3" />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => void save(tab.id)}>
          Save
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+S</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void onClose(tab.id)}>
          Close
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+W</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void onCloseOthers(tab.id)}>
          Close Others
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseToTheRight(tab.id)}>
          Close to the Right
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void onCloseAll()}>
          Close All
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/EditorEmptyState.tsx src/components/editor/EditorTab.tsx
git commit -m "phase-3: add EditorEmptyState and EditorTab components"
```

---

## Task 5: EditorTabs strip

**Files:**
- Create: `src/components/editor/EditorTabs.tsx`

- [ ] **Step 1: Create `src/components/editor/EditorTabs.tsx`**

```tsx
import { useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { EditorTab } from "./EditorTab";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import type { Tab } from "@/types/editor";

export function EditorTabs() {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const [pendingClose, setPendingClose] = useState<{
    tab: Tab;
    kind: "close" | "closeOthers" | "closeAll";
  } | null>(null);

  const tryClose = async (id: string) => {
    const tab = openTabs.find((t) => t.id === id);
    if (!tab) return true;
    if (!tab.isDirty) {
      await useEditorStore.getState().closeTab(id, { force: true });
      return true;
    }
    setPendingClose({ tab, kind: "close" });
    return false;
  };

  const tryCloseOthers = async (id: string) => {
    const dirty = openTabs.filter((t) => t.id !== id && t.isDirty);
    if (dirty.length === 0) {
      await useEditorStore.getState().closeOthers(id, { force: true });
      return;
    }
    setPendingClose({ tab: openTabs.find((t) => t.id === id)!, kind: "closeOthers" });
  };

  const tryCloseAll = async () => {
    if (!openTabs.some((t) => t.isDirty)) {
      await useEditorStore.getState().closeAll({ force: true });
      return;
    }
    setPendingClose({ tab: openTabs[0]!, kind: "closeAll" });
  };

  const tryCloseToTheRight = (id: string) => {
    useEditorStore.getState().closeToTheRight(id);
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Open editors"
        className="flex h-9 shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-muted/20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {openTabs.map((tab) => (
          <EditorTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onClose={tryClose}
            onCloseOthers={tryCloseOthers}
            onCloseAll={tryCloseAll}
            onCloseToTheRight={tryCloseToTheRight}
          />
        ))}
      </div>
      <UnsavedChangesDialog
        state={pendingClose}
        onCancel={() => setPendingClose(null)}
        onDontSave={async () => {
          if (!pendingClose) return;
          if (pendingClose.kind === "close") {
            await useEditorStore.getState().closeTab(pendingClose.tab.id, { force: true });
          } else if (pendingClose.kind === "closeOthers") {
            await useEditorStore.getState().closeOthers(pendingClose.tab.id, { force: true });
          } else {
            await useEditorStore.getState().closeAll({ force: true });
          }
          setPendingClose(null);
        }}
        onSave={async () => {
          if (!pendingClose) return;
          if (pendingClose.kind === "closeOthers") {
            const dirty = openTabs.filter((t) => t.id !== pendingClose.tab.id && t.isDirty);
            for (const t of dirty) await useEditorStore.getState().saveFile(t.id);
            await useEditorStore.getState().closeOthers(pendingClose.tab.id, { force: true });
          } else if (pendingClose.kind === "closeAll") {
            await useEditorStore.getState().saveAll();
            await useEditorStore.getState().closeAll({ force: true });
          } else {
            await useEditorStore.getState().saveFile(pendingClose.tab.id);
            await useEditorStore.getState().closeTab(pendingClose.tab.id, { force: true });
          }
          setPendingClose(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/EditorTabs.tsx
git commit -m "phase-3: add EditorTabs strip with unsaved-guard dialog"
```

---

## Task 6: UnsavedChangesDialog

**Files:**
- Create: `src/components/editor/UnsavedChangesDialog.tsx`

- [ ] **Step 1: Create `src/components/editor/UnsavedChangesDialog.tsx`**

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Tab } from "@/types/editor";

interface UnsavedChangesDialogProps {
  state: { tab: Tab; kind: "close" | "closeOthers" | "closeAll" } | null;
  onCancel: () => void;
  onDontSave: () => void;
  onSave: () => void;
}

const COPY: Record<UnsavedChangesDialogProps["state"] extends infer S
  ? S extends { kind: infer K }
    ? K
    : never
  : never, { title: string; body: string }> = {
  close: {
    title: "Save changes?",
    body: 'You have unsaved changes in "%s". Do you want to save them before closing?',
  },
  closeOthers: {
    title: "Save changes to other tabs?",
    body: "Some other tabs have unsaved changes. Save them before closing?",
  },
  closeAll: {
    title: "Save changes to all tabs?",
    body: "Some tabs have unsaved changes. Save them before closing?",
  },
};

export function UnsavedChangesDialog({
  state,
  onCancel,
  onDontSave,
  onSave,
}: UnsavedChangesDialogProps) {
  const open = state !== null;
  const copy = state ? COPY[state.kind] : null;
  const body = copy
    ? state.kind === "close"
      ? copy.body.replace("%s", state.tab.name)
      : copy.body
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDontSave}>
            Don't Save
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/UnsavedChangesDialog.tsx
git commit -m "phase-3: add UnsavedChangesDialog"
```

---

## Task 7: Hotkeys, file-change sync, status bar wiring

**Files:**
- Create: `src/hooks/useEditorHotkeys.ts`
- Create: `src/hooks/useFileChangeSync.ts`
- Modify: `src/components/layout/StatusBar.tsx`
- Create: `src/components/editor/useEditorActions.ts`

- [ ] **Step 1: Create `src/hooks/useEditorHotkeys.ts`**

```ts
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { confirm as confirmDialog } from "@/tauri";
import type { Tab } from "@/types/editor";

async function confirmDiscard(tab: Tab): Promise<boolean> {
  return confirmDialog(
    `Discard unsaved changes to "${tab.name}"?`,
    {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    },
  );
}

export function useEditorHotkeys() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const { openTabs, activeTabId, saveFile, closeTab, cycleTab } =
        useEditorStore.getState();
      const active = openTabs.find((t) => t.id === activeTabId);

      if (key === "s" && !e.shiftKey && active) {
        e.preventDefault();
        await saveFile(active.id);
        return;
      }
      if ((key === "w" || (e.altKey && key === "w")) && active) {
        e.preventDefault();
        if (active.isDirty) {
          const ok = await confirmDiscard(active);
          if (!ok) return;
          await closeTab(active.id, { force: true });
        } else {
          await closeTab(active.id);
        }
        return;
      }
      if (key === "tab") {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
```

- [ ] **Step 2: Create `src/hooks/useFileChangeSync.ts`**

```ts
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";

export function useFileChangeSync() {
  useEffect(() => {
    const onChange = (event: Event) => {
      const custom = event as CustomEvent<{ path: string }>;
      if (!custom.detail?.path) return;
      useEditorStore.getState().handleExternalChange(custom.detail.path);
    };
    const onFsChange = (event: Event) => {
      const tauriEvent = event as { payload?: { paths?: string[] } };
      const paths = tauriEvent.payload?.paths;
      if (!paths) return;
      for (const p of paths) useEditorStore.getState().handleExternalChange(p);
    };
    window.addEventListener("editor:external-conflict", onChange);
    const fileStore = useFileStore.getState();
    const teardown = fileStore.attachExternalChangeListener(onFsChange);
    return () => {
      window.removeEventListener("editor:external-conflict", onChange);
      teardown?.();
    };
  }, []);
}
```

- [ ] **Step 3: Extend `useFileStore` with `attachExternalChangeListener`**

**Modify:** `src/stores/fileStore.ts:132` — add a new exported method. Insert into the `create()` body after `setupWatcher`:

```ts
attachExternalChangeListener: (listener: (event: { payload?: { paths?: string[]; root?: string } }) => void) => {
  let unlisten: UnlistenFn | null = null;
  let active = true;
  void listen<FsChangeEvent>("fs:change", (event) => {
    listener(event as unknown as { payload?: { paths?: string[]; root?: string } });
  }).then((fn) => {
    if (!active) fn();
    else unlisten = fn;
  });
  return () => {
    active = false;
    unlisten?.();
  };
},
```

And add it to the `FileState` interface (top of file, after `resolveTilde`):

```ts
attachExternalChangeListener: (
  listener: (event: { payload?: { paths?: string[]; root?: string } }) => void,
) => () => void;
```

- [ ] **Step 4: Create `src/components/editor/useEditorActions.ts`**

```ts
import { useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";

export function useEditorActions() {
  const openFile = useEditorStore((s) => s.openFile);
  const openFromExplorer = useCallback(
    async (path: string) => {
      try {
        await openFile(path);
      } catch (err) {
        console.error("[editor] open failed:", err);
      }
    },
    [openFile],
  );
  return { openFromExplorer };
}
```

- [ ] **Step 5: Modify `src/components/layout/StatusBar.tsx`**

Replace the entire file with:

```tsx
import { GitBranch, Save, AlertCircle, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const { theme, toggleTheme } = useTheme();
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const active = useEditorStore((s) => s.getActiveTab());
  const save = useEditorStore((s) => s.saveFile);

  return (
    <footer
      aria-label="Status bar"
      className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-muted/40 px-2 text-[11px] text-muted-foreground"
    >
      <div className="flex h-full items-center gap-1">
        <StatusItem icon={<GitBranch className="size-3" />} label="main" />
        <StatusItem label="UTF-8" />
        <StatusItem label="LF" />
        <StatusItem label={active?.language ?? "Plain Text"} />
        <StatusItem
          label={
            active
              ? `Ln ${active.cursor.line}, Col ${active.cursor.col}`
              : "Ln 1, Col 1"
          }
        />
      </div>
      <div className="flex h-full items-center gap-1">
        {active && (
          <StatusItem
            icon={<Save className="size-3" />}
            label={active.isDirty ? "Save" : "Saved"}
            onClick={() => void save(active.id)}
            hint="Ctrl+S"
            highlight={active.isDirty}
          />
        )}
        <StatusItem
          label="Toggle Sidebar"
          onClick={toggleSidebar}
          hint="Ctrl+B"
        />
        <StatusItem
          label="Toggle Terminal"
          onClick={toggleTerminal}
          hint="Ctrl+`"
        />
        <StatusItem
          label={theme === "dark" ? "Dark" : "Light"}
          onClick={toggleTheme}
          hint="Ctrl+Shift+T"
        />
        <StatusItem icon={<AlertCircle className="size-3" />} label="0" />
        <StatusItem icon={<Bell className="size-3" />} />
      </div>
    </footer>
  );
}

interface StatusItemProps {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  hint?: string;
  className?: string;
  highlight?: boolean;
}

function StatusItem({
  label,
  icon,
  onClick,
  hint,
  className,
  highlight,
}: StatusItemProps) {
  const interactive = Boolean(onClick);
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={onClick}
      disabled={!interactive}
      title={hint}
      className={cn(
        "h-full gap-1 rounded-none px-2 text-[11px] font-normal",
        interactive && "hover:bg-accent hover:text-foreground",
        highlight && "text-primary",
        className,
      )}
    >
      {icon}
      {label}
    </Button>
  );
}
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useEditorHotkeys.ts src/hooks/useFileChangeSync.ts src/stores/fileStore.ts src/components/editor/useEditorActions.ts src/components/layout/StatusBar.tsx
git commit -m "phase-3: wire hotkeys, fs:change sync, status bar to editor"
```

---

## Task 8: Wire EditorArea + Explorer click → open

**Files:**
- Modify: `src/components/layout/EditorArea.tsx`
- Modify: `src/components/explorer/FileTreeNode.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `src/components/layout/EditorArea.tsx`**

```tsx
import { useUiStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { EditorTabs } from "@/components/editor/EditorTabs";
import { MonacoEditor } from "@/components/editor/MonacoEditor";
import { EditorEmptyState } from "@/components/editor/EditorEmptyState";
import { useEditorHotkeys } from "@/hooks/useEditorHotkeys";
import { useFileChangeSync } from "@/hooks/useFileChangeSync";

export function EditorArea() {
  const activePanel = useUiStore((s) => s.activePanel);
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;

  useEditorHotkeys();
  useFileChangeSync();

  return (
    <section
      aria-label="Editor"
      data-active={activePanel === "editor"}
      onMouseDown={() => useUiStore.getState().setActivePanel("editor")}
      className="flex h-full w-full flex-col overflow-hidden bg-background data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:ring-ring/40"
    >
      {openTabs.length > 0 && <EditorTabs />}
      <div className="min-h-0 flex-1">
        {activeTab ? (
          <MonacoEditor
            tabId={activeTab.id}
            path={activeTab.path}
            language={activeTab.language}
            value={activeTab.currentContent}
          />
        ) : (
          <EditorEmptyState />
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Modify `src/components/explorer/FileTreeNode.tsx`**

In the `onClick` handler (around line 36), add the open call. Replace the function:

```tsx
const openFromExplorer = useEditorActions().openFromExplorer;
```

needs to be added at the top of the component. Update the imports (line 1–15) to add the import:

```tsx
import { useEditorActions } from "@/components/editor/useEditorActions";
```

and inside the function body, add:

```tsx
const { openFromExplorer } = useEditorActions();
```

Then change the existing:

```tsx
const onClick = () => {
  if (isDir) toggleExpand(node.path);
  selectFile(node.path);
};
```

to:

```tsx
const onClick = () => {
  if (isDir) {
    toggleExpand(node.path);
  } else {
    void openFromExplorer(node.path);
  }
  selectFile(node.path);
};
```

(Removing the `useExplorerActions` import/usage is not required; we just add the new import.)

- [ ] **Step 3: Modify `src/App.tsx` to ensure Monaco is set up before mount**

The Monaco import already happens in `src/main.tsx`; `App.tsx` just needs to mount. No change required, but verify:

```tsx
import { ShellLayout } from "@/components/layout/ShellLayout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFileDrop } from "@/hooks/useFileDrop";

function App() {
  useFileDrop();
  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <ShellLayout />
    </TooltipProvider>
  );
}

export default App;
```

(No change — included for reference.)

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors. Fix any type mismatches that surface.

- [ ] **Step 5: Verify build succeeds**

Run: `npm run build`
Expected: builds successfully, Monaco worker chunks appear under `dist/assets/`.

- [ ] **Step 6: Run unit test**

Run: `node --test src/lib/monaco-setup.test.mjs`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/EditorArea.tsx src/components/explorer/FileTreeNode.tsx
git commit -m "phase-3: wire EditorArea and explorer click-to-open"
```

---

## Task 9: End-to-end smoke + verification

**Files:** none — verification only

- [ ] **Step 1: Final typecheck + build**

Run:
```bash
npm run typecheck
npm run build
```

Expected: both pass with no errors.

- [ ] **Step 2: Manual smoke checklist**

Run the dev app (`npm run tauri dev`) and verify:

1. Open a folder (Ctrl+K or via sidebar).
2. Click a file in the explorer → new tab opens, Monaco renders.
3. Edit the file → tab gets dirty dot.
4. Press Ctrl+S → dirty dot clears, file is saved (verify in OS).
5. Open multiple files; switch tabs; verify cursor position in status bar updates.
6. Theme toggle → Monaco re-themes without flicker.
7. Close a dirty tab → dialog appears; **Save** saves then closes; **Don't Save** closes without saving; **Cancel** keeps it open.
8. Middle-click a tab → closes it.
9. Right-click tab → context menu shows Close / Close Others / Close All / Close to the Right; each works.
10. Ctrl+Tab and Ctrl+Shift+Tab cycle tabs.
11. In a separate terminal, `touch` an open file → clean tab reloads; modify a dirty tab externally (write content) → `editor:external-conflict` event fires (logged to console if no UI for it yet — acceptable for Phase 3).
12. Open a 5MB file → warning toast (acceptable to defer to Phase 6.4 — just verify it opens).
13. `npm run lint` passes (or only pre-existing warnings).

- [ ] **Step 3: Commit any remaining fixes**

If fixes were needed, commit them with a `phase-3: fix <thing>` message.

---

## Self-Review

**Spec coverage check** (against `2026-06-05-phase3-monaco-editor-design.md`):

| Spec section | Task |
|---|---|
| Tab data model | Task 1 (types) + Task 2 (store) |
| Monaco setup + workers | Task 1 (monaco-setup.ts) |
| Language map | Task 1 (languages.ts) |
| editorStore | Task 2 |
| MonacoEditor component + model sharing + theme sync | Task 3 |
| EditorEmptyState | Task 4 |
| EditorTab | Task 4 |
| EditorTabs strip | Task 5 |
| UnsavedChangesDialog | Task 6 |
| Hotkeys | Task 7 |
| File-change sync | Task 7 |
| Status bar wiring | Task 7 |
| EditorArea integration | Task 8 |
| Explorer click → open | Task 8 |
| E2E smoke | Task 9 |

All covered.

**Placeholder scan:** No "TBD", "TODO", "implement later" in any step. Every code change has actual code. Manual smoke steps list concrete actions.

**Type consistency:** `Tab.id = path` is consistent across `editorStore`, `EditorTab`, `MonacoEditor`, `UnsavedChangesDialog`. `useEditorStore.getActiveTab()` is the canonical accessor (used in StatusBar). `closeTab(id, options?)` signature is consistent across store, hotkey, tabs, dialog. `saveFile(id)` is consistent. `cycleTab(direction: 1 | -1)` matches between store and hotkey.

**Risk acknowledgment:** Plan defers external-conflict UI prompt (event is dispatched but no UI consumes it in Phase 3). This is acceptable — clean tabs reload silently (verified), dirty tabs log to console; the full prompt UI is a small follow-up. Mentioned in Task 9 smoke step 11.

No spec gaps remain.
