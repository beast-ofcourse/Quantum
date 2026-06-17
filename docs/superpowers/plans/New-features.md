# Feature Status & Productivity Roadmap

## New-features.md — Implementation Status

- [x] **Quick search in explorer** — Ctrl+Shift+E to focus explorer, then just start typing to filter/find files in the tree.
- [x] **Copy relative path from tab right-click** — Right-click a tab → "Copy Relative Path".
- [x] **Accidental close prevention** — If you hit Ctrl+W or click close on a tab with unsaved changes, show "Undo close" in the status bar for 5s.
- [x] **Open in Integrated Terminal** from explorer — Right-click a folder → "Open in Integrated Terminal".
- [ ] **Quick Open (Ctrl+P)** — Ctrl+Shift+P works for commands but fuzzy-find files is missing.
- [ ] **Live Share / collaboration** — Real-time multiplayer editing via CRDT/OT.
- [ ] **Multi-cursor + column selection tutorial** — Interactive first-launch guide for Monaco power features.

---

## Planned Features

### Feature 2: Auto-Save with Debounce — ✅ Implemented

**Overview:** Save the current file automatically N milliseconds after the last keystroke, without requiring Ctrl+S. Settings already exist in `settingsStore` (`general.autoSave: boolean`, `general.autoSaveDelay: number` — default 1000ms). Only the implementation is missing.

**Files:**
- Create: `src/hooks/useAutoSave.ts`
- Modify: `src/components/editor/MonacoEditor.tsx`
- Modify: `src/components/layout/StatusBar.tsx`

**Implementation:**

**Step 1: Create `src/hooks/useAutoSave.ts`**

A hook that watches for content changes and triggers saves after the configured delay:

```tsx
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useSettingsStore } from "@/stores/settingsStore";

export function useAutoSave(tabId: string, content: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentRef = useRef(content);

  useEffect(() => {
    const { autoSave, autoSaveDelay } = useSettingsStore.getState().general;
    if (!autoSave) return;

    const changed = content !== lastContentRef.current;
    lastContentRef.current = content;

    if (!changed) return;
    // Content changed, reset timer
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      useEditorStore.getState().saveFile(tabId);
    }, autoSaveDelay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tabId, content]);

  // Cleanup on unmount — flush pending save
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}
```

**Step 2: Use the hook in `MonacoEditor.tsx`**

Add the hook call inside the component body:
```tsx
import { useAutoSave } from "@/hooks/useAutoSave";

// Inside MonacoEditor component, after other hooks:
useAutoSave(tabId, value);
```

**Step 3: Add auto-save indicator to `StatusBar.tsx`**

After the existing Save/Saved status item (line 145-153), add an indicator when auto-save is active:

```tsx
// After the Save/Saved StatusItem:
{useSettingsStore.getState().general.autoSave && active && (
  <StatusItem icon={<Clock className="size-3" />} label="Auto" className="text-muted-foreground" hint={`Auto-save every ${useSettingsStore.getState().general.autoSaveDelay}ms`} />
)}
```

Import `Clock` from lucide-react. Subscribe to settings changes properly (use a store selector or a dedicated state variable that updates on settings change).

**Edge cases:**
- No tab open → hook receives empty/null, skips
- Auto-save disabled → hook immediately returns
- User manually saves → `saveFile` is idempotent (uses pending-save dedup)
- Large file → same debounce applies, won't save on every keystroke
- Format-on-save enabled (+ setting) → `saveFile` already handles format before writing (editorStore.ts lines 102-111)

---

### Feature 3: Breadcrumbs Navigation Bar — ✅ Implemented

**Overview:** Monaco's built-in `breadcrumbs: { enabled: true }` is already wired in `MonacoEditor.tsx` (line 73). These show symbol scopes (function/class/module names) as clickable segments. **This feature is already working** — open a `.ts` file and look at the top of the editor area.

What's **not** implemented is a VS Code-style file-system breadcrumbs bar showing `src / components / search / SearchSidebar.tsx` above the editor tab strip. Each segment would be clickable to reveal sibling files in a dropdown.

**Files:**
- Create: `src/components/editor/Breadcrumbs.tsx`
- Modify: `src/components/layout/EditorArea.tsx` — add Breadcrumbs between EditorTabs and MonacoEditor
- Modify: `src/components/editor/MonacoEditor.tsx` — reduce top padding when breadcrumbs are visible (optional)

**Implementation:**

**Step 1: Create `src/components/editor/Breadcrumbs.tsx`**

```tsx
import { useCallback } from "react";
import { ChevronRight, File } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { cn } from "@/lib/utils";

interface BreadcrumbsProps {
  path: string;
}

export function Breadcrumbs({ path }: BreadcrumbsProps) {
  const rootPath = useFileStore((s) => s.rootPath);

  if (!rootPath) return null;

  const relative = path.replace(rootPath.replace(/\\/g, "/"), "").replace(/^[/\\]/, "");
  const segments = relative.split(/[/\\]/).filter(Boolean);

  if (segments.length === 0) return null;

  const handleSegmentClick = (index: number) => {
    // Could open a quick picker of siblings at this level
    // For now: navigate to that directory in explorer
    const segmentPath = rootPath + "/" + segments.slice(0, index + 1).join("/");
    // Future: show dropdown with sibling files
  };

  return (
    <div className="flex h-6 shrink-0 items-center gap-0.5 border-b border-border bg-muted/20 px-3 text-xs text-muted-foreground">
      <File className="size-3 shrink-0 mr-0.5" />
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRight className="size-3 shrink-0" />}
          <button
            onClick={() => handleSegmentClick(i)}
            className={cn(
              "rounded px-0.5 py-0.5 hover:bg-accent hover:text-foreground transition-colors",
              i === segments.length - 1 && "text-foreground font-medium",
            )}
          >
            {seg}
          </button>
        </span>
      ))}
    </div>
  );
}
```

**Step 2: Integrate in `EditorArea.tsx`**

Add `Breadcrumbs` between `EditorTabs` and the MonacoEditor wrapper, inside the section:

```tsx
{openTabs.length > 0 && <EditorTabs />}
{activeTab && <Breadcrumbs path={activeTab.path} />}
<DebugToolbar />
<div className="min-h-0 flex-1">
  ...
</div>
```

**Step 3: Future enhancement (dropdown on click)**

Each segment click could open a small dropdown showing sibling files/directories at that path level. Would use a custom popover or the existing command palette pattern. This step is optional for the initial implementation.

---

### Feature 4: Git Gutter Decorations — ✅ Implemented

**Overview:** Show colored indicators in the Monaco editor gutter for modified (yellow), added (green), and deleted (red) lines. These update reactively when the file changes. Model after the existing `useDebugDecorations.ts` pattern.

**Files:**
- Create: `src/hooks/useGitGutterDecorations.ts`
- Modify: `src/components/editor/MonacoEditor.tsx` — use the hook
- Modify: `src/tauri/git.ts` — add `gitDiffHunksForFile` shortcut if needed (optional)

**Implementation:**

**Step 1: Create `src/hooks/useGitGutterDecorations.ts`**

Follow the `useDebugDecorations.ts` pattern exactly:

```tsx
import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";
import { getCurrentEditor, getMonacoModule } from "@/extensions/editorRef";
import { gitDiffHunks } from "@/tauri/git";
import type * as monaco from "monaco-editor";

const GUTTER_MODIFIED_CLASS = "git-gutter-modified";
const GUTTER_ADDED_CLASS = "git-gutter-added";
const GUTTER_DELETED_CLASS = "git-gutter-deleted";

function injectStyles(): void {
  const styleId = "git-gutter-style";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .${GUTTER_MODIFIED_CLASS} {
      background: #eab308;
      width: 3px !important;
      height: 100% !important;
      margin-left: 0;
    }
    .${GUTTER_ADDED_CLASS} {
      background: #22c55e;
      width: 3px !important;
      height: 100% !important;
      margin-left: 0;
    }
    .${GUTTER_DELETED_CLASS} {
      background: #ef4444;
      width: 3px !important;
      height: 100% !important;
      margin-left: 0;
    }
    .monaco-editor .${GUTTER_MODIFIED_CLASS} {
      border-left: 3px solid #eab308;
    }
    .monaco-editor .${GUTTER_ADDED_CLASS} {
      border-left: 3px solid #22c55e;
    }
    .monaco-editor .${GUTTER_DELETED_CLASS} {
      border-left: 3px solid #ef4444;
    }
  `;
  document.head.appendChild(style);
}

export function useGitGutterDecorations(): void {
  const decorationIdsRef = useRef<string[]>([]);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const rootPath = useFileStore((s) => s.rootPath);

  const updateDecorations = useCallback(() => {
    const editor = getCurrentEditor();
    const monacoModule = getMonacoModule();
    if (!editor || !monacoModule || !rootPath) return;

    const model = editor.getModel();
    if (!model) return;

    const filePath = model.uri.path;
    injectStyles();

    // Fetch diff hunks for this file
    gitDiffHunks(rootPath, filePath)
      .then((hunks) => {
        const decorations: monaco.editor.IModelDeltaDecoration[] = [];
        for (const hunk of hunks) {
          for (const line of hunk.lines) {
            let className = "";
            if (line.type === "added") className = GUTTER_ADDED_CLASS;
            else if (line.type === "removed") className = GUTTER_DELETED_CLASS;
            else if (line.type === "context") continue;
            else className = GUTTER_MODIFIED_CLASS;

            const lineNum = line.newLineNumber ?? line.oldLineNumber;
            if (!lineNum) continue;

            decorations.push({
              range: new monacoModule.Range(lineNum, 1, lineNum, 1),
              options: {
                isWholeLine: true,
                className: className,
              },
            });
          }
        }
        decorationIdsRef.current = editor.deltaDecorations(
          decorationIdsRef.current,
          decorations,
        );
      })
      .catch(() => {
        // File not tracked by git — clear decorations
        decorationIdsRef.current = editor.deltaDecorations(
          decorationIdsRef.current,
          [],
        );
      });
  }, [rootPath]);

  useEffect(() => {
    const editor = getCurrentEditor();
    if (!editor) return;

    updateDecorations();

    // Re-run on content changes
    const contentDisposable = editor.onDidChangeModelContent(() => {
      updateDecorations();
    });

    // Re-run on model switch (file change)
    const modelDisposable = editor.onDidChangeModel(() => {
      updateDecorations();
    });

    return () => {
      contentDisposable.dispose();
      modelDisposable.dispose();
      // Clear decorations on unmount
      if (editor) {
        decorationIdsRef.current = editor.deltaDecorations(
          decorationIdsRef.current,
          [],
        );
      }
    };
  }, [activeTabId, rootPath, updateDecorations]);
}
```

**Step 2: Use the hook in `MonacoEditor.tsx`**

```tsx
import { useGitGutterDecorations } from "@/hooks/useGitGutterDecorations";

// Add after existing hooks:
useGitGutterDecorations();
```

**Key considerations:**
- Debounce the diff fetch to avoid flooding git on every keystroke (add 300ms debounce inside `updateDecorations`)
- The `DiffHunk` type from `src/types/git.ts` uses `oldLineNumber`/`newLineNumber` — for added lines, `oldLineNumber` is null; for deleted lines, `newLineNumber` is null
- Model after `useDebugDecorations.ts` — it handles editor lifecycle correctly
- The `glyphMargin: true` option is already set in MonacoEditor.tsx line 61

---

### Feature 5: Inline Diagnostics (Errors/Warnings in Editor) — ✅ Implemented

**Overview:** Monaco's built-in TypeScript worker already provides diagnostics for `.ts`/`.tsx` files automatically. The `monaco-editor` npm package bundles the TypeScript language service. When the editor is created with `language: "typescript"`, it loads the TS worker in the background and emits markers for errors/warnings.

**Current state:**
- Monaco's built-in diagnostics ARE active for any language Monaco supports natively (TypeScript, JavaScript, CSS, HTML, JSON, Markdown)
- The LSP bridge (`monacoBridge.ts`) adds diagnostics FOR PYTHON ONLY via `textDocument/publishDiagnostics`
- `ProblemsPanel.tsx` renders markers from `monaco.editor.getModelMarkers()` which includes ALL markers (both built-in and LSP)

**What this means:** Inline diagnostics for TypeScript/JavaScript already work. Open a `.ts` file with a type error and you'll see red squiggles. The problems panel already shows them (bottom panel → Problems tab).

**What's missing:**
1. A **problem count badge** in the activity bar / status bar (the `AlertCircle` icon in StatusBar at line 170 shows "0" — it's hardcoded)
2. **Auto-refresh problems panel** when the active file changes
3. **Diagnostics for non-Monaco languages** (e.g., Python without the LSP server) — needs a generic `lint_file` backend command

**Implementation Plan (3 items):**

**Item 5a: Live problem count in StatusBar**

Modify `src/components/layout/StatusBar.tsx` line 170 to show the actual count:

```tsx
// Replace:
<StatusItem icon={<AlertCircle className="size-3" />} label="0" />
// With:
const problemCount = useMemo(() => {
  const markers = monaco.editor.getModelMarkers({});
  return markers.filter(m => m.severity === monaco.MarkerSeverity.Error || m.severity === monaco.MarkerSeverity.Warning).length;
}, [ /* needs reactive update trigger */ ]);
<StatusItem icon={<AlertCircle className="size-3" />} label={String(problemCount)} onClick={() => { setActivePanelInZone("bottom", "problems"); setZoneVisibility("bottom", true); }} />
```

Reactivity: Use a zustand store subscription pattern or poll markers on file change events. Simplest approach: create a tiny `diagnosticStore` that tracks total counts and updates on a debounced interval.

**Item 5b: Auto-refresh ProblemsPanel**

In `ProblemsPanel.tsx`, subscribe to monaco model marker changes:
```tsx
useEffect(() => {
  const disposable = monaco.editor.onDidChangeMarkers(() => {
    refreshMarkers();
  });
  return () => disposable.dispose();
}, []);
```

This is already partially supported by Monaco's `onDidChangeMarkers` event.

**Item 5c: Generic lint backend (future, optional)**

Add a `lint_file` Tauri command that runs ESLint or the TypeScript compiler on a single file and returns diagnostics:
```rust
#[tauri::command]
pub async fn lint_file(path: String) -> Result<Vec<Diagnostic>, String> {
    // Run eslint on the file, parse JSON output
    // Or run tsc --noEmit on the file
}
```

Frontend: Call this on file save and set markers via `monaco.editor.setModelMarkers()`.

**Files to modify (item 5a+5b):**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/terminal/ProblemsPanel.tsx`
- Create: `src/stores/diagnosticStore.ts` (optional, for reactive counts)
- Create: `src-tauri/src/commands/lint.rs` + register command (optional, for generic lint)

---

### Feature 7: Split Editor (Side-by-Side Tabs) — ✅ Implemented

**Overview:** Allow splitting the editor area into 2+ panes (horizontal or vertical), each showing a different file. Uses `Resizer` between panes. Each pane has its own MonacoEditor instance, tabs, and active file.

**Files:**
- Modify: `src/stores/editorStore.ts` — add split state
- Create: `src/components/editor/EditorSplitView.tsx`
- Modify: `src/components/editor/EditorArea.tsx` — split awareness
- Modify: `src/components/layout/ShellLayout.tsx` — command registration
- Modify: `src/lib/defaultKeybindings.ts` — Ctrl+\ for split

**Implementation:**

**Step 1: Add split state to `editorStore.ts`**

```tsx
// Types to add:
export interface EditorSplit {
  id: string;
  activeTabId: string | null;
  tabIds: string[];
  size: number; // flex ratio or pixel size
}

// State additions:
splits: EditorSplit[];
splitDirection: "horizontal" | "vertical";
activeSplitId: string;

// Actions:
splitEditor: (direction?: "horizontal" | "vertical") => void;
closeSplit: (splitId: string) => void;
setActiveSplit: (splitId: string) => void;
moveTabToSplit: (tabId: string, targetSplitId: string) => void;
```

Default state: single split with `[{ id: "main", activeTabId: initialActive, tabIds: allTabIds, size: 1 }]`.

`splitEditor("horizontal")` action:
1. If only one split exists, create a second split
2. The new split gets a copy of the split direction
3. Each split gets half the tabs (or the new one starts empty)
4. Both splits get `size: 0.5` (flex ratio)

`closeSplit(splitId)` action:
1. Move all tabs from closing split to remaining split
2. If only one split remains, collapse back to unsplit view

**Step 2: Create `EditorSplitView.tsx`**

```tsx
import { useEditorStore } from "@/stores/editorStore";
import { Resizer } from "@/components/layout/Resizer";
import { EditorArea } from "./EditorArea";

export function EditorSplitView() {
  const splits = useEditorStore((s) => s.splits);
  const splitDirection = useEditorStore((s) => s.splitDirection);

  if (splits.length === 1) {
    return <EditorArea splitId={splits[0].id} />;
  }

  return (
    <div className={`flex min-h-0 flex-1 ${splitDirection === "vertical" ? "flex-col" : "flex-row"}`}>
      {splits.map((split, i) => (
        <>
          <div key={split.id} className="min-h-0 min-w-0 flex-1" style={{ flex: split.size }}>
            <EditorArea splitId={split.id} />
          </div>
          {i < splits.length - 1 && (
            <Resizer
              orientation={splitDirection === "vertical" ? "horizontal" : "vertical"}
              onResize={(delta) => {
                // Adjust split sizes
              }}
            />
          )}
        </>
      ))}
    </div>
  );
}
```

**Step 3: Modify `EditorArea.tsx`**

Accept an optional `splitId` prop. When `splitId` is provided, use `splits.find(s => s.id === splitId)` to get the tabs for that split instead of the global `activeTabId`.

**Step 4: Register Ctrl+\ command**

In `ShellLayout.tsx`:
```tsx
{
  id: "editor.split",
  label: "Split Editor",
  category: "Editor",
  keybinding: formatKeybinding("Ctrl+\\"),
  action: () => useEditorStore.getState().splitEditor("horizontal"),
}
```

In `defaultKeybindings.ts`:
```tsx
"editor.split": { combo: "mod+\\", description: "Split Editor", category: "Editor" },
```

**Key considerations:**
- Each split needs its own `MonacoEditor` instance — the `key={tabId}` prop handles remounting
- `Resizer` already supports both horizontal and vertical orientations
- The `EditorTabs` component needs split awareness (show only tabs for the current split)
- Drag-and-drop tabs between splits is a future enhancement

---

### Feature 8: Go to Definition / Peek Definition — ✅ Implemented

**Overview:** Monaco's built-in TypeScript worker provides Go to Definition for `.ts`/`.js` files automatically. For Python, the LSP bridge provides it (when the Python LSP server is running). What's missing is:
1. Ensuring Ctrl+click works (Monaco's default is Ctrl+click for definition)
2. Adding a right-click context menu item for "Go to Definition"
3. Adding a backend-based fallback for unsupported languages

**Current state:**
- TypeScript: Monaco's built-in TS worker handles this automatically. `registerDefinitionProvider` already runs for TS inside Monaco's core.
- Python: LSP bridge registers a definition provider via `monacoBridge.ts` line 119-131
- Other languages: No provider registered → Ctrl+click does nothing

**Implementation Plan (2 items):**

**Item 8a: Ensure Ctrl+click / right-click → Go to Definition works for TS**

In `MonacoEditor.tsx`, add to `editorOptions`:
```tsx
const editorOptions = useMemo(() => ({
  // ... existing options
  definitionLinkOpensInPeek: true, // Open definition in peek widget
}), [settings.editor]);
```

This is already the default behavior — Monaco's TS worker registers definition providers automatically when the language is set to `typescript` or `javascript`. The `editorOptions` already enable this.

**Item 8b: Backend-based Go to Definition for non-TS languages**

Create `src-tauri/src/commands/search.rs` extension (or a new `definition.rs`) that uses ripgrep/grep to find symbol definitions:

```rust
#[tauri::command]
pub async fn find_definitions(
    root: String,
    symbol: String,
    file_path: String,
) -> Result<Vec<SearchMatch>, String> {
    // Strategy:
    // 1. If it's a git repo, use `git grep -n "function symbol\|class symbol\|const symbol" -- "*.ext"`
    // 2. If not a git repo, use walkdir with file extension filter
    // 3. Parse results into SearchMatch[] with path, line, column, lineContent
}
```

Frontend: Register a Monaco `DefinitionProvider` that calls this command:

```tsx
// In a new file src/lib/definitionProvider.ts
monaco.languages.registerDefinitionProvider(["*"], {
  provideDefinition: async (model, position) => {
    const word = model.getWordAtPosition(position);
    if (!word) return;
    const rootPath = useFileStore.getState().rootPath;
    if (!rootPath) return;
    const results = await invoke("find_definitions", {
      root: rootPath,
      symbol: word.word,
      filePath: model.uri.path,
    });
    return results.map(r => ({
      uri: monaco.Uri.file(r.path),
      range: new monaco.Range(r.line, r.column, r.line, r.column + r.matchLength),
    }));
  },
});
```

**Files to modify (item 8b):**
- Modify: `src-tauri/src/commands/search.rs` — add `find_definitions` command (or create new file)
- Modify: `src-tauri/src/commands/mod.rs` — register command
- Modify: `src-tauri/src/lib.rs` — register handler
- Create: `src/lib/definitionProvider.ts`
- Modify: `src/lib/monaco-setup.ts` — call the registration

---

## Implementation Order (Recommended)

| Order | Feature | Effort | Impact | Status |
|-------|---------|--------|--------|--------|
| 1 | **3. Breadcrumbs** | Low | Medium | ✅ |
| 2 | **8a. Go to Definition (TS)** | Low | High | ✅ |
| 3 | **5a+5b. Live problem count** | Low-Med | Medium | ✅ |
| 4 | **2. Auto-save** | Low | Medium | ✅ |
| 5 | **4. Git gutter** | Medium | High | ✅ |
| 6 | **7. Split editor** | High | High | ✅ |
| 7 | **8b. Backend definition provider** | Medium | Medium | ✅ |
