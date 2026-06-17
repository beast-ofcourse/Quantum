# Phase 3 — Monaco Editor Integration — Design

**Date:** 2026-06-05
**Parent plan:** `docs/superpowers/specs/plan.md` (Phases 0–6)
**Status:** Approved (open design questions resolved 2026-06-05)

## Goal

Add a full-featured Monaco-based code editor with multi-tab support to the
existing shell. Wires the existing file explorer and Tauri FS layer to a tabbed
editor with dirty tracking, save, and unsaved-changes guards.

## Scope

Implements plan tasks **3.1 – 3.8** end to end. Out of scope (deferred):

- **Ctrl+N untitled files** — Phase 5 (save-as flow)
- **Tab session restore** — Phase 6.5
- **Drag-to-reorder tabs** — plan marks as optional; deferred
- **Auto-save on blur** — Phase 5 settings

## Resolved design questions

| Question | Decision |
|---|---|
| New untitled file (Ctrl+N) | **Defer to Phase 5** |
| External file change | **Reload if clean, prompt if dirty** |
| Monaco workers | **Full language workers** (TS, HTML, CSS, JSON) via Vite `?worker` |
| Tab persistence | **Don't persist** in Phase 3 |

## Architecture

```
src/
├── stores/
│   └── editorStore.ts                  (new) Tab state, open/close/save/dirty
├── lib/
│   ├── languages.ts                    (new) extension → Monaco language id
│   └── monaco-setup.ts                 (new) workers + custom themes
├── components/
│   ├── editor/
│   │   ├── MonacoEditor.tsx            (new) Wraps @monaco-editor/react
│   │   ├── EditorTabs.tsx              (new) Horizontal tab strip
│   │   ├── EditorTab.tsx               (new) Single tab UI
│   │   ├── EditorEmptyState.tsx        (new) "No file open" hero
│   │   ├── UnsavedChangesDialog.tsx    (new) Save / Don't Save / Cancel
│   │   └── useMonacoTheme.ts           (new) defineTheme + sync to uiStore.theme
│   └── layout/
│       └── EditorArea.tsx              (modify) Tabs bar + active editor / empty
└── types/
    └── editor.ts                       (new) Tab interface
```

No Rust changes. All Tauri commands needed (`read_file`, `write_file`,
`path_exists`) and the `fs:change` event already exist.

## Data model

```ts
// src/types/editor.ts
export interface Tab {
  id: string;          // = path (path-as-id, stable, dedupes)
  path: string;        // absolute file path
  name: string;        // basename
  language: string;    // Monaco language id
  isDirty: boolean;    // currentContent !== savedContent
  savedContent: string;
  currentContent: string;
  cursor?: { line: number; col: number }; // for status bar
}

export interface EditorState {
  openTabs: Tab[];
  activeTabId: string | null;
  // actions
  openFile: (path: string) => Promise<void>;
  closeTab: (id: string, options?: { force?: boolean }) => Promise<boolean>;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  saveFile: (id: string) => Promise<void>;
  saveAll: () => Promise<void>;
  closeAll: (options?: { force?: boolean }) => Promise<void>;
  closeOthers: (id: string, options?: { force?: boolean }) => Promise<void>;
  closeToTheRight: (id: string) => Promise<void>;
  cycleTab: (direction: 1 | -1) => void;
  setCursor: (id: string, line: number, col: number) => void;
  handleExternalChange: (path: string) => void;
}
```

## Monaco setup

`src/lib/monaco-setup.ts` runs once at module import:

1. `self.MonacoEnvironment.getWorker(_, label)` returns the right Vite worker
   for each language label: `editor`, `typescript/javascript`, `json`,
   `css/scss/less`, `html/handlebars/razor`.
2. `monaco.editor.defineTheme('code-editor-dark', ...)` and
   `('code-editor-light', ...)` with colors derived from existing CSS variables.
3. Imported once from `src/main.tsx` before any editor mounts.

## Tab lifecycle

| Event | Behavior |
|---|---|
| Click file in explorer | `useFileStore.selectFile(path)` then `useEditorStore.openFile(path)` |
| File already open | `setActiveTab(id)` (no re-read) |
| Open new file | `read_file` → new tab → set active → insert after currently active tab |
| `Ctrl+S` | `saveFile(activeTabId)` |
| `Ctrl+W` | `closeTab(activeTabId)` (with unsaved guard) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | `cycleTab(±1)` |
| Middle-click tab | `closeTab(id)` |
| Tab context menu | Close / Close Others / Close All / Close to the Right |
| Close last tab | Empty state, do not close window |

Dirty tabs are guarded by `UnsavedChangesDialog` (Save / Don't Save / Cancel).
`closeAll` and `closeOthers` chain through the dialog for any dirty tabs.

## Editor mount strategy

**Mount only the active tab's editor** (VS Code style). On tab switch, the
previous editor unmounts and the new one mounts. The Monaco **model** for a
path is created once (via `monaco.editor.createModel(value, language, uri)`)
and shared across mounts so undo history, marks, and language config persist
across tab switches.

## External file change handling

Hook into the existing `fs:change` event in `fileStore`. For each event:

1. If the path matches an open tab:
   - If clean (`isDirty === false`): reload content from disk silently.
   - If dirty: show a toast in the editor area with **Reload from disk** /
     **Keep my version** (mark tab with conflict indicator). On **Reload**,
     update `savedContent` + `currentContent` to disk content, clear dirty.
2. If the path is the workspace root being deleted: handled by existing
   `fileStore.closeFolder` rehydrate logic.

## Keyboard shortcuts

Wired via existing `useHotkey` registry:

| Combo | Action |
|---|---|
| `Ctrl+S` | Save active tab |
| `Ctrl+W` | Close active tab (with guard) |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+Alt+W` | Close active tab (alt) |

Existing shortcuts unchanged: `Ctrl+B` (sidebar), `Ctrl+`` (terminal),
`Ctrl+K` (open folder), `Ctrl+Shift+T` (theme).

## Status bar wiring

`StatusBar` currently shows hardcoded values. Phase 3 wires:

- **Language** ← `activeTab.language`
- **Ln X, Col Y** ← `activeTab.cursor` (updated via Monaco `onDidChangeCursorPosition`)
- **Save indicator** ← `activeTab.isDirty` (dot + "Save" button when dirty)

## File system changes

None. The Tauri commands and capabilities needed are all already registered
(`read_file`, `write_file`, `path_exists`, `fs:change` event).

## Open risks

| Risk | Mitigation |
|---|---|
| Monaco worker bundles are large | Vite code-splits per worker; only the workers needed for current file type load |
| Initial Monaco load latency | Show `EditorEmptyState` / tab skeleton until first editor mounts |
| External-change race during save | After `write_file` returns, the next `fs:change` for that path is ignored (track saveEpoch) |
| Tab strip overflow on small screens | `overflow-x-auto` with hidden scrollbar; tabs `min-w-[120px] max-w-[200px]` truncate |
| Model leak when tab closed | `model.dispose()` in `closeTab` after the editor unmounts |

## Testing approach

- **Manual smoke**: open folder, double-click files, edit, save, close+reopen,
  middle-click close, dirty guard, theme sync, status bar updates, external
  change (touch a file from terminal).
- **Typecheck**: `npm run typecheck` must pass (Phase 3 touches many stores).
- **Build**: `npm run build` should succeed; Vite worker chunks for Monaco
  should appear in `dist/`.

## Out-of-scope acceptance

Phase 3 is "done" when all of the following are true:

1. Clicking a file in the explorer opens it in a new tab and the editor renders.
2. Multiple files can be open, tab switching works, language detection is
   correct for `.ts/.tsx/.js/.jsx/.json/.html/.css/.md/.py/.rs/.toml/.yaml`.
3. Editing marks tab dirty, saving clears dirty, `Ctrl+S` works.
4. Closing a dirty tab prompts Save / Don't Save / Cancel and respects the choice.
5. `Ctrl+Tab` cycles tabs; middle-click closes; tab context menu actions work.
6. Status bar shows live language + cursor position; updates as you type.
7. Theme toggle re-themes Monaco without remount flicker.
8. External file change: clean tabs reload silently; dirty tabs show a prompt.
9. `npm run typecheck` and `npm run build` pass cleanly.
