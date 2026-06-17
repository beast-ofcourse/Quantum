
# Code Editor — Implementation Plan

**Stack:** Tauri + React + TypeScript + Monaco Editor + xterm.js + Zustand + Tailwind CSS + shadcn/ui  
**Architecture:** Single WebView + Web Workers (Approach 3)  
**Date:** 2025-06-05

---

## Architecture Overview

```
Tauri Shell (Rust)
├── plugin-fs        → File CRUD, directory tree walks
├── plugin-dialog    → Open folder / file dialogs
├── plugin-shell     → Spawn shell process, PTY stdin/stdout
└── IPC bridge       → invoke() + event system

Single WebView (React)
├── Main Thread
│   ├── Shell UI (sidebar, tabs, status bar, terminal panel)
│   ├── Monaco Editor instance
│   ├── xterm.js instance
│   └── Zustand stores (editor, file, terminal, workspace, ui)
│
└── Web Workers Pool
    ├── FileTreeWorker     → Async tree walks, .gitignore filtering, search
    └── TerminalIOWorker   → stdin/stdout buffering, resize handling
```

**Data flow principles:**
- All disk I/O → React invoke() → Tauri Rust commands → OS
- All terminal I/O → xterm.js ↔ Worker ↔ Tauri events ↔ plugin-shell ↔ OS shell
- All heavy computation → Worker postMessage ↔ Main thread
- Cross-panel state → Zustand stores (single source of truth)

---

## Phase 0: Project Scaffolding

**Goal:** Initialize the project with all tooling configured.

### Tasks

- **0.1** Create Tauri + React + Vite + TypeScript project
  - `npm create tauri-app@latest` with React + TypeScript template
- **0.2** Install and configure Core dependencies
  - `tailwindcss`, `postcss`, `autoprefixer` (Tailwind v4 via Vite plugin)
  - `@tauri-apps/api` (IPC layer)
  - `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-shell`
  - `zustand` for state management
  - `monaco-editor` + `@monaco-editor/react`
  - `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`
- **0.3** Configure shadcn/ui
  - `npx shadcn@latest init`
  - Install base components: Button, Tabs, ContextMenu, Dialog, ScrollArea, Tooltip, Separator, DropdownMenu, Badge, Input
- **0.4** Configure Tauri plugins in `src-tauri/Cargo.toml` + `tauri.conf.json`
- **0.5** Set up directory structure:

```
src/
├── App.tsx                    → Root layout
├── main.tsx                   → Entry point
├── components/                → React components
│   ├── ui/                    → shadcn primitives
│   ├── editor/                → Monaco wrapper
│   ├── explorer/              → File tree sidebar
│   ├── terminal/              → xterm wrapper
│   ├── tabs/                  → Editor tabs
│   └── layout/                → Shell layout (panels, resizer)
├── stores/                    → Zustand stores
├── workers/                   → Web Workers
├── hooks/                     → Custom React hooks
├── tauri/                     → Tauri IPC wrappers
├── lib/                       → Utilities
└── types/                     → TypeScript types
```

---

## Phase 1: Shell UI & Layout✅✅✅

**Goal:** Build the resizable multi-panel layout with theme support.

### Tasks

- **1.1** Create shell layout component with three panels:
  - **Left sidebar** (collapsible, resizable) — File explorer
  - **Main area** — Editor tabs + Monaco
  - **Bottom panel** (collapsible, resizable) — Terminal
  - Use CSS Grid or flexbox with drag-to-resize handles
- **1.2** Build Zustand `uiStore`:
  - `sidebarOpen`, `sidebarWidth`
  - `terminalOpen`, `terminalHeight`
  - `activePanel` (which panel has focus)
  - `theme` (light/dark)
- **1.3** Custom title bar for Tauri (decorations: false)
  - Window controls (minimize, maximize, close)
  - App title
  - `decorations: false` in `tauri.conf.json`
- **1.4** Theme system
  - CSS variables for colors (light + dark palettes)
  - Zustand store for active theme
  - Monaco theme sync (vs-dark / vs-light)
  - xterm theme sync
- **1.5** Status bar
  - File encoding, cursor position (line:col), language
  - Git branch (future)
- **1.6** Keyboard shortcut registry
  - `useHotkey` hook
  - Centralized shortcut definition store

---

## Phase 2: File System & Explorer✅✅✅

**Goal:** Browse, open, create, rename, delete files and folders in a workspace.

### Tasks

- **2.1** Tauri Rust commands for filesystem operations:
  - `read_directory(path) → FileEntry[]` (recursive, depth-limited)
  - `read_file(path) → string` (with encoding detection)
  - `write_file(path, content) → void`
  - `create_file(path) → void`
  - `create_directory(path) → void`
  - `rename_entry(old, new) → void`
  - `delete_entry(path) → void`
  - `resolve_home() → string` (for ~ shortcut)
- **2.2** FileTreeWorker (Web Worker)
  - Receives raw file list, applies `.gitignore` rules
  - Builds a flat `FileNode[]` structure: `{ name, path, type, children? }`
  - Filters hidden files (dotfiles) optionally
  - Returns sorted tree to main thread via `postMessage`
- **2.3** Build Zustand `fileStore`:
  - `rootPath: string | null`
  - `fileTree: FileNode[]`
  - `expandedFolders: Set<string>`
  - `selectedFile: string | null`
  - `loading: boolean`
  - Actions: `openFolder()`, `refreshTree()`, `toggleExpand()`, `selectFile()`
- **2.4** File Explorer component
  - Recursive tree view with expand/collapse
  - Icons for file types (folder open/closed, file by extension)
  - Click to select/expand, double-click to open in editor
  - Drag-to-select range (shift+click)
- **2.5** Context menu on file/folder:
  - New File, New Folder, Rename, Delete, Reveal in Explorer (system)
  - Inline rename input (F2)
- **2.6** Open folder dialog
  - `@tauri-apps/plugin-dialog` `open()` with directory filter
  - Triggers `fileStore.openFolder()`
- **2.7** File watching (Tauri `plugin-fs` watch)
  - Emit events on external file changes
  - Auto-refresh tree and prompt on dirty file changes
- **2.8** Drag & drop files from OS into window
  - Tauri drag-drop event → open file in editor

---

## Phase 3: Monaco Editor Integration✅✅✅

**Goal:** Full-featured code editor with multi-tab support.

### Tasks

- **3.1** Build `MonacoEditor` component
  - Wraps `@monaco-editor/react` `Editor` component
  - Props: `path`, `value`, `language`, `onChange`, `onSave`
  - Configures Monaco options (font size, tab size, word wrap, minimap, line numbers, scrollbar)
- **3.2** Build Zustand `editorStore`:
  - `openTabs: Tab[]` (each: `{ id, path, name, language, isDirty, savedContent, currentContent }`)
  - `activeTabId: string | null`
  - Actions: `openFile(path)`, `closeTab(id)`, `setActiveTab(id)`, `updateContent(id, content)`, `saveFile(id)`, `closeAll()`, `closeOthers(id)`
- **3.3** Multi-tab bar component
  - Horizontal scrollable tab strip (like VS Code)
  - Each tab: icon + filename + close button
  - Dirty indicator (dot) on unsaved files
  - Middle-click to close
  - Drag to reorder (optional)
  - Context menu: Close, Close Others, Close All, Close to the Right
- **3.4** File open flow:
  - Click file in explorer → `fileStore.selectFile()` → `editorStore.openFile()`
  - Read file via Tauri `read_file()`
  - Create new tab, detect language from extension, set as active
- **3.5** File save flow:
  - Ctrl+S or menu → `editorStore.saveFile(id)`
  - Write content via Tauri `write_file()`
  - Reset `isDirty` flag
- **3.6** Monaco editor integration:
  - Language detection: map extension → Monaco language ID
  - Theme: sync `uiStore.theme` → Monaco `defineTheme()` + `setTheme()`
  - Cursor position tracking → status bar (line:col)
  - Change tracking → dirty state (compare with saved content)
  - Auto-save on blur (optional, configurable)
- **3.7** Keyboard shortcuts:
  - `Ctrl+S` → save
  - `Ctrl+W` → close tab
  - `Ctrl+Tab` / `Ctrl+Shift+Tab` → cycle tabs
  - `Ctrl+N` → new untitled file
  - `Ctrl+\`` → toggle terminal
  - `Ctrl+B` → toggle sidebar
- **3.8** Unsaved changes guard
  - Dialog on close dirty tab: "Save changes?"
  - Options: Save, Don't Save, Cancel

---

## Phase 4: Terminal System✅✅✅

**Goal:** Integrated terminal emulator like VS Code's.

### Tasks

- **4.1** Build `Terminal` component
  - Wraps `@xterm/xterm` with React ref
  - `Terminal` options: font family, font size, theme, cursor style
  - `FitAddon` for auto-resize to container
  - `WebLinksAddon` for clickable URLs
- **4.2** TerminalIOWorker (Web Worker)
  - Buffers stdout chunks from shell
  - Queues stdin writes from xterm
  - Handles resize events (cols/rows calculation)
  - Receives: `{ type: 'output', data: string }` from Tauri events
  - Sends: `{ type: 'input', data: string }` to Tauri events
  - Filters ANSI escape sequences for xterm
- **4.3** Tauri Rust shell integration:
  - Command: `spawn_terminal(shell_path) → pid`
    - Spawns shell process via `plugin-shell`
    - Creates PTY (pseudo-terminal)
    - Returns PID for tracking
  - Event: `terminal:stdout` → streams raw output to webview
  - Event listener: `terminal:stdin` → writes input to shell stdin
  - Command: `resize_terminal(pid, cols, rows) → void`
  - Command: `kill_terminal(pid) → void`
- **4.4** Build Zustand `terminalStore`:
  - `sessions: TerminalSession[]` (each: `{ id, pid, name, isActive }`)
  - `activeSessionId: string | null`
  - Actions: `createSession()`, `closeSession(id)`, `setActiveSession(id)`
- **4.5** Multi-terminal tabs
  - Tab bar at top of terminal panel (like VS Code)
  - + button to create new terminal
  - Dropdown to select default shell (powershell, cmd, bash, zsh)
  - Terminal name (auto or custom)
- **4.6** Terminal interaction:
  - xterm `onData` → Worker → Tauri event → shell stdin
  - Shell stdout → Tauri event → Worker → xterm `write()`
  - Resize observer → FitAddon → send new cols/rows
- **4.7** Terminal context menu:
  - Copy, Paste
  - Clear
  - Select All
  - Split Terminal (future)
- **Phase 4.8** Git Integration
  - **Goal:** Full-featured Git integration with staged/unstaged changes, branching, history, and remote operations.

  ### Tech Stack
  - **Git Backend:** `git` CLI via Tauri `plugin-shell` (no native libgit2 dependency — keeps binary small)
  - **Diff Engine:** Monaco Diff Editor (built-in) for side-by-side/inline diffs
  - **State Management:** New Zustand `gitStore` + `gitStorePersisted` (subscribes to file watcher events)
  - **UI Components:** shadcn/ui (Tabs, DropdownMenu, Dialog, ScrollArea, Badge, Avatar, Separator, Tooltip)
  - **Icons:** lucide-react (git-branch, git-commit, git-pull-request, git-merge, git-compare, etc.)
  - **Worker:** GitWorker (Web Worker) for async git operations (log, diff, status, blame) to keep main thread responsive

  ### Tasks

  - **4.8.1** Tauri Rust Git Commands
    - `git_status(root) → GitStatus` — returns `{ branch, ahead, behind, staged: string[], unstaged: string[], untracked: string[] }`
    - `git_diff(root, path?, staged?) → string` — unified diff for file or entire repo
    - `git_log(root, options?) → GitCommit[]` — options: `{ maxCount, path, author, since, until }`
    - `git_branch_list(root) → GitBranch[]` — local + remote branches with upstream tracking info
    - `git_branch_create(root, name, startPoint?) → void`
    - `git_branch_delete(root, name, force?) → void`
    - `git_checkout(root, target) → void` — branch, tag, or commit hash
    - `git_add(root, paths[]) → void` — stage files
    - `git_reset(root, paths[], mode?) → void` — unstage files (mode: soft/mixed/hard)
    - `git_commit(root, message, options?) → string` — returns commit hash; options: `{ amend, noVerify }`
    - `git_push(root, remote?, branch?, options?) → void` — options: `{ forceWithLease, tags, upstream }`
    - `git_pull(root, remote?, branch?, options?) → void` — options: `{ rebase, ffOnly }`
    - `git_fetch(root, remote?, options?) → void` — options: `{ prune, tags }`
    - `git_remote_list(root) → GitRemote[]` — name, url, fetch/push URLs
    - `git_remote_add(root, name, url) → void`
    - `git_remote_remove(root, name) → void`
    - `git_stash_list(root) → GitStash[]`
    - `git_stash_push(root, message?) → void`
    - `git_stash_pop(root, index?) → void`
    - `git_stash_drop(root, index?) → void`
    - `git_blame(root, path) → GitBlameLine[]` — per-line author, commit, timestamp
    - `git_submodule_status(root) → GitSubmodule[]`
    - `git_init(root) → void` — initialize new repo
    - `git_config_get(root, key) → string` — read git config (user.name, user.email, etc.)
    - `git_config_set(root, key, value, scope?) → void` — scope: local/global/system

  - **4.8.2** GitWorker (Web Worker)
    - Offloads all git CLI calls to background thread
    - Exposes API: `status()`, `diff(path, staged)`, `log(options)`, `branches()`, `blame(path)`, `remotes()`, `stashes()`, `submodules()`
    - Debounces `status()` calls (300ms) on file watcher events
    - Caches `log()` results with LRU (max 100 entries) for instant history navigation
    - Streams large `diff` output in chunks via `postMessage` to avoid blocking

  - **4.8.3** Zustand `gitStore`
    ```ts
    interface GitStore {
      repoRoot: string | null
      isRepo: boolean
      status: GitStatus | null
      currentBranch: string | null
      branches: GitBranch[]
      remotes: GitRemote[]
      stashes: GitStash[]
      log: GitCommit[]
      logLoading: boolean
      blame: GitBlameLine[] | null
      blameLoading: boolean
      diffCache: Map<string, string> // path -> diff
      actions: {
        initRepo: () => Promise<void>
        refreshStatus: () => Promise<void>
        getDiff: (path: string, staged?: boolean) => Promise<string>
        getLog: (options?: LogOptions) => Promise<void>
        getBlame: (path: string) => Promise<void>
        checkout: (target: string) => Promise<void>
        createBranch: (name: string, startPoint?: string) => Promise<void>
        deleteBranch: (name: string, force?: boolean) => Promise<void>
        stage: (paths: string[]) => Promise<void>
        unstage: (paths: string[]) => Promise<void>
        commit: (message: string, options?: { amend: boolean }) => Promise<string>
        push: (remote?: string, branch?: string, options?: PushOptions) => Promise<void>
        pull: (remote?: string, branch?: string, options?: PullOptions) => Promise<void>
        fetch: (remote?: string, options?: FetchOptions) => Promise<void>
        stashPush: (message?: string) => Promise<void>
        stashPop: (index?: number) => Promise<void>
        stashDrop: (index?: number) => Promise<void>
        openRemoteUrl: () => void // opens GitHub/GitLab/Bitbucket in browser
      }
    }
    ```

  - **4.8.4** Git Sidebar Panel (Source Control View)
    - Toggle via `Ctrl+Shift+G` or Activity Bar icon
    - **Sections:**
      - **Changes** — staged/unstaged/untracked files with checkboxes for staging
        - Inline actions: Stage/Unstage, Discard Changes, Open Diff, Open File
        - Drag-and-drop between Staged ↔ Unstaged
      - **Commit Message** — textarea with character count, commit template support
        - Quick actions: "🐛 Fix", "✨ Feat", "📝 Docs", "♻️ Refactor", "✅ Test", "🔧 Chore"
        - Amend checkbox, Sign-off checkbox
      - **Branches** — dropdown with current branch, searchable list of local/remote branches
        - Create branch dialog (name, start point)
        - Delete branch (with force option)
        - Switch branch, merge branch, rebase onto
      - **Remotes** — list remotes with fetch/push URLs
        - Add/remove remote dialogs
        - Fetch, Pull, Push buttons per remote
      - **Stashes** — list with message, branch, commit hash
        - Apply (pop), Drop, View diff
      - **Submodules** — status and update actions

  - **4.8.5** Git Diff View
    - **Trigger:** Click file in Changes section or `Ctrl+D` on open tab
    - **Modes:**
      - Side-by-side (default) — Monaco Diff Editor
      - Inline — toggle via toolbar button
    - **Features:**
      - Line-by-line staging (stage/unstage individual hunks)
      - Word-level diff highlighting
      - Ignore whitespace toggle
      - Context lines slider (0–10)
      - Navigate changes: `F7` (next), `Shift+F7` (prev)
      - Open file at change location (double-click line in diff)

  - **4.8.6** Git History View
    - **Trigger:** "View History" in Command Palette or Git Sidebar
    - **Layout:** Split view — commit graph (left) + commit details (right)
    - **Commit Graph:**
      - Rendered via custom Canvas/WebGL (lightweight, no heavy deps)
      - Shows branch/tag labels, merge commits, HEAD position
      - Virtualized for 10k+ commits
      - Click commit → show details
    - **Commit Details:**
      - Header: hash (copyable), author, date, relative time, message
      - Parent commits links
      - Changed files list with stats (+/- lines)
      - Diff preview for selected file
      - Actions: Copy hash, Copy message, Create tag, Cherry-pick, Revert, Reset to here (soft/mixed/hard)

  - **4.8.7** Git Blame / Annotate
    - **Trigger:** Right-click editor → "Git Blame" or `Ctrl+Shift+B`
    - **Overlay:** Inline annotations in editor gutter
      - Per-line: author avatar (from git config or Gravatar), author name, commit hash (short), relative time
      - Hover → tooltip with full commit message, date, hash
      - Click line → open that commit in History view
    - **Blame Toolbar:** Toggle heatmap (age-based color), filter by author, ignore whitespace

  - **4.8.8** Status Bar Git Integration
    - **Left side:** Branch name (click → branch picker)
    - **Sync indicator:** `↑N ↓M` (ahead/behind counts, click → pull/push)
    - **Status summary:** `●N` staged, `○M` unstaged, `?K` untracked (click → open Source Control)
    - **Actions on click:** Quick commit, Push, Pull, Fetch, Open Changes

  - **4.8.9** File Explorer Git Decorations
    - **Badges on tree nodes:**
      - `M` (modified) — orange
      - `A` (added/staged) — green
      - `D` (deleted) — red
      - `?` (untracked) — gray
      - `C` (conflict) — red with exclamation
      - `R` (renamed) — blue
    - **Folder rollup:** Aggregate counts (e.g., `src/ ●3 ○2`)
    - **Context menu additions:** Stage, Unstage, Discard, View Diff, View History, Open in GitHub

  - **4.8.10** Merge Conflict Resolution
    - **Detection:** On `git status` finding `UU` (unmerged) entries
    - **Conflict Editor:**
      - Three-way merge view (Ours | Base | Theirs) using Monaco Diff Editor
      - Inline conflict markers with accept current/accept incoming/accept both buttons
      - "Resolve All" with strategy picker (ours/theirs/union)
      - After resolution: auto-stage, show commit message pre-filled with "Merge branch X"
    - **Conflict Markers in Editor:** Standard `<<<<<<<`, `=======`, `>>>>>>>` highlighting

  - **4.8.11** GitHub / GitLab / Bitbucket Integration
    - **Remote URL parsing:** Detect provider from `origin` URL
    - **Actions:**
      - "Open in Browser" — opens repo/commit/file/PR/issue on provider
      - "Create Pull Request" — from current branch against default branch
      - "View Pull Requests" — list open PRs for repo
      - "Copy Permalink" — for current file/selection at current commit
    - **Authentication:** Uses system git credential helper (no token storage in app)

  - **4.8.12** Settings & Configuration
    - **Git Settings Panel:**
      - User name / email (per-repo or global)
      - Default branch name (`main` vs `master`)
      - Auto-fetch interval (disabled / 30s / 1m / 5m / 15m)
      - Sign commits (GPG/SSH) — configure signing key
      - Commit template file path
      - Diff algorithm (myers, minimal, patience, histogram)
      - Ignore whitespace in diff (none, all, eol, cr-at-eol)
      - Show inline blame annotations (always / hover / never)
      - Confirm before force push / delete branch
    - **Keyboard Shortcuts (add to registry):**
      - `Ctrl+Shift+G` → Toggle Source Control
      - `Ctrl+Alt+C` → Commit (focus message)
      - `Ctrl+Alt+P` → Push
      - `Ctrl+Alt+F` → Fetch
      - `Ctrl+Shift+L` → Open History
      - `Ctrl+Shift+B` → Toggle Blame
      - `Ctrl+D` → Open Diff for active file

  - **4.8.13** Performance & Reliability
    - **Debounced status refresh:** 300ms after file watcher events
    - **Incremental status:** Only re-scan changed paths when possible
    - **Background fetch:** Auto-fetch on interval (configurable) with silent update of ahead/behind
    - **Large repo support:**
      - `git status --porcelain=v2` for machine-parseable output
      - `git log --oneline --graph --decorate --all -n 100` for initial graph load
      - Virtualized commit graph rendering
      - Lazy-load blame on demand (per file)
    - **Error handling:**
      - Graceful degradation when git not installed (show "Git not found" banner)
      - Non-blocking operations — UI stays responsive during long-running commands
      - Timeout for git commands (30s default, configurable)
      - Retry with exponential backoff for network operations (push/pull/fetch)

- **4.9** Detect available shells on startup
  - Tauri command: `detect_shells() → string[]`
  - Windows: check for pwsh.exe, cmd.exe, wsl.exe
  - macOS/Linux: check /etc/shells

---

## Phase 5: Advanced Features✅✅✅

**Goal:** Power-user features for productivity.

**Status:** ✅ Complete

### Tasks

- **5.1** Search Across Files (Ctrl+Shift+F) ✅
  - `src-tauri/src/commands/search.rs` — Tauri `search_in_files` command
    - Uses `git grep` for git repos (handles .gitignore, binary files)
    - Falls back to `walkdir`-based line-by-line search for non-git dirs
    - Supports: case-sensitive, whole-word, regex, include/exclude patterns, max results
  - `src/components/search/SearchSidebar.tsx` — Sidebar search view
    - Debounced input (300ms), collapsible replace bar, match navigation (↑↓)
    - Results grouped by file, click to open file at line
    - Uses `useSettingsStore` exclude patterns + max results
  - `src/tauri/search.ts` — typed Tauri IPC wrapper
  - Wired into `Sidebar.tsx` (renders SearchSidebar when sidebarView === "search")

- **5.2** Command Palette (Ctrl+Shift+P) ✅
  - `src/components/command/CommandPalette.tsx` — Dialog overlay
    - Fuzzy search via `fuzzyFilter()` on command label + category
    - Arrow-key navigation, Enter to execute, Escape to close
    - Shows category badge + keybinding for each command
  - `src/lib/commandRegistry.ts` — Provider-based registry
    - `registerCommandProvider(fn)` — add dynamic command groups
    - `getAllCommands()` — cached flat list, invalidated on provider change
  - `src/lib/fuzzySearch.ts` — character-level fuzzy scoring
  - Commands registered in `ShellLayout.tsx`: Open File, Save, Save All, Toggle Sidebar, Toggle Terminal, Show Explorer/Search/Git, Command Palette, Settings, New/Kill Terminal

- **5.3** Settings Panel (Ctrl+,) ✅
  - `src/components/settings/SettingsPanel.tsx` — Dialog with search
    - 14 settings across General/Editor/Terminal categories
    - Controls: checkbox, number input, select dropdown, range slider, text input
    - Reset all to defaults button, searchable via fuzzy matching
  - `src/stores/settingsStore.ts` — Zustand with `persist` middleware
    - Settings: theme, autoSave, autoSaveDelay, editor.fontSize/fontFamily/tabSize/wordWrap/minimap/formatOnSave/breadcrumbs/lineNumbers, terminal.fontSize/fontFamily, search.excludePatterns/maxResults
    - `update(section, partial)` and `reset()` actions
  - `src/types/settings.ts` — `AppSettings` interface hierarchy

- **5.4** Configurable Minimap ✅
  - `MonacoEditor.tsx`: `minimap: { enabled, scale }` driven by `useSettingsStore.editor.minimap` and `minimapScale`
  - Toggle via Settings Panel (Editor > Minimap checkbox + scale slider)

- **5.5** Breadcrumb navigation ✅
  - `MonacoEditor.tsx`: `breadcrumbs: { enabled }` driven by `useSettingsStore.editor.breadcrumbs`
  - Monaco built-in implementation — no custom component needed

- **5.6** Problems Panel ✅
  - `src/components/terminal/ProblemsPanel.tsx` — Monaco marker viewer
    - Subscribes to `monaco.editor.getModelMarkers()` on 1s polling interval
    - Groups by severity (error/warning/info), shows file + line:col per problem
    - Clear button, empty state ("No problems detected")
  - Wired into `BottomPanel.tsx` under clickable "Problems" tab header

- **5.7** Format on Save ✅
  - `editorStore.saveFile()` — runs `editor.action.formatDocument` before writing to disk
  - Conditional on `useSettingsStore.editor.formatOnSave` setting
  - Uses `monaco.editor.getEditors()` to find the correct editor instance

### Files Created/Modified

| File | Status | Lines |
|------|--------|-------|
| `src/types/settings.ts` | Created | ~30 |
| `src/stores/settingsStore.ts` | Created | ~40 |
| `src/types/commands.ts` | Created | ~15 |
| `src/lib/fuzzySearch.ts` | Created | ~40 |
| `src/lib/commandRegistry.ts` | Created | ~35 |
| `src-tauri/src/commands/search.rs` | Created | ~170 |
| `src/tauri/search.ts` | Created | ~25 |
| `src/components/search/SearchSidebar.tsx` | Created | ~195 |
| `src/components/command/CommandPalette.tsx` | Created | ~105 |
| `src/components/settings/SettingsPanel.tsx` | Created | ~180 |
| `src/components/terminal/ProblemsPanel.tsx` | Created | ~85 |
| `src/components/layout/Sidebar.tsx` | Modified | +2 (search import + case) |
| `src/components/layout/BottomPanel.tsx` | Modified | ~80 (Problems tab + panel) |
| `src/components/editor/MonacoEditor.tsx` | Modified | settings-driven options, breadcrumbs |
| `src/stores/editorStore.ts` | Modified | +format-on-save in saveFile |
| `src/components/layout/ShellLayout.tsx` | Modified | +command palette, settings, providers |
| `src-tauri/src/commands/mod.rs` | Modified | +search module |
| `src-tauri/src/lib.rs` | Modified | +search_in_files handler |
| `src/tauri/index.ts` | Modified | +search export |


---

## Phase 6: Polish & Reliability✅✅✅

**Goal:** Production-ready stability, error handling, and performance.

### Tasks

- **6.1** Error boundaries
  - Wrap each panel (editor, explorer, terminal) in React error boundary
  - Fallback UI per panel ("Editor crashed, reload?")
- **6.2** Loading states
  - Skeleton/spinner when opening large folders
  - File open progress indicator
- **6.3** Save debounce + conflict detection
  - Debounce writes to disk (300ms)
  - Warn if file changed externally since last save
- **6.4** Large file handling
  - Warning when opening files > 5MB
  - Optional: only load first N lines with virtual scrolling
- **6.5** Recovery & persistence
  - Save open tabs list to localStorage on close
  - Restore tabs + cursor position on re-open (session restore)
  - Unsaved content recovery (backup to temp file every 30s)
- **6.6** Accessibility
  - Focus management between panels
  - ARIA labels on all interactive elements
  - Keyboard navigation for tree view
- **6.7** Performance optimization
  - Lazy load Monaco (code splitting)
  - Virtualize file tree for large directories
  - Limit number of open terminal sessions
  - Monaco model sharing for large files
- **6.8** Build configuration
  - Tauri production build flags
  - App icons (all platforms)
  - Bundle optimizations (tree-shaking, code splitting)
  - Windows: MSI installer, macOS: DMG, Linux: AppImage

---

## Appendix: Key Zustand Store Shapes

### uiStore
```ts
interface UiStore {
  sidebarOpen: boolean
  sidebarWidth: number
  terminalOpen: boolean
  terminalHeight: number
  theme: 'light' | 'dark'
  focusPanel: 'editor' | 'terminal' | 'explorer'
  toggleSidebar: () => void
  toggleTerminal: () => void
  setTheme: (theme: 'light' | 'dark') => void
}
```

### fileStore
```ts
interface FileStore {
  rootPath: string | null
  fileTree: FileNode[]
  expandedFolders: Set<string>
  selectedFile: string | null
  loading: boolean
  openFolder: (path: string) => Promise<void>
  refreshTree: () => Promise<void>
  toggleExpand: (path: string) => void
  selectFile: (path: string) => void
  createFile: (parentPath: string, name: string) => Promise<void>
  createFolder: (parentPath: string, name: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  delete: (path: string) => Promise<void>
}
```

### editorStore
```ts
interface EditorStore {
  openTabs: Tab[]
  activeTabId: string | null
  openFile: (path: string) => Promise<void>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<void>
  closeAll: () => void
  closeOthers: (id: string) => void
  getDirtyTabs: () => Tab[]
}
```

### terminalStore
```ts
interface TerminalStore {
  sessions: TerminalSession[]
  activeSessionId: string | null
  createSession: (shell?: string) => Promise<string>
  closeSession: (id: string) => Promise<void>
  setActiveSession: (id: string) => void
  writeToSession: (id: string, data: string) => void
  resizeSession: (id: string, cols: number, rows: number) => void
}
```

---

## Naming Conventions

- **Components:** PascalCase, one component per file
- **Stores:** camelCase with `Store` suffix (e.g., `useEditorStore`)
- **Hooks:** `use*` prefix (e.g., `useHotkey`, `useFileWatcher`)
- **Workers:** PascalCase with `Worker` suffix (e.g., `FileTreeWorker`)
- **Tauri commands:** snake_case (Rust convention)
- **TypeScript types:** PascalCase, interfaces preferred over types for objects
- **Files:** camelCase for utilities (`fileUtils.ts`), PascalCase for components (`MonacoEditor.tsx`)

## CSS Conventions

- shadcn/ui components stay in `components/ui/` with their default `cn()` utility
- Layout components use Tailwind exclusively
- Monaco and xterm theming done via their JS APIs, not CSS
- Custom CSS variables in root for theme colors