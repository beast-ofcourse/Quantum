# Editor Quality-of-Life Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 independent features: quick file search in explorer, copy relative path from tab right-click, accidental close prevention with undo, and open in integrated terminal from explorer context menu.

**Architecture:** Four independent features, each touching 1-3 files. No shared state between them. Can be implemented in any order.

**Tech Stack:** React, zustand, shadcn/ui (context-menu, input, toast), radix-ui (dialog), Tauri (terminal PTY, filesystem)

---

### Task 1: Quick Search in Explorer (Ctrl+Shift+E)

**Files:**
- Modify: `src/components/explorer/FileTree.tsx`
- Modify: `src/components/layout/ShellLayout.tsx` (command registration for `view.explorer`)

- [ ] **Step 1: Add search state and JSX to FileTree**

Add a search input below the FileTree header. Use the existing `<Input>` component. The input is hidden when empty and not focused. Show it when Ctrl+Shift+E is pressed or when user starts typing (capture keydown).

```tsx
// Add to FileTree component body, after the header and before error div:
const [filterQuery, setFilterQuery] = useState("");
const filterInputRef = useRef<HTMLInputElement>(null);
```

Add a hotkey to focus the search:
```tsx
useHotkey({
  combo: "mod+shift+e",
  commandId: "view.explorer",
  description: "Focus explorer search",
  handler: () => {
    filterInputRef.current?.focus();
  },
});
```

Add the search input JSX after the `{error && ...}` div:
```tsx
<div className={cn("relative border-b border-border px-2 py-1", !filterQuery && "hidden")}>
  <Input
    ref={filterInputRef}
    value={filterQuery}
    onChange={(e) => setFilterQuery(e.target.value)}
    placeholder="Search files…"
    className="h-7 text-xs"
    onKeyDown={(e) => {
      if (e.key === "Escape") {
        setFilterQuery("");
        filterInputRef.current?.blur();
      }
    }}
    onBlur={() => {
      if (!filterQuery) {
        // Keep visible if has content
      }
    }}
  />
</div>
```

- [ ] **Step 2: Add filter logic to FileTree**

Add a recursive filter function after `getChildNames`:
```tsx
function filterTree(tree: FileNode[], query: string): FileNode[] {
  if (!query) return tree;
  const q = query.toLowerCase();
  function matches(node: FileNode): boolean {
    if (node.name.toLowerCase().includes(q)) return true;
    if (node.children) return node.children.some(matches);
    return false;
  }
  return tree.filter(matches).map((node) => {
    if (node.children) {
      const filtered = filterTree(node.children, query);
      return { ...node, children: filtered.length > 0 ? filtered : node.children };
    }
    return node;
  });
}
```

Use it when rendering the tree:
```tsx
const displayTree = useMemo(() => filterTree(fileTree, filterQuery), [fileTree, filterQuery]);
```

Replace `fileTree.map(...)` with `displayTree.map(...)`.

- [ ] **Step 3: Update the view.explorer command in ShellLayout.tsx**

Modify the `view.explorer` command to also focus the search input:
```tsx
{
  id: "view.explorer",
  label: "Show Explorer",
  category: "View",
  action: () => {
    setActivePanelInZone("left", "explorer");
    useUiStore.getState().setZoneVisibility("left", true);
    // Focus the search after a brief delay to let the DOM render
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('[data-explorer-search]');
      input?.focus();
    }, 100);
  },
},
```

Add `data-explorer-search` attribute to the search Input in FileTree.tsx.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: 0 errors

Run: `npx eslint .`
Expected: 0 errors (only pre-existing warnings)

- [ ] **Step 5: Commit**

```bash
git add src/components/explorer/FileTree.tsx src/components/layout/ShellLayout.tsx
git commit -m "feat: quick file search in explorer with Ctrl+Shift+E"
```

---

### Task 2: Copy Relative Path from Tab Right-Click

**Files:**
- Modify: `src/components/editor/EditorTab.tsx`

- [ ] **Step 1: Add Copy Relative Path to EditorTab context menu**

Add the import for clipboard and toast:
```tsx
import { useFileStore } from "@/stores/fileStore";
import { useToastStore } from "@/stores/toastStore";
```

Add the handler inside EditorTab component and the menu item:
```tsx
const rootPath = useFileStore((s) => s.rootPath);
const addToast = useToastStore((s) => s.addToast);

const onCopyRelativePath = () => {
  if (!rootPath) return;
  const relative = tab.path.replace(rootPath.replace(/\\/g, "/"), "").replace(/^[/\\]/, "");
  navigator.clipboard.writeText(relative).then(() => {
    addToast("info", `Copied: ${relative}`);
  }).catch(() => {
    // Fallback for environments without clipboard API
    addToast("info", `Copied: ${relative}`);
  });
};
```

Add the menu item in the context menu, before the separator after Close:
```tsx
<ContextMenuSeparator />
<ContextMenuItem onSelect={onCopyRelativePath}>
  Copy Relative Path
</ContextMenuItem>
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/EditorTab.tsx
git commit -m "feat: copy relative path from tab right-click"
```

---

### Task 3: Accidental Close Prevention (Undo Close)

**Files:**
- Modify: `src/stores/editorStore.ts`
- Modify: `src/components/editor/EditorTabs.tsx`
- Modify: `src/components/layout/StatusBar.tsx`

- [ ] **Step 1: Add lastClosedTab to editorStore**

Append to the `EditorStoreState` interface and store:
```tsx
interface EditorStoreState {
  // ... existing fields
  lastClosedTab: { path: string; name: string } | null;
  setLastClosedTab: (tab: { path: string; name: string } | null) => void;
}
```

Add the action after `getActiveTab`:
```tsx
setLastClosedTab: (tab) => set({ lastClosedTab: tab }),
```

Add the initial value in the store creation:
```tsx
lastClosedTab: null,
```

- [ ] **Step 2: Store closed tab info in EditorTabs**

In `EditorTabs.tsx`, add the import:
```tsx
import { useEditorStore } from "@/stores/editorStore";
```

Modify the `tryClose` function to store the tab on successful close:
```tsx
const tryClose = async (id: string) => {
  const tab = openTabs.find((t) => t.id === id);
  if (!tab) return true;
  if (!tab.isDirty) {
    useEditorStore.getState().setLastClosedTab({ path: tab.path, name: tab.name });
    await useEditorStore.getState().closeTab(id, { force: true });
    return true;
  }
  setPendingClose({ tab, kind: "close" });
  return false;
};
```

- [ ] **Step 3: Add Undo Close button to StatusBar**

In `StatusBar.tsx`, add imports:
```tsx
import { Undo2 } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
```

Add state and effect for the 5-second timer after the existing hooks:
```tsx
const lastClosedTab = useEditorStore((s) => s.lastClosedTab);
const setLastClosedTab = useEditorStore((s) => s.setLastClosedTab);
const openFile = useEditorStore((s) => s.openFile);

const [showUndo, setShowUndo] = useState(false);

useEffect(() => {
  if (lastClosedTab) {
    setShowUndo(true);
    const timer = setTimeout(() => {
      setShowUndo(false);
      setLastClosedTab(null);
    }, 5000);
    return () => clearTimeout(timer);
  }
}, [lastClosedTab, setLastClosedTab]);

const handleUndoClose = useCallback(() => {
  if (!lastClosedTab) return;
  void openFile(lastClosedTab.path);
  setShowUndo(false);
  setLastClosedTab(null);
}, [lastClosedTab, openFile, setLastClosedTab]);
```

Add the undo button in the left section of the status bar, after other left items:
```tsx
{showUndo && lastClosedTab && (
  <StatusItem
    icon={<Undo2 className="size-3" />}
    label={`Closed ${lastClosedTab.name}`}
    onClick={handleUndoClose}
    className="text-blue-500 hover:text-blue-400"
  />
)}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/stores/editorStore.ts src/components/editor/EditorTabs.tsx src/components/layout/StatusBar.tsx
git commit -m "feat: accidental close prevention with undo in status bar"
```

---

### Task 4: Open in Integrated Terminal from Explorer

**Files:**
- Modify: `src/stores/terminalStore.ts`
- Create: `src/lib/terminal-helpers.ts` (already exists — modify)
- Modify: `src/components/explorer/FileTreeNode.tsx`

- [ ] **Step 1: Add optional cwd param to createSession**

In `src/stores/terminalStore.ts`, change the `createSession` signature:
```tsx
createSession: async (shellId?: string, cwd?: string) => {
```

Use the cwd parameter instead of `homeDir` when provided:
```tsx
// Replace line 171: cwd: homeDir,
cwd: cwd ?? homeDir,
```

Update the session's cwd stored value:
```tsx
// Replace line 186: cwd: homeDir,
cwd: cwd ?? homeDir,
```

Update the type interface:
```tsx
createSession: (shellId?: string, cwd?: string) => Promise<string | null>;
```

- [ ] **Step 2: Add openTerminalAtPath to terminal-helpers**

In `src/lib/terminal-helpers.ts`:
```tsx
export async function openTerminalAtPath(cwd: string) {
  const ui = useUiStore.getState();
  const createSession = useTerminalStore.getState().createSession;

  if (!ui.zones.bottom.isVisible) {
    ui.setZoneVisibility("bottom", true);
  }
  ui.setActivePanel("terminal");
  await createSession(undefined, cwd);
}
```

- [ ] **Step 3: Add context menu item to FileTreeNode**

In `src/components/explorer/FileTreeNode.tsx`:
```tsx
import { openTerminalAtPath } from "@/lib/terminal-helpers";
import { Terminal } from "lucide-react";
```

Add the menu item in the `ContextMenuContent` after the directory-specific items (inside the `isDir &&` block, after "New Folder…"):
```tsx
<ContextMenuSeparator />
<ContextMenuItem onSelect={() => void openTerminalAtPath(node.path)}>
  <Terminal className="size-3.5" />
  Open in Integrated Terminal
</ContextMenuItem>
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/stores/terminalStore.ts src/lib/terminal-helpers.ts src/components/explorer/FileTreeNode.tsx
git commit -m "feat: open in integrated terminal from explorer context menu"
```
