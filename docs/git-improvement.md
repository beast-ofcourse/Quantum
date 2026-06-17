# Git Source Control Improvement Plan

**Goal:** Match VS Code-level Git source control features — adding rich interactive capabilities while maintaining the existing Rust CLI + React architecture.

**Architecture:** Hybrid — all git operations via Rust CLI (`src-tauri/src/commands/git.rs`), structured JSON returned to React frontend for interactive UI rendering. No new JS git-parsing dependencies.


**Most important Note** Always write clean ,production ready optimized code.Always review it yourself even if the user didn't asked for.
--after every phase look for any errors/bugs and code quality issues if found any then fix them all.



---

## Phase 1 — Enhanced Diff & Hunk Staging✅✅✅

**Goal:** Stage/unstage individual hunks and lines within a file, matching VS Code's granular staging UX.

### Rust Backend (`src-tauri/src/commands/git.rs`)

Add new serializable structs for structured diff output:

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub index: usize,
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub section_header: String,
    pub lines: Vec<DiffLine>,
    pub file_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub content: String,
    pub old_line_number: Option<usize>,
    pub new_line_number: Option<usize>,
    #[serde(rename = "type")]
    pub line_type: String,  // "added" | "removed" | "context"
}
```

| Command | Implementation | Details |
|---------|---------------|---------|
| `git_diff_hunks` | Parse `git diff --unified=3 --inter-hunk-context=0` into structured `Vec<DiffHunk>` | Accept path + staged flag; parse `@@` headers for old/new line ranges, extract section header, classify lines as added/removed/context with correct line numbers |
| `git_stage_hunk` | Extract hunk text from diff output → write temp patch file → `git apply --cached <patch>` | Accept file path + hunk index; rebuild valid patch fragment from the diff; stage via temp file |
| `git_unstage_hunk` | Same as above but `git apply --cached --reverse <patch>` | Mirror of stage for unstaging |
| `git_stage_lines` | Construct temp patch from selected lines + surrounding context | Accept file path + `Vec<line_number>`; include required context lines from the diff to form valid patch; apply via temp file |

**Important:** Do NOT use `git add -p` / `git reset -p` — interactive pager commands are unreliable via `std::process::Command`. Use temp patch files + `git apply --cached` (or `--cached --reverse` for unstaging).

### Types (`src/types/git.ts`)

```typescript
interface DiffHunk {
  index: number
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  sectionHeader: string
  lines: DiffLine[]
  staged: boolean
  filePath: string
}

interface DiffLine {
  content: string
  oldLineNumber: number | null
  newLineNumber: number | null
  type: 'added' | 'removed' | 'context'
}
```

### Frontend

- **`GitDiffView.tsx`** — Complete rewrite to render hunks as structured blocks (current `parseDiff()` strips all hunk info)
  - Per-hunk stage/unstage button with loading state
  - Line-level click to select individual lines for staging
  - Visual highlight for selected lines (blue highlight)
  - Expand/collapse unchanged hunks with smooth animation
  - Display hunk section header (`@@ ... @@ fn foo`) as collapse header
  - Show line numbers gutter (old | new)
- **`gitStore.ts`** — New actions: `stageHunk(filePath, hunkIndex)`, `unstageHunk(filePath, hunkIndex)`, `stageLines(filePath, lines[])`
  - New state: `diffHunkCache: Record<string, DiffHunk[]>` (structured cache alongside existing `diffCache`)
  - Cache invalidation: clear on `refreshStatus`, `commit`, file save
- **Keyboard shortcuts** — `Ctrl+Enter` stage hunk, `Ctrl+Backspace` unstage hunk (no conflict with existing bindings)

### Error Handling

- `git_diff_hunks`: Return `Result<Vec<DiffHunk>, String>` — parse failures should surface malformed diff errors
- `git_stage_hunk` / `git_stage_lines`: Handle `git apply --cached` rejecting the patch (e.g. working tree modified since diff was fetched); show inline error with retry/refresh action
- Temp patch files: write to `std::env::temp_dir()` with unique names; clean up after operation
- Web worker: structured diff requests should have cache TTL of 3s (shorter than stable data) to avoid stale patch errors

---

## Phase 2 — Interactive Commit Graph✅✅✅

**Goal:** Visual commit DAG with branch topology, merge lines, ref badges, and clickable nodes.

### Rust Backend

**Important:** Do NOT parse `git log --graph` ASCII art — the output varies by git version, locale, and terminal width. Instead, get the DAG via parent hashes (`%P`) and compute column topology algorithmically.

Add new serializable structs:

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub refs: Vec<GraphRef>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub hash: String,
    pub parents: Vec<String>,
    pub message: String,
    pub author: String,
    pub date: String,
    pub children: Vec<String>,  // computed by reverse-lookup
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphRef {
    pub hash: String,
    pub name: String,
    pub ref_type: String,  // "branch" | "tag" | "head" | "remote"
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub hash: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub committer: String,
    pub stats: Vec<FileStat>,
    pub diff: String,  // raw diff text
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub path: String,
    pub added: usize,
    pub deleted: usize,
}
```

| Command | Implementation | Details |
|---------|---------------|---------|
| `git_log_graph` | `git log --all --format="%H|%P|%s|%an|%aI|%D"` — no `--graph`. Parse parent hashes for DAG topology. Compute children via reverse-lookup. Parse `%D` refs into structured `Vec<GraphRef>` (handle `HEAD -> branch`, `tag: v1.0`, `origin/branch` patterns) | Return `GraphData { nodes, refs }`. **No visual coordinates** — those are computed by the frontend layout. Extends `LogOptions` with `all: bool` flag (`--all`), reuses existing `max_count` support |
| `git_commit_detail` | `git show <hash> --format="%H%n%an%n%ae%n%aI%n%cN%n%B%n---STAT---" --stat` | Return `CommitDetail` with parsed file stats and raw diff text. Diff portion can also use `git_diff_hunks` from Phase 1 for structured diff |

**Ref parsing details (`%D` into `GraphRef[]`):**
- `HEAD -> main` → `{ name: "main", refType: "head" }` and `{ name: "origin/main", refType: "remote" }`
- `tag: v1.0` → `{ name: "v1.0", refType: "tag" }`
- `main` → `{ name: "main", refType: "branch" }`
- `origin/main` → `{ name: "origin/main", refType: "remote" }`
- Split by `, `, handle ` -> ` for HEAD detachment, check `tag:` prefix, detect remote via `origin/` prefix

### Graph Data Model (`src/types/git.ts`)

```typescript
interface GraphNode {
  hash: string
  parents: string[]
  message: string
  author: string
  date: string
  children: string[]
}

interface GraphRef {
  hash: string
  name: string
  refType: 'branch' | 'tag' | 'head' | 'remote'
}

interface CommitDetail {
  hash: string
  message: string
  authorName: string
  authorEmail: string
  date: string
  committer: string
  stats: FileStat[]
  diff: string
}

interface FileStat {
  path: string
  added: number
  deleted: number
}
```

### Frontend

- **`GitGraphView.tsx`** — New SVG-based commit DAG renderer
  - **Layout algorithm** (runs in-browser): assign columns to branches using a greedy algorithm — first-parent stays in same column, branching creates new column, merges draw lines between columns. Compute `x` (column * spacing) and `y` (row * rowHeight) from topological order
  - Nodes as clickable circles with commit message tooltip
  - Edges rendered as SVG paths (`<path d="...">`) between columns:
    - First-parent edge: straight vertical line
    - Merge edges: curved bezier from merge commit to second parent
    - Branch edges: dotted line from fork point
  - Ref badges rendered above/beside nodes (branch names, tag names, HEAD marker)
  - Zoom/pan via CSS transforms (mouse wheel + drag on SVG)
  - Click node → show commit detail panel (reuse `GitHistoryView.tsx` detail layout, or show inline detail panel in graph)
  - Right-click context menu: Checkout, Cherry-pick, Revert, Create Branch, Create Tag
  - Search/filter bar: filter visible nodes by message, author, branch name
- **Integration** — Add "Graph" tab in `GitSidebar.tsx` (`type Tab = "changes" | "github" | "graph"`)
- **Zustand** — `gitStore.graphData: GraphData | null`, `gitStore.selectedCommit: string | null`, actions: `fetchGraph(...)`, `selectCommit(hash)`

---

## Phase 3 — Interactive Rebase GUI ✅✅✅

**Goal:** Visual interactive rebase with drag-to-reorder, squash, reword, drop — matching VS Code rebase experience.

### Key Lessons from Phase 1 & 2 Applied

1. **DON'T do two-step "start with no-op editor, then modify"** — `git rebase -i` processes todos immediately after the editor exits. Instead, pass the user's todo directly via `GIT_SEQUENCE_EDITOR` script.
2. **Todo file only exists mid-rebase** — Before a rebase starts, `.git/rebase-merge/` doesn't exist. Generate initial todos from `git log --reverse`.
3. **Rebase has multiple pause states** — Conflict vs reword vs todo-edit — each requires different handling. Need a detect command.
4. **`@dnd-kit/sortable` is required** — Only `@dnd-kit/core` and `@dnd-kit/utilities` exist. Need `@dnd-kit/sortable` for sortable list widgets.

### Rust Backend

New structs:

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebaseTodo {
    pub index: usize,          // position in list
    pub original_index: usize, // original position (tracking across reorders)
    pub action: String,        // "pick" | "squash" | "fixup" | "reword" | "drop" | "edit"
    pub hash: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStatus {
    pub in_progress: bool,
    pub total: usize,
    pub current: usize,
    pub current_hash: String,
    pub current_message: String,
    pub pause_reason: String,  // "conflict" | "reword" | "todoEdit" | "edit" | "none"
    pub has_conflict: bool,
}
```

| Command | Implementation | Details |
|---------|---------------|---------|
| `git_rebase_detect` | Check `.git/rebase-merge/` exists → read `msgnum`, `end`, `head-name`, `onto`. Also check for `REBASE_HEAD` (conflict) or `.git/rebase-merge/message` (reword state) | Return `RebaseStatus { inProgress, total, current, pauseReason, hasConflict }`. Fast, no git binary call needed — pure file reads. Returns `{ inProgress: false }` if no rebase in progress |
| `git_rebase_todo_list` | **Two modes:** (a) pre-rebase — `git log --reverse --format="%H|%s" <target>..HEAD` formatted as `pick` entries. (b) mid-rebase — read `.git/rebase-merge/git-rebase-todo` **and** `.git/rebase-merge/done` for completed items | Accept `target: string` parameter for mode (a). Return `Vec<RebaseTodo>` with `originalIndex` = position in the list. Parse `done` file to mark already-processed items |
| `git_rebase_start` | Write a temp batch script that echoes the modified todo list to stdout, set `GIT_SEQUENCE_EDITOR` to that script, run `git rebase -i <target>`. Also set `GIT_EDITOR` to handle reword pauses | Accept `target: String` + `todos: Vec<RebaseTodo>`. **Do NOT** start with no-op editor and edit after — instead, write the user's todo directly as stdin to the editor script. Return `Result<RebaseStatus, String>` |
| `git_rebase_edit_todo` | Overwrite `.git/rebase-merge/git-rebase-todo` with modified items | Only valid when paused for `todoEdit`. Return `RebaseStatus` |
| `git_rebase_continue` | `git rebase --continue`. For reword pauses, set `GIT_EDITOR=<script>` that writes the user's new commit message | Accept `message: Option<String>` — if set and rebase is in reword pause, write it as commit message. Return `Result<RebaseStatus, String>` |
| `git_rebase_skip` | `git rebase --skip` | Return `Result<RebaseStatus, String>` |
| `git_rebase_abort` | `git rebase --abort`. If that fails (unlikely), fallback to `git rebase --quit` | Return success. Add `force: Option<bool>` — if true, use `--quit` instead |

**Return type convention:** All rebase commands return `Result<RebaseStatus, String>`. The `RebaseStatus` tells the frontend whether rebase is still in progress, completed, or paused. When `inProgress == false` and no error, the rebase is done.

**Reword handling detail:**
- When rebase pauses for reword, `.git/rebase-merge/message` contains the current commit message
- The frontend shows a modal with the message for editing
- When user confirms, `git_rebase_continue` is called with the new message
- Implementation: write a temp script that outputs the new message, set `GIT_EDITOR` to that script, run `git rebase --continue`

### Dependencies

Add to `package.json`:

```json
"@dnd-kit/sortable": "^8.0.0"
```

Need `SortableContext`, `useSortable`, `arrayMove` for drag-to-reorder todo list. These are not in core.

### Types

```typescript
interface RebaseTodo {
  index: number
  originalIndex: number  // tracks commit identity across reorder
  action: 'pick' | 'squash' | 'fixup' | 'reword' | 'drop' | 'edit'
  hash: string
  message: string
}

interface RebaseStatus {
  inProgress: boolean
  total: number
  current: number
  currentHash: string
  currentMessage: string
  pauseReason: 'conflict' | 'reword' | 'todoEdit' | 'edit' | 'none'
  hasConflict: boolean
}
```

### Frontend

- **`RebaseEditor.tsx`** — Multistep rebase workflow with state machine
  - **State: `generate-todo`** — On mount, call `git_rebase_todo_list(target)` to get initial todos. Show loading state.
  - **State: `editing`** — Drag-and-drop reorder via `@dnd-kit/sortable` (`SortableContext`, `useSortable`, `arrayMove`).
    - Action picker per commit (dropdown: pick/squash/fixup/reword/drop/edit)
    - Reword icon on commits marked `reword` (opens modal to edit message)
    - Validation: cannot squash into first commit, cannot have all drops
    - "Start Rebase" button calls `git_rebase_start(target, todos)`
  - **State: `running`** — Show progress bar (`current / total`). Poll `git_rebase_detect` every 2s. Show current commit detail.
    - "Abort" button calls `git_rebase_abort`
  - **State: `conflict`** — Show conflict details, link to `MergeConflictResolver.tsx`.
    - "Continue" (after resolving), "Skip", "Abort" buttons
  - **State: `reword`** — Modal with editable message. "Save" calls `git_rebase_continue(message)`.
  - **State: `done`** — Success notification with summary (how many commits applied/skipped/squashed).
- **Status bar** — Show rebase progress: `Rebasing (3/7)` with indicator (reads from `gitStore.rebaseStatus`)
- **Store** — `gitStore.rebaseState`:
  ```typescript
  rebaseStatus: RebaseStatus | null
  rebaseTodos: RebaseTodo[]
  rebaseStep: 'generate-todo' | 'editing' | 'running' | 'conflict' | 'reword' | 'todoEdit' | 'done'
  ```
  Actions: `detectRebase()`, `fetchRebaseTodos(target)`, `startRebase(target, todos)`, `continueRebase(message?)`, `skipRebase()`, `abortRebase(force?)`, `editRebaseTodos(todos)`

### Error Handling

- **Dirty worktree**: `git_rebase_start` should check `git status --porcelain` first; return structured error "Uncommitted changes — commit or stash before rebasing"
- **Rebase already in progress**: Detect via `git_rebase_detect` before `start`; return error with current status
- **Stale todo**: If rebase state changed externally (e.g., another process), poll `git_rebase_detect` on each action and show "State changed" with refresh option
- **All drop validation**: If user sets all commits to `drop`, warn but allow it (creates empty rebase = fast-forward)
- **Conflict resolution timeout**: If user is in conflict state for >30min, suggest abort

### Safety

- Block rebase start if worktree has uncommitted changes (check via existing `git_status`)
- Detect existing rebase state on app startup via `git_rebase_detect` (runs once on mount)
- Confirm dialog before abort (irreversible)
- Write backup of todo file before `git_rebase_edit_todo` (to `.git/rebase-merge/git-rebase-todo.backup`)

---

## Phase 4 — Tags, Cherry-Pick, Revert & Branch Compare✅✅✅

**Goal:** Complete commit-level operations with proper conflict handling. Covers tags (list/create/delete/push), cherry-pick (with detection, conflict handling, continue/abort), revert (with detection, merge parent handling), and branch compare (bidirectional).

**Key Lessons from Phase 3 Applied:**

1. **Cherry-pick & revert need detection commands too** — Just like `git_rebase_detect` checks `.git/rebase-merge/`, cherry-pick state lives in `.git/CHERRY_PICK_HEAD` and revert state in `.git/REVERT_HEAD`. Both can have conflicts. Don't assume a single synchronous call.
2. **`git_tag_push` should reuse existing `git_push` auth** — The existing `git_push` already handles token-based auth via `GIT_CONFIG_PARAMETERS`. Tag push can either go through `git_push` with `options.tags: true` or replicate that pattern.
3. **Branch compare is bidirectional** — Showing commits in `<base>..<head>` only gives ahead. Need `<head>..<base>` for behind too.
4. **Tags and branch compare are cacheable** — Read-only data should go through the web worker; cherry-pick/revert are actions and bypass it.

### Rust Backend

Add new serializable structs:

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitTag {
    pub name: String,
    pub hash: String,
    pub date: String,         // tagger date (empty for lightweight)
    pub message: String,      // tag annotation (empty for lightweight)
    pub is_annotated: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CherryPickOptions {
    pub no_commit: Option<bool>,
    pub strategy_theirs: Option<bool>,
    pub hashes: Option<Vec<String>>,  // support multiple hashes (sequential cherry-pick)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CherryPickStatus {
    pub in_progress: bool,
    pub current_hash: String,
    pub has_conflict: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RevertOptions {
    pub no_commit: Option<bool>,
    pub parent_number: Option<u32>,  // for merge commits (-m)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RevertStatus {
    pub in_progress: bool,
    pub current_hash: String,
    pub has_conflict: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BranchCompareResult {
    pub ahead_commits: Vec<String>,
    pub behind_commits: Vec<String>,
    pub files: Vec<FileStat>,
    pub ahead_count: usize,
    pub behind_count: usize,
}
```

| Command | Implementation | Details |
|---------|---------------|---------|
| `git_tag_list` | `git tag --list --format="%(refname:short)|%(objectname)|%(taggerdate)|%(contents:subject)"` | Parse pipe-delimited output. If `taggerdate` is empty, the tag is lightweight (`isAnnotated: false`). Return `Vec<GitTag>` |
| `git_tag_create` | `git tag -a <name> -m <message> <commit>` or lightweight variant | Accept `annotated: Option<bool>` — if `true` (default), use `-a -m`; if `false`, use lightweight `git tag <name> <commit>` |
| `git_tag_delete` | `git tag -d <name>` | Return `Result<(), String>` |
| `git_tag_push` | `git push origin <tagname>` | **Do NOT replicate token auth** — instead, callers should use existing `git_push` with `options.tags: true` to push all, or this command accepts `token` param following `git_push`'s env var auth pattern (lines 434-454 of git.rs) |
| `git_cherry_pick` | `git cherry-pick <hash>...` with `--no-commit` and `-X theirs` options | Accept `options: Option<CherryPickOptions>`. If `hashes` has multiple entries, cherry-pick them sequentially. Return `Result<CherryPickStatus, String>`. On conflict, detect via `.git/CHERRY_PICK_HEAD` and return `{ inProgress: true, hasConflict: true }` |
| `git_cherry_pick_detect` | Check `.git/CHERRY_PICK_HEAD` exists | Return `CherryPickStatus { inProgress, currentHash, hasConflict }`. Fast, pure file reads — no git binary call |
| `git_cherry_pick_continue` | `git cherry-pick --continue` | After user resolves conflicts. Return `CherryPickStatus` |
| `git_cherry_pick_abort` | `git cherry-pick --abort` | Return `CherryPickStatus` with `inProgress: false` |
| `git_revert` | `git revert <hash>` with `--no-commit` and `-m <parent>` options | Accept `options: Option<RevertOptions>`. For merge commits, require `parentNumber`. Return `Result<RevertStatus, String>`. On conflict, detect via `.git/REVERT_HEAD` |
| `git_revert_detect` | Check `.git/REVERT_HEAD` exists | Return `RevertStatus { inProgress, currentHash, hasConflict }`. Fast, pure file reads |
| `git_branch_compare` | `git rev-list --count <base>..<head>` + `git rev-list --count <head>..<base>` + `git diff --stat <base>..<head>` | Return `BranchCompareResult` with both-direction commit lists (truncated to 100 each), ahead/behind counts, and structured file stats |

**Cherry-pick detection detail:**
- `.git/CHERRY_PICK_HEAD` exists when cherry-pick is in progress (including conflicts)
- `.git/sequencer/todo` contains remaining cherry-pick operations
- On conflict, `git diff --name-only --diff-filter=U` lists conflicted files (reuse from Phase 1)

**Revert detection detail:**
- `.git/REVERT_HEAD` exists when revert is in progress
- File is removed by `git revert --abort` or `--continue`
- Same conflict detection pattern as cherry-pick

### Types (`src/types/git.ts`)

```typescript
export interface GitTag {
  name: string
  hash: string
  date: string
  message: string
  isAnnotated: boolean
}

export interface CherryPickOptions {
  noCommit?: boolean
  strategyTheirs?: boolean
  hashes?: string[]
}

export interface CherryPickStatus {
  inProgress: boolean
  currentHash: string
  hasConflict: boolean
}

export interface RevertOptions {
  noCommit?: boolean
  parentNumber?: number
}

export interface RevertStatus {
  inProgress: boolean
  currentHash: string
  hasConflict: boolean
}

export interface BranchCompareResult {
  aheadCommits: string[]
  behindCommits: string[]
  files: FileStat[]
  aheadCount: number
  behindCount: number
}
```

### Tauri Bridge (`src/tauri/git.ts`)

Add 10 new bridge functions following the existing `invoke<T>()` pattern:

| Function | Signature |
|----------|-----------|
| `gitTagList` | `(root: string) => Promise<GitTag[]>` |
| `gitTagCreate` | `(root: string, name: string, message: string, commit: string, annotated?: boolean) => Promise<void>` |
| `gitTagDelete` | `(root: string, name: string) => Promise<void>` |
| `gitCherryPick` | `(root: string, hash: string, options?: CherryPickOptions) => Promise<CherryPickStatus>` |
| `gitCherryPickDetect` | `(root: string) => Promise<CherryPickStatus>` |
| `gitCherryPickContinue` | `(root: string) => Promise<CherryPickStatus>` |
| `gitCherryPickAbort` | `(root: string) => Promise<CherryPickStatus>` |
| `gitRevert` | `(root: string, hash: string, options?: RevertOptions) => Promise<RevertStatus>` |
| `gitRevertDetect` | `(root: string) => Promise<RevertStatus>` |
| `gitBranchCompare` | `(root: string, base: string, head: string) => Promise<BranchCompareResult>` |

Note: `git_tag_push` is intentionally omitted — use existing `gitPush` with `{ tags: true }` instead.

### Web Worker (`src/workers/git.worker.ts`)

Add new request types for cacheable read-only operations:
- `"tags"` → `gitTagList(root)` — cache TTL: 10s (tags change less frequently than status)
- `"branch_compare"` → `gitBranchCompare(root, base, head)` — cache TTL: 5s

Cherry-pick and revert are action operations (mutate state) and should NOT go through the worker.

### Zustand Store (`src/stores/gitStore.ts`)

**New state:**
```typescript
tags: GitTag[]
tagsLoading: boolean
cherryPickStatus: CherryPickStatus | null
revertStatus: RevertStatus | null
branchCompareResult: BranchCompareResult | null
branchCompareBase: string
branchCompareHead: string
```

**New actions:**
```typescript
refreshTags: () => Promise<void>        // via worker
createTag: (name: string, message: string, commit: string, annotated?: boolean) => Promise<void>
deleteTag: (name: string) => Promise<void>
cherryPick: (hash: string, options?: CherryPickOptions) => Promise<void>
detectCherryPick: () => Promise<void>
continueCherryPick: () => Promise<void>
abortCherryPick: () => Promise<void>
revert: (hash: string, options?: RevertOptions) => Promise<void>
detectRevert: () => Promise<void>
compareBranches: (base: string, head: string) => Promise<void>
setBranchCompareBase: (base: string) => void
setBranchCompareHead: (head: string) => void
```

**Cache invalidation:** Clear `tags` on `refreshStatus`, `commit`, push. Clear `cherryPickStatus` / `revertStatus` on `refreshStatus`.

**Startup detection:** Call `detectCherryPick()` and `detectRevert()` on app mount (alongside existing `detectRebase()`) to pick up in-progress operations from a previous session.

### Frontend Components

#### Tag Management (`TagManager.tsx`)
- Expandable section in the Changes sidebar (below branches, above stashes)
- List tags with name, commit hash preview, date, annotated/lightweight badge
- Context menu per tag: Delete, Push to Remote (with remote picker)
- "New Tag" button → dialog with:
  - Name input (validated: no spaces, no special chars)
  - Optional message textarea (shown only when annotated is toggled)
  - Annotated / Lightweight toggle
  - Commit selector (dropdown of recent branch heads, or paste hash)
- Push tag via existing `gitPush` with `{ tags: true }` or a remote-picker dialog

#### Cherry-Pick UI (`CherryPickDialog.tsx`)
- Launched from GitGraphView context menu ("Cherry-pick") or GitHistoryView toolbar
- Options dialog:
  - Commit hash(es) display
  - `--no-commit` checkbox (stages changes without committing)
  - `-X theirs` strategy checkbox (auto-resolve conflicts favoring theirs)
  - "Start Cherry-pick" button
- After start, show progress/status:
  - If conflict: show "Cherry-pick paused — resolve conflicts" with links to `MergeConflictResolver.tsx`
  - "Continue" button (after resolving) calls `continueCherryPick`
  - "Abort" button calls `abortCherryPick`
- On success: notification with applied hash(es)
- **State machine:** `idle` → `applying` → `conflict` / `done`

#### Revert UI (`RevertDialog.tsx`)
- Launched from GitGraphView context menu ("Revert") or commit detail panel
- Options dialog:
  - Commit hash display
  - Preview section: show what the revert will change (call `git_diff` against the parent)
  - `--no-commit` checkbox
  - Parent number selector (only shown for merge commits — fetch parents of the target commit)
  - "Start Revert" button
- On conflict: same conflict resolution pattern as cherry-pick
- State machine: `idle` → `applying` → `conflict` / `done`

#### Branch Compare (`GitBranchCompare.tsx`)
- Accessible from Graph view toolbar button or separate tab
- Two branch selectors (dropdowns populated from `branches` state)
- Results display:
  - Ahead count + commit list (click to view detail)
  - Behind count + commit list (click to view detail)
  - File list diff with added/deleted counts per file
  - Click file to open diff

#### GitGraphView Context Menu Additions (`src/components/git/GitGraphView.tsx`)
Add to existing context menu (around line 450):
```tsx
<ContextMenuSeparator />
<ContextMenuItem onClick={() => handleCherryPick(node.hash)}>
  Cherry-pick
</ContextMenuItem>
<ContextMenuItem onClick={() => handleRevert(node.hash)}>
  Revert
</ContextMenuItem>
<ContextMenuItem onClick={() => handleCreateTag(node.hash)}>
  Create Tag
</ContextMenuItem>
```
- `handleCherryPick(hash)` → open `CherryPickDialog` with pre-filled hash
- `handleRevert(hash)` → open `RevertDialog` with pre-filled hash
- `handleCreateTag(hash)` → open `TagManager` create dialog with pre-filled commit

### Sidebar Integration (`GitSidebar.tsx`)

Current tabs: `Changes | Graph | GitHub`. Add tags section into the Changes panel (collapsible below branches) and branch compare as a toolbar button in the Graph view. No new top-level tab needed.

### Error Handling

- **Tag already exists**: `git tag_create` returns an error — surface as inline message with overwrite option (delete + recreate)
- **Tag push fails** (no remote, auth failure): show error with retry button
- **Cherry-pick conflict**: detect via `git_cherry_pick_detect` returning `hasConflict: true`; show `MergeConflictResolver.tsx` inline
- **Revert merge commit without parent**: validate and return structured error "Merge commit requires a parent number (-m)"
- **Branch compare with invalid ref**: return `Err` with git's error message

### Safety

- **Confirm before abort**: Add confirmation dialog before `cherryPickAbort` / `revertAbort`, matching Phase 3's rebase abort pattern
- **Block cherry-pick with dirty worktree**: Check `git status --porcelain` before starting; return structured error
- **Block revert with dirty worktree**: Same check as cherry-pick
- **Auto-detect on app startup**: Run `git_cherry_pick_detect` and `git_revert_detect` in `checkIsRepo()` alongside existing `detectRebase()`

---

## Phase 5 — Stash, Worktree & Bisect

**Goal:** Advanced git workflow tooling for power users.

**Architecture note:** Follow the same patterns established in Phases 1-4 — Rust structs with `#[serde(rename_all = "camelCase")]`, typed Tauri bridge functions, Zustand store with cache invalidation, and Web Worker for read-only operations.

### Existing State (Pre-Phase 5)

| Item | Status |
|------|--------|
| Stash list/push/pop/drop | ✅ Rust, bridge, store, worker, `StashManager.tsx` |
| Stash show/apply/partial | ❌ Nothing |
| Worktree (all) | ❌ Nothing — no Rust, no bridge, no types, no UI |
| Bisect (all) | ❌ Nothing — no Rust, no bridge, no types, no UI |

---

### Rust Backend

Add serializable structs following Phase 1-4 conventions:

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StashOptions {
    pub paths: Option<Vec<String>>,   // for partial stash
    pub message: Option<String>,
    pub keep_index: Option<bool>,     // --keep-index
    pub staged: Option<bool>,         // --staged (only stash staged)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StashApplyResult {
    pub success: bool,
    pub has_conflict: bool,
    pub conflicted_files: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeEntry {
    pub path: String,
    pub branch: String,
    pub commit: String,
    pub is_dirty: bool,
    pub is_bare: bool,
    pub is_detached: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BisectStatus {
    pub in_progress: bool,
    pub step: String,             // "running" | "done" | "error"
    pub current_hash: String,
    pub current_message: String,
    pub remaining: usize,         // number of commits in remaining range
    pub total: usize,             // total commits at start
    pub first_bad_hash: Option<String>,
    pub first_bad_message: Option<String>,
    pub log: String,              // git bisect log output
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BisectStartOptions {
    pub bad: String,              // commit hash (default: HEAD)
    pub good: String,             // known-good commit
    pub paths: Option<Vec<String>>, // -- <paths> to scope bisect
}
```

| Command | Implementation | Details |
|---------|---------------|---------|
| `git_stash_show` | `git stash show -p stash@{<n>}` → parse into `Vec<DiffHunk>` (reuse Phase 1 struct) | Accept `index: usize`. Return structured diff for rendering in `GitDiffView`. Reuse `DiffHunk` type from Phase 1 |
| `git_stash_apply` | `git stash apply stash@{<n>} [--index]` | Accept `index: usize` + `restore_index: Option<bool>`. Return `StashApplyResult`. **Does NOT drop** — that's `stash_pop`. Detect conflicts post-apply via `git diff --name-only --diff-filter=U` |
| `git_stash_partial` | `git stash push -- <paths>` | Accept `paths: Vec<String>` + optional `message` + options from `StashOptions`. Return success or error |
| `git_worktree_list` | `git worktree list --porcelain` → parse into `Vec<WorktreeEntry>` | Parse `worktree <path>`, `HEAD <hash>`, `branch refs/heads/<name>`, `dirty` tag. Return structured list |
| `git_worktree_add` | `git worktree add <path> [<branch>]` | Accept `path: String` + `branch: Option<String>` (if omitted, create branch named after last path segment). If `branch` is a remote branch, use `git worktree add <path> <branch>`. Return `WorktreeEntry` |
| `git_worktree_remove` | `git worktree remove <path>` | Accept `path: String`. Return success or structured error if dirty (force flag: `force: Option<bool>` → `git worktree remove --force`) |
| `git_worktree_prune` | `git worktree prune` | No args. Remove stale worktree metadata |
| `git_bisect_start` | `git bisect start <bad> <good> [-- <paths>]` | Accept `options: BisectStartOptions`. Validate that good commit is an ancestor of bad. Return `BisectStatus`. **Require clean worktree** — check via `git status --porcelain` first |
| `git_bisect_state` | `git bisect good` / `git bisect bad` / `git bisect skip` | Accept `state: String` ("good"\|"bad"\|"skip") + optional `hash: Option<String>`. Return `BisectStatus`. If done, set `first_bad_hash` in status |
| `git_bisect_log` | `git bisect log` | Return log as plain text string |
| `git_bisect_reset` | `git bisect reset` | No args. Return success |

**Key implementation details:**

- **Stash apply conflict detection**: After `git stash apply`, run `git diff --name-only --diff-filter=U` to check for conflicts. If conflicts exist, the user must resolve them manually and `git stash drop` if they want to keep the changes. The stash is NOT automatically dropped on apply.
- **Worktree path validation**: Check path is not already a worktree via `git worktree list --porcelain` before attempting add. Check that branch is not already checked out elsewhere.
- **Bisect dirty worktree check**: Use existing `git_status` (or `git status --porcelain`) before `bisect_start`. Return structured error "Uncommitted changes — commit or stash before bisecting".
- **Bisect status polling**: After `git_bisect_state`, poll `git_bisect_log` to detect completion. When `BisectStatus.step == "done"`, set `first_bad_hash` from `git bisect log` output (last `# first bad commit: [hash]` line).

---

### Types (`src/types/git.ts`)

```typescript
export interface StashOptions {
  paths?: string[]
  message?: string
  keepIndex?: boolean
  staged?: boolean
}

export interface StashApplyResult {
  success: boolean
  hasConflict: boolean
  conflictedFiles: string[]
}

export interface WorktreeEntry {
  path: string
  branch: string
  commit: string
  isDirty: boolean
  isBare: boolean
  isDetached: boolean
}

export interface BisectStatus {
  inProgress: boolean
  step: 'running' | 'done' | 'error'
  currentHash: string
  currentMessage: string
  remaining: number
  total: number
  firstBadHash?: string
  firstBadMessage?: string
  log: string
}
```

---

### Tauri Bridge (`src/tauri/git.ts`)

Add 11 new bridge functions following the existing `invoke<T>()` pattern:

| Function | Signature |
|----------|-----------|
| `gitStashShow` | `(root: string, index: number) => Promise<DiffHunk[]>` |
| `gitStashApply` | `(root: string, index: number, restoreIndex?: boolean) => Promise<StashApplyResult>` |
| `gitStashPartial` | `(root: string, paths: string[], options?: StashOptions) => Promise<void>` |
| `gitWorktreeList` | `(root: string) => Promise<WorktreeEntry[]>` |
| `gitWorktreeAdd` | `(root: string, path: string, branch?: string) => Promise<WorktreeEntry>` |
| `gitWorktreeRemove` | `(root: string, path: string, force?: boolean) => Promise<void>` |
| `gitWorktreePrune` | `(root: string) => Promise<void>` |
| `gitBisectStart` | `(root: string, options: BisectStartOptions) => Promise<BisectStatus>` |
| `gitBisectState` | `(root: string, state: string, hash?: string) => Promise<BisectStatus>` |
| `gitBisectLog` | `(root: string) => Promise<string>` |
| `gitBisectReset` | `(root: string) => Promise<void>` |

Where `BisectStartOptions` types the TS interface:
```typescript
export interface BisectStartOptions {
  bad: string
  good: string
  paths?: string[]
}
```

**Note:** `git_stash_show` returns `Vec<DiffHunk>` to reuse the existing `GitDiffView` component. The bridge returns `DiffHunk[]`.

---

### Web Worker (`src/workers/git.worker.ts`)

Add new cacheable read-only request types:

- `"stash_show"` → `gitStashShow(root, index)` — cache TTL: 30s (stash content is static once created)
- `"worktrees"` → `gitWorktreeList(root)` — cache TTL: 10s (changes infrequently)
- `"bisect_log"` → `gitBisectLog(root)` — cache TTL: 2s (bisect state changes frequently mid-session)

Action operations (mutate state) should NOT go through the worker:
- `stash_apply`, `stash_partial`
- `worktree_add`, `worktree_remove`, `worktree_prune`
- `bisect_start`, `bisect_state`, `bisect_reset`

---

### Zustand Store (`src/stores/gitStore.ts`)

**New state:**
```typescript
// Stash extensions
stashViewDiff: DiffHunk[] | null
stashViewLoading: boolean
stashApplyResult: StashApplyResult | null

// Worktree
worktrees: WorktreeEntry[]
worktreesLoading: boolean

// Bisect
bisectStatus: BisectStatus | null
bisectLoading: boolean
```

**New actions:**
```typescript
// Stash extensions
stashShow: (index: number) => Promise<void>           // via worker
stashApply: (index: number, restoreIndex?: boolean) => Promise<void>
stashPartial: (paths: string[], message?: string) => Promise<void>
clearStashView: () => void
clearStashApplyResult: () => void

// Worktree
refreshWorktrees: () => Promise<void>                  // via worker
addWorktree: (path: string, branch?: string) => Promise<void>
removeWorktree: (path: string, force?: boolean) => Promise<void>
pruneWorktrees: () => Promise<void>

// Bisect
bisectStart: (options: BisectStartOptions) => Promise<void>
bisectGood: (hash?: string) => Promise<void>
bisectBad: (hash?: string) => Promise<void>
bisectSkip: (hash?: string) => Promise<void>
bisectReset: () => Promise<void>
refreshBisectLog: () => Promise<void>                  // via worker
```

**Cache invalidation:**
- Clear `stashViewDiff` on `refreshStashes`, stash push/pop/drop
- Clear `stashApplyResult` on stash push/pop/drop, status refresh
- Clear `worktrees` on worktree add/remove/prune
- Clear `bisectStatus` on status refresh, commit, checkout

**Startup detection:** Call `refreshWorktrees()` in `checkIsRepo()`. Bisect detection happens via `bisectReset` only if user starts one.

---

### Frontend Components

#### Stash Improvements (`StashManager.tsx`)

**Diff preview:**
- Replace current `alert()` view call with `gitStashShow` call via worker
- On stash select/click → load diff via `stashShow(index)` → render in `GitDiffView` component
- Show diff inline within stash list (expandable panel per stash) or open in main diff view area
- Add "View" button that loads stash diff into `GitDiffView` (reuse existing)

**Apply (without drop):**
- Add "Apply" button separated from "Pop" (Pop = Apply + Drop)
- Apply calls `stashApply(index)` → shows result (success or conflict)
- On conflict: show conflicted files list with "Open File" links, integrate with `MergeConflictResolver.tsx`
- After successful apply, allow user to "Drop" the stash manually

**Partial stash dialog:**
- Launched from stash section "+" button or separate "Stash Selected" button in changes list
- File picker: checkbox list of all unstaged/untracked files (reuse `GitChanges` file list)
- Optional message input
- "Stash Selected" button → calls `stashPartial(selectedPaths, message)`
- After success → refresh stashes + status

#### Worktree Manager (`GitWorktreePanel.tsx`)

**Placement:** Collapsible section in the Changes sidebar (below Remotes section), matching Branch/Tag/Remote/Stash collapsible pattern.

**List view:**
- Show all worktrees with: path (truncated), branch name, commit hash (short), dirty indicator (yellow dot)
- Current worktree highlighted with "→" marker
- Hover actions: Open (open in file explorer), Remove (with confirm dialog if dirty)

**Add worktree dialog:**
- Path picker: input field (validated: not existing, not subdir of another worktree)
- Branch selector: dropdown of local branches + "Create new branch" option
  - New branch: input field for branch name
  - Existing branch: auto-detects if checked out elsewhere (show warning)
- Commit target: optional (defaults to branch tip)
- "Create Worktree" button

**Safety:**
- Confirm before remove: "Remove worktree at {path}?" with force option checkbox if dirty
- Prune button in section header (only shown if orphaned entries detected)
- Detect and warn if branch is already checked out in another worktree

#### Bisect Helper (`GitBisectWizard.tsx`)

**Access:** Launched from a "Bisect" button in the Graph view toolbar or sidebar section.

**Step 1 — Start:**
- Bad commit: pre-filled with HEAD (read-only display, or editable)
- Good commit: dropdown/input of recent commits (loaded from `gitLog`)
- Optional paths filter: comma-separated paths to scope bisect
- "Start Bisect" button → calls `bisectStart(options)`
- Validation: good must be ancestor of bad; clean worktree required

**Step 2 — Running:**
- Progress display: `Remaining: {remaining} commits (of {total} total)`
- Current commit: hash (short + copy button), message, author, date
- Three large action buttons:
  - ✅ **Good** (green) — marks current commit as good → advances bisect
  - ❌ **Bad** (red) — marks current commit as bad → advances bisect
  - ⏭ **Skip** (yellow) — skips untestable commit
- Keyboard shortcuts: `g` = good, `b` = bad, `s` = skip
- "Show Log" expandable section renders `bisectLog` output
- "Abort" button → calls `bisectReset` with confirm dialog

**Step 3 — Complete:**
- Announce first bad commit: hash, message, author, date
- Show commit detail (reuse detail panel from graph/history)
- "View Commit" button (opens in history/explorer)
- "Abort" button to reset bisect state
- Auto-detect completion: when `bisectStatus.step === "done"`, auto-transition to Step 3

**States:**
- `idle` → initial (show start form)
- `running` → mid-bisect (show good/bad/skip buttons)
- `complete` → first bad commit found (show result)

**Dirty worktree handling:**
- Check `git status --porcelain` before `bisectStart`
- If dirty, show warning with "Stash changes and continue" option (auto-stash before starting)
- On bisect reset, auto-pop the stash if it was auto-created

---

### Sidebar Integration (`GitSidebar.tsx`)

- Stash improvements: remain in the existing `StashManager` collapsible section
- Worktree Manager: new collapsible section below Remotes in the Changes tab
- Bisect: accessible via a "Bisect" button in the Graph view toolbar (next to refresh)

Current sidebar order in Changes tab:
1. Commit box
2. Changes list (staged/unstaged)
3. Branches (collapsible)
4. Tags (collapsible)
5. Stashes (collapsible) ← Stash improvements go here
6. Remotes (collapsible)
7. Worktrees (collapsible) ← New section

### Error Handling

- **Stash apply conflict**: Return `StashApplyResult { hasConflict: true, conflictedFiles }` — show inline message "Stash applied with conflicts" with file list + resolve links
- **Stash partial with no files selected**: Return validation error before calling git
- **Worktree add - path conflict**: Catch git error "already exists" → suggest different path
- **Worktree add - branch conflict**: Catch "already checked out" → warn user
- **Worktree remove - dirty**: Require `force: true` confirmation; show dirty files preview
- **Bisect start - dirty worktree**: Return error with auto-stash suggestion
- **Bisect start - invalid range**: Validate good is ancestor of bad; return specific error
- **Bisect state - no bisect in progress**: Return error if `bisectState` called without active bisect

### Safety

- **Stash apply does NOT auto-drop** — user must explicitly drop after verifying
- **Stash partial leaves working tree clean** — only stashes specified files
- **Worktree remove requires confirmation** — especially if dirty (force flag)
- **Bisect start requires clean worktree** — auto-stash option available
- **Bisect abort is reversible** — `git bisect reset` returns to original state
- **Keyboard shortcuts disabled when dialogs open** — prevent accidental bisect state changes

---

## Phase 6 — UI Polish & Performance

**Goal:** Production-quality finish across all Git components.

### UI Polish

- **Loading states**: shadcn `Skeleton` placeholders for graph, history, diff, stash list, branch compare, cherry-pick/revert dialogs, branch/tag lists, stash-show diff. Create a reusable `GitSkeleton` component (like `FileTreeSkeleton` at `src/components/ui/skeleton.tsx`) for consistent git loading placeholders.
- **Error states**: inline error messages with retry button per component. Standardize on a consistent pattern: pull `error` from store state, show inline alert with retry action. Avoid mixing local error state vs store error state.
- **Empty states**: contextual empty states for every view (no stashes, no worktrees, no branches, no tags, no commits, no changes, no compare results, etc.)
- **Consistent styling**: unified spacing, typography, icon usage across all git components
- **Keyboard shortcuts** — Scope correctly:
  - `Ctrl+Enter` — stage hunk → **keep local** in `GitDiffView.tsx:340` (already exists, no global registration needed)
  - `Ctrl+Backspace` — unstage hunk → **keep local** in `GitDiffView.tsx:345` (already exists)
  - Graph navigation arrow keys → **keep local** in `GitGraphView.tsx:279-293` (already exists)
  - Rebase editor numbers (1=pick, 2=squash, 3=fixup, 4=reword, 5=drop) → **add globally** in `useGitHotkeys.ts` (missing)
  - After stage/unstage completes, re-focus the diff view container (`.focus()`) to maintain keyboard flow
- **Graph filter debounce**: debounce graph search/filter input by 150ms before re-computing `filteredNodes` to avoid lag on large graphs
- **Accessibility**:
  - ARIA labels on graph SVG node `<circle>` elements: `role="img"` and `aria-label="Commit {hash.slice(0,7)} by {author}: {message}"`. Add `tabIndex={0}` on the main graph `<svg>` so keyboard navigation works directly.
  - Keyboard navigation in rebase editor (Tab between items)
  - Focus management in dialogs (shadcn Dialog already handles this — verify, don't over-engineer)
  - Screen reader support for diff view

### Performance (Ordered by dependency)

- **Large repo Rust limits** (already partially done): `git_log_graph` already has `--max-count=500` default. `git_log` accepts `maxCount` in `LogOptions`. Verify the limits are sufficient for repos with 10k+ commits.
- **History cursor pagination**: add `before_hash: Option<String>` to Rust `LogOptions` struct in `src-tauri/src/commands/git.rs:192`, wire it into the `git log` invocation. This enables the frontend to request "50 commits before commit X" rather than `maxCount` only.
- **Graph node-limit rendering**: replace viewport-based SVG virtualization (complex, fragile) with a node-count cap (e.g. first 300 nodes) + "Show older commits" button that increases the limit by 200. Skip viewport culling unless scrolling with 500+ nodes is measurably slow.
- **Web worker cache**: replace the single `CACHE_TTL = 5000` with a per-type TTL map. Set `graph: 30000`, `tags: 30000`, `remotes: 30000`, `status: 2000`, `diff_hunks: 0` (never cache), rest at `5000`. Invalidate cache entries when the user creates/deletes tags or remotes.
- **Status polling**: add `useEffect` in `GitSidebar.tsx` that starts a `setInterval(refreshStatus, 1000)` when sidebar is open, clears on unmount. Stop polling when `document.visibilityState === "hidden"` to save battery.
- **Shortcut conflict audit**: check each global shortcut against browser defaults and Monaco editor. Specifically, `Ctrl+D` (diff current file) conflicts with the browser bookmark dialog — consider `Ctrl+Alt+Shift+D` instead.

---

## Summary Table

| Phase | Features | Rust Commands | New Components |
|-------|----------|---------------|----------------|
| 1 | Hunk/line staging | 3 new | Enhanced `GitDiffView` |
| 2 | Commit graph | 2 new | `GitGraphView` |
| 3 | Interactive rebase | 7 new | `RebaseEditor`, context-menu integration in `GitGraphView` |
| 4 | Tags, cherry-pick, revert, branch compare | 10 new | `TagManager`, `CherryPickDialog`, `RevertDialog`, `GitBranchCompare` |
| 5 | Stash (show/apply/partial), Worktree, Bisect | 11 new | `GitWorktreePanel`, `GitBisectWizard`, Stash improvements in `StashManager` |
| 6 | Polish & performance | 1 new parameter (`LogOptions.before_hash`) | Skeleton states, error boundaries |

**Total new Rust commands:** ~33 + 1 struct extension
**Total new files:** ~14 components + type extensions
