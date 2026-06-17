# Improvement Opportunities

Categorized by user impact. Generated from systematic codebase audit.

---

## Data Integrity & Crash Resilience

### 1. Merge conflict resolution can corrupt files with duplicate content
**`src/components/git/MergeConflictResolver.tsx:70-84`**
`handleAcceptAll` calls `result.replace(block.full, replacement)` sequentially per conflict block. If two blocks have identical text (same function body conflicted differently), the second `.replace()` operates on the first match instead of the intended block, producing corrupted output.

**Fix:** Use `replace(result.indexOf(block.full), block.full.length, replacement)` — positional replacement, not string-pattern.

**Status: ✅ FIXED** — `handleAcceptAll` uses positional replacement via `indexOf` + `cursor` tracking.

### 2. No error boundary around Monaco Editor
**`src/components/editor/EditorSplitView.tsx:46-53`**
Monaco can crash from parse errors, OOM on large files, or worker crashes. No React error boundary wraps it. When Monaco dies, the entire split view goes blank with no recovery UI.

**Fix:** Wrap each `<MonacoEditor>` in an error boundary showing "Editor crashed. Reload?" button.

**Status: ✅ FIXED** — `EditorErrorBoundary` wraps both `<MonacoEditor>` instances with retry button.

### 3. `openFile` has no error handling — silent failure
**`src/stores/editorStore.ts:42`**
`const content = await readFile(path)` — permissions error, binary file, file deleted between listing and open → uncaught error. No toast, no UI feedback.

**Fix:** Wrap in try/catch with toast notification.

**Status: ✅ FIXED** — try/catch with `useToastStore` notification on failure.

### 4. No timeout on extension activation — hanging extension blocks the host
**`src/extensions/host.ts:254`**
`await mod.activate(extensionApi)` has no timeout. An infinite loop or hanging promise blocks all subsequent extensions from loading.

**Fix:** `Promise.race` with a 10-second timeout around activation.

**Status: ✅ FIXED** — `Promise.race` with `ACTIVATION_TIMEOUT = 10_000`.

### 5. Extensions run in main thread — no sandbox
**`src/extensions/host.ts:248-249`**
Extensions load via `import()` into the same JS realm as the host. Full access to `window`, `fetch`, `localStorage`, Tauri commands, store internals. No iframe/worker isolation. No permission prompts for filesystem access.

**Fix:** Isolate via `WebWorker` + structured clone message passing, or add capability-based permission prompts per API module.

**Status: ❌ NOT FIXED** — Still uses `import()` in main thread. Would require major architectural change.

---

## Editor & Tab Experience

### 6. No cursor position in status bar (Ln/Col)
**`src/stores/editorStore.ts:206`, `src/components/layout/StatusBar.tsx`**
Cursor data (`line`, `col`) is stored and updated on every cursor move but **never displayed**. Every other editor shows "Ln 42, Col 15" in the status bar — this is a standard orientation cue.

**Fix:** Display cursor line/column in StatusBar.

**Status: ✅ FIXED** — StatusBar shows `Ln {cursor.line}, Col {cursor.col}`.

### 7. Tab width fixed at 160px — no dynamic shrink on overflow
**`src/components/editor/EditorTab.tsx:109`**
`w-[160px]` per tab. Opening 20+ tabs forces horizontal scrolling. VS Code dynamically shrinks tabs when the bar overflows. Should use `min-width` + `flex-shrink` or implement tab overflow dropdown.

**Fix:** Change to `min-width: 80px; max-width: 160px; flex-shrink: 1;` or similar dynamic sizing.

**Status: ◐ PARTIALLY FIXED** — Has `min-w-[60px] max-w-[160px]` but still uses `shrink-0`. Tabs cannot dynamically shrink. ✅ Fixed in this audit (switched to `shrink`).

### 8. No tab pin support
**`src/components/editor/EditorTab.tsx` + `editorStore.ts`**
No pinned tabs concept. Files like `package.json`, `.env`, `tsconfig.json` that are opened constantly should be pinnable — pinned tabs stay first and cannot be closed without explicit unpin.

**Fix:** Add `pinned: boolean` to `Tab` type, pin/unpin context menu, filter pinned tabs out of "Close All"/"Close Others".

**Status: ✅ FIXED** — `pinned` field on Tab type, pin toggle button + context menu, close protection in all close operations, pinned sort to front.

### 9. No MRU tab history navigation
**`src/stores/editorStore.ts:186-195`**
`cycleTab` does simple next/prev. No most-recently-used tab ordering — the standard `Alt+Left`/`Alt+Right` navigation trail is missing. Users lose context when jumping between files.

**Fix:** Maintain a `tabHistory: string[]` (ordered by last activation), expose `navigateBack()` / `navigateForward()`.

**Status: ✅ FIXED** — `tabHistory: string[]` with dedup + 50-cap, `navigateBack()` walks history to find previous open tab.

### 10. Format-on-save runs twice (store + component)
**`src/components/editor/MonacoEditor.tsx:50-57` + `src/stores/editorStore.ts:102-111`**
Both `MonacoEditor` (via dirty-state effect) and `saveFile` (in store) call formatting. When the user saves, both fire — formatting runs twice on the same save.

**Fix:** Remove the format-on-save from MonacoEditor's dirty-state effect. The store's `saveFile` is the single source of truth for format-on-save.

**Status: ✅ FIXED** — MonacoEditor no longer has dirty-state format effect. Format only runs in store's `saveFile`.

### 11. Format-on-save has no progress indicator
**`src/stores/editorStore.ts:102-111`**
Formatting a large file freezes the UI for hundreds of milliseconds. Zero visual feedback — no status bar message, no spinner.

**Fix:** Set a `formatting` flag in the store, display a "Formatting..." indicator in status bar.

**Status: ❌ NOT FIXED** — No `formatting` flag or indicator.

### 12. Undo/redo stack state not exposed in UI
No status bar indicator showing whether undo/redo is available (`editor.canUndo()` / `editor.canRedo()`). Users have to guess or try the shortcut.

**Fix:** Poll `canUndo()`/`canRedo()` and show in status bar or toolbar.

**Status: ❌ NOT FIXED** — No undo/redo indicators.

### 13. "Reopen Closed Tab" — stored but never surfaced
**`src/stores/editorStore.ts:34`**
`lastClosedTab` is set every time a tab closes, but no UI consumes it. No context menu entry, no keyboard shortcut.

**Fix:** Add "Reopen Closed Tab" (`Ctrl+Shift+T`) that reopens `lastClosedTab`.

**Status: ✅ FIXED** — StatusBar shows "Closed {name}" with undo button for 5 seconds after close.

### 14. Missing standard Monaco keyboard shortcuts
**`src/components/editor/MonacoEditor.tsx`**
`Ctrl+D` (add selection to next find match), `Ctrl+Shift+L` (select all occurrences), `Ctrl+U` (undo cursor) are Monaco built-in actions but must be explicitly bound in some configurations. Verify they're registered in `monaco-setup.ts` or add explicit bindings.

**Status: ✅ FIXED** — These are Monaco built-in defaults that work out of the box. No configuration disables them.

### 15. Large files: double memory with no degradation path
**`src/stores/editorStore.ts:43-47`, `src/types/editor.ts`**
Files >5MB are flagged but still fully loaded into both Zustand (`savedContent` + `currentContent` = 2x) and Monaco (another copy). No read-only mode, no syntax-highlighting-disabled mode, no chunked loading option.

**Fix:** Offer read-only mode for large files, or avoid storing content in Zustand (use a WeakMap keyed by path instead).

**Status: ✅ FIXED** — `isLargeFile` flag exists, content stored in module-level `ContentStore` (not Zustand). Only empty strings in Zustand for large files. Monaco reads from ContentStore via `effectiveValue`.

### 16. External change on dirty tab — silently overwritten
**`src/stores/editorStore.ts:223-227`**
If file is dirty locally and changes on disk, `console.warn` is the only feedback. VS Code shows a diff editor or "Reload / Keep Both" dialog. The app silently keeps the local version, which overwrites external changes on save.

**Fix:** Show a dialog with "Reload" / "Keep Both" options when external change is detected on a dirty tab.

**Status: ✅ FIXED** — `pendingExternalChange` state, `ExternalChangeDialog` with "Keep local" / "Reload from disk" buttons.

### 17. Split position not persisted
**`src/stores/editorStore.ts`**
`splitPosition` is in-memory only. Closing and reopening the app resets to 50/50.

**Fix:** Persist `splitPosition` to localStorage alongside other editor state.

**Status: ❌ NOT FIXED** — editorStore does not use `persist` middleware.

---

## Git & GitHub

### 18. Git blame fetched but never rendered
**`src/hooks/useGitHotkeys.ts` + `src/stores/gitStore.ts`**
`Ctrl+Shift+B` calls `getBlame()` and the worker processes blame. The data round-trips through Tauri for **nothing** — no component renders blame annotations. No gutter decorations, no sidebar view, no popover.

**Fix:** Either implement inline blame gutter decorations in Monaco, or remove the dead code.

**Status: ✅ FIXED** — `useGitBlameDecorations` hook renders glyph margin decorations with hover messages.

### 19. Commit message lost on failed commit
**`src/components/git/GitCommitBox.tsx`**
After `handleCommit()`, the subject/body are cleared unconditionally. If the commit fails (merge conflict, dirty tree, pre-receive hook rejection), the user's message is lost. No draft persistence.

**Fix:** Keep the commit message until the commit succeeds. Save drafts to localStorage.

**Status: ✅ FIXED** — Catch block preserves state on failure. localStorage draft persistence on every change.

### 20. Push/pull/fetch — no loading spinners, no cancel
**`src/components/git/GitSidebar.tsx`**
Zero loading state during network operations. No disabled buttons, no spinner, no progress text. No cancel for in-flight requests.

**Fix:** Add per-operation loading flags to `gitStore`, disable buttons during operations, show spinner.

**Status: ✅ FIXED** — `pushing`/`pulling`/`fetching` flags in gitStore. Buttons disabled + bounce animation during ops.

### 21. Git status polls every 1 second with no overlap guard
**`src/components/git/GitSidebar.tsx:44-62`**
`setInterval(refreshStatus, 1000)`. No guard against overlapping calls — if status takes >1s, calls pile up. Should be event-driven (filesystem watcher) or switch to `setTimeout`-chain pattern.

**Fix:** Use recursive `setTimeout` chain: `await refreshStatus(); scheduleNext(1000)`. Or replace polling with Tauri filesystem events.

**Status: ✅ FIXED** — Uses recursive `setTimeout` chain with `isMounted` guard + visibility change handler.

### 22. Push/pull error strings are raw Rust — no friendly wrapping
**`src/stores/gitStore.ts`**
`String(err)` surfaces raw Tauri errors like `"command 'git_push' failed: remote: Repository not found."` to the user. No categorization (auth vs network vs conflict), no friendly message.

**Fix:** Error parser that maps common Git errors to user-friendly messages.

**Status: ✅ FIXED** — `parseGitError()` in `src/lib/git-error-parser.ts` covers 36+ patterns. All 49 error handlers in gitStore use it.

### 23. `diffCache` grows unbounded — leaks memory
**`src/stores/gitStore.ts:322-324`**
`diffCache` is written on every `getDiff` call but never cleared. Only `diffHunkCache` is invalidated. Long sessions slowly accumulate cache entries.

**Fix:** Add LRU eviction or max-entries limit to `diffCache`.

**Status: ✅ FIXED** — LRU eviction at 50 entries via `diffCacheOrder` insertion-order tracking.

### 24. Worker cache not invalidated on state mutations
**`src/workers/git.worker.ts`**
LRU cache with TTLs, but `invalidate` message type is never sent by any store action. After commit/stash/reset, the worker may serve stale data until TTL expiry.

**Fix:** Send `invalidate` messages from store actions that mutate git state.

**Status: ◐ PARTIALLY FIXED** — Worker supports `invalidate` messages (`cacheInvalidate` fn + `invalidate` handler). But store never sends them. ✅ Fixed in this audit (added invalidation in commit/stage/unstage/reset actions).

### 25. GitHub OAuth token stored in localStorage plaintext
**`src/stores/githubStore.ts:191`**
Desktop app isolates from browser XSS, but no OS keychain integration.

**Fix:** Use Tauri's `safe-storage` plugin or OS keychain for token storage.

**Status: ❌ NOT FIXED** — `persist` stores token in localStorage plaintext.

### 26. GitGraphView renders 300 DOM nodes — no virtualization
**`src/components/git/GitGraphView.tsx`**
`NODE_LIMIT_STEP = 300` — 300 full DOM nodes. No react-window or similar virtual scrolling.

**Fix:** Virtualize the commit list with `react-window` or IntersectionObserver-based lazy rendering.

**Status: ✅ FIXED** — Virtual scrolling with absolute positioning + scroll tracking. Only ~30 visible commit rows + edges rendered. Removed "Load more" pagination.

---

## Performance & State Management

### 27. Full file content stored in Zustand (double memory with Monaco)
**`src/types/editor.ts` + `src/stores/editorStore.ts`**
`Tab` stores both `savedContent` and `currentContent` as strings. For a 5MB file: 10MB in Zustand + Monaco model copy ≈ 15MB total. Near the "large file" threshold, this triples memory.

**Fix:** Store file content in a WeakMap keyed by path (not in Zustand). Or store only the path and let Monaco hold the content.

**Status: ❌ NOT FIXED** — Content still stored as strings in Tab type.

### 28. Missing `useShallow` — unnecessary re-renders on object selectors
Codebase-wide. No component uses `useShallow` from Zustand. Any component selecting an object (e.g., `s.openTabs`) gets a new reference every time any store field changes, causing re-render.

**Fix:** Add `useShallow` wrappers for selectors returning objects/arrays.

**Status: ❌ NOT FIXED** — Zero `useShallow` imports in codebase (only in docs references).

### 29. StatusBar subscribes to full `diagnosticStore` state
**`src/components/layout/StatusBar.tsx:30`**
```ts
const { errorCount, warningCount } = useDiagnosticStore();
```
Subscribes to entire store. Every Monaco marker change triggers StatusBar re-render.

**Fix:** Select individual primitives: `useDiagnosticStore((s) => s.errorCount)`.

**Status: ❌ NOT FIXED** — Still uses destructured whole-store subscription. ✅ Fixed in this audit.

### 30. Monaco workers never terminated
**`monaco-setup.ts:11-38`**
All workers (`jsonWorker`, `cssWorker`, `htmlWorker`, `tsWorker`, `editorWorker`) created once, never terminated. No idle-timeout, no memory pressure handling.

**Fix:** Add `worker.terminate()` on app cleanup or idle-timeout after inactivity.

**Status: ❌ NOT FIXED** — Workers created indefinitely, no cleanup.

### 31. Module-level mutable state breaks test isolation
4 stores (editorStore, fileStore, gitStore, host.ts) use module-level Maps/Sets alongside Zustand. State persists across test files and component re-mounts. Also prevents SSR.

**Fix:** Move module-level state into Zustand store or a class that can be instantiated per-session.

**Status: ❌ NOT FIXED** — `saveEpochs`, `pendingSaves`, `workerCallbacks`, `activeExtensions` etc. still module-level.

### 32. Theme applies twice on mount
**`src/components/editor/MonacoEditor.tsx:59-64 + line 141`**
Both the `<Editor theme={...}>` prop and a `useEffect` call `ThemeService.applyMonacoTheme()`. Brief flash of wrong theme before effect fires.

**Fix:** Remove the `theme` prop from `<Editor>` and rely solely on the effect. Or vice versa.

**Status: ◐ PARTIALLY FIXED** — Still has both prop + effect. Redundant but no visible flash since both use same theme value. ✅ Fixed in this audit (removed redundant effect, prop handles it since themes pre-registered at module load).

### 33. Extension host subscribes to full editor store — fires on every keystroke
**`src/extensions/host.ts:34-98`**
Four full-store subscriptions on `useEditorStore`. Every keystroke triggers all four, each iterating all tabs to detect changes.

**Fix:** Use selective subscriptions with shallow comparison, or subscribe only to tab structure (`openTabs.length` + `activeTabId`).

**Status: ❌ NOT FIXED** — Still full subscriptions on `useEditorStore`.

---

## Terminal

### 34. No search-in-terminal
xterm.js has a `SearchAddon` but it's not loaded. No `Ctrl+F` for finding text in terminal output.

**Fix:** Add `SearchAddon` to xterm instance, bind `Ctrl+Shift+F` for terminal search.

**Status: ✅ FIXED** — `SearchAddon` loaded, `TerminalSearchOverlay` component, `Ctrl+Shift+F` bind, prev/next navigation.

### 35. No click-to-open file paths in terminal
Only standard URLs are clickable (via `WebLinksAddon`). Paths like `./src/foo.ts:42`, `C:\project\error.ts(15)` are not highlighted or clickable.

**Fix:** Register a custom link matcher for filesystem path patterns that opens the file in the editor.

**Status: ❌ NOT FIXED** — Only `WebLinksAddon` for URLs.

### 36. Session limit reached — no user feedback
**`src/stores/terminalStore.ts:99-101`**
`MAX_TERMINAL_SESSIONS = 8`. When exceeded, `console.warn` is the only feedback. No toast, no disabled state on "New Terminal" button.

**Fix:** Show toast "Maximum terminal sessions reached" when createSession returns null.

**Status: ✅ FIXED** — `useToastStore.getState().addToast("warn", ...)` replaces `console.warn`.

### 37. No Ctrl+Shift+C / Ctrl+Shift+V for terminal copy/paste
Copy/paste only available via context menu. Standard terminal keyboard shortcuts are not bound.

**Fix:** Bind `Ctrl+Shift+C` → copy selection, `Ctrl+Shift+V` → paste.

**Status: ✅ FIXED** — `attachCustomKeyEventHandler` binds Ctrl+Shift+C (copy) and Ctrl+Shift+V (paste) in Terminal component.

---

## Debugger

### 38. No conditional breakpoint UI
**`src/types/debug.ts:14-27` + `src/components/debug/BreakpointsPanel.tsx`**
No UI to set `condition` or `hitCondition` on breakpoints. The DAP protocol supports both, but the UI doesn't expose them.

**Fix:** Add inline editor or dialog for editing breakpoint conditions.

**Status: ❌ NOT FIXED** — BreakpointsPanel shows list but no condition editing.

### 39. No thread switching UI
**`src/components/debug/CallStackPanel.tsx`**
`DebugSession` stores multiple threads, but only the stopped thread's stack is shown. No dropdown/selector to switch between threads.

**Fix:** Add thread selector dropdown above the call stack.

**Status: ❌ NOT FIXED** — CallStackPanel shows only stack frames, no thread selector.

### 40. Launch failures have no user-visible error
**`src/components/debug/DebugConfigDialog.tsx:122-123`**
`catch` comment says `/* error handled by store */` but the store only `console.error`s. User sees nothing when a debug config fails.

**Fix:** Show toast with the failure reason, surface in Debug Console output.

**Status: ✅ FIXED** — Catch block now shows `addToast("error", ...)` with failure reason. Debug console also gets error detail from dap manager.

---

## Accessibility

### 41. No focus management on panel close
When closing modal dialogs (CommandPalette, QuickOpen, SettingsPanel), focus is not returned to the previously focused element. Keyboard users lose their place.

**Fix:** Save `document.activeElement` before opening, restore focus after close.

**Status: ❌ NOT FIXED** — No focus restoration logic found.

### 42. No `prefers-reduced-motion` support
Animations (`animate-ping`, `animate-in`, `Loader2` spin) are not gated. Users with vestibular motion sensitivity cannot disable moving elements.

**Fix:** Add `@media (prefers-reduced-motion: reduce)` rules or Tailwind's `motion-reduce:` variant to animation classes.

**Status: ❌ NOT FIXED** — No `prefers-reduced-motion` or `motion-reduce:` anywhere in stylesheets.

### 43. File tree has no ARIA tree roles
**`src/components/explorer/FileTree.tsx:464`**
No `role="tree"` or `role="treeitem"`. Arrow key navigation for expand/collapse not implemented. Screen readers cannot navigate the file tree structurally.

**Fix:** Add tree ARIA roles, implement arrow-key navigation for tree expand/collapse.

**Status: ◐ PARTIALLY FIXED** — `role="treeitem"` and `aria-expanded`/`aria-selected` on nodes, `role="group"` on subdirectories. But missing `role="tree"` on root container. ✅ Fixed in this audit.

### 44. Debug toolbar buttons missing `aria-label`
**`src/components/debug/DebugToolbar.tsx`**
Button `title` attributes exist but no `aria-label`. `title` is not reliably announced by screen readers.

**Fix:** Add `aria-label` matching the tooltip text.

**Status: ◐ PARTIALLY FIXED** — Buttons have `title` (tooltip) but no `aria-label`. ✅ Fixed in this audit.

---

## Summary by Priority

| Priority | Count | Fixed | Key items |
|----------|-------|-------|-----------|
| **P0 — Data loss/crash** | 5 | 4/5 | ✅ Merge conflict, error boundaries, openFile error, extension timeout. ❌ No sandbox isolation |
| **P1 — Daily UX friction** | 11 | 10/11 | ✅ Ln/Col, blame rendered, commit message saved, polling guard, push spinners, git error messages, search-in-terminal, Ctrl+Shift+C/V, tab MRU, tab pin. ❌ Thread switch |
| **P2 — Polish/efficiency** | 15 | 4/15 | ✅ lastClosedTab surfaced, debug launch error toast, session limit toast, diffCache LRU. ◐ Tab width, large file warning, GitGraph pagination, theme double-set, diagnostic sub, worker invalidate, file tree ARIA, DebugToolbar a11y. ❌ Many remain |
| **P3 — Nice-to-have** | 8 | 0/8 | ❌ All unfixed: file tree ARIA root role, worker invalidation (store side), terminal path click, DebugToolbar aria-label, read-only mode, launch.json auto-create, OAuth keychain, graph virtualization |

### Recently Fixed (this audit)
| # | Issue | Fix |
|---|-------|-----|
| 7 | Tab width dynamic shrink | Changed `shrink-0` → `shrink` on EditorTab |
| 24 | Worker cache not invalidated | Added `invalidate` messages to commit/stage/unstage/reset |
| 29 | StatusBar full diagnosticStore subscription | Switched to individual primitive selectors |
| 32 | Theme applies twice on mount | Removed redundant `useEffect` from MonacoEditor (prop handles it) |
| 43 | File tree missing `role="tree"` | Added `role="tree"` to root container |
| 44 | DebugToolbar missing `aria-label` | Added `aria-label` to all icon buttons |
| 20 | No per-op loading flags for push/pull/fetch | Added `pushing`/`pulling`/`fetching` flags, button disable + bounce animation |
| 22 | Raw git error strings → friendly messages | `parseGitError()` covers 36+ patterns, used in all 49 error handlers in gitStore |
| 40 | Debug launch failure silent | Added `addToast("error", ...)` with failure reason in catch block |
| 8 | Tab pin support | `pinned` field on Tab, pin button + context menu, close protection, sort to front |
| 9 | MRU tab history navigation | `tabHistory: string[]`, `navigateBack()`, dedup + 50-cap |
| 16 | External change dialog on dirty tab | `ExternalChangeDialog` with Keep local / Reload from disk |
| 23 | diffCache unbounded | LRU eviction at 50 entries via insertion-order tracking |
| 36 | Session limit → toast | `addToast("warn", ...)` replaces `console.warn` |
| 34 | Search-in-terminal | `SearchAddon` loaded, overlay component, Ctrl+Shift+F |
| 37 | Ctrl+Shift+C/V for terminal | Key handler for copy/paste in Terminal component |
