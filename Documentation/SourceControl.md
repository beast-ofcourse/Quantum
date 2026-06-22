# Source Control & Git Integration

Quantum IDE offers an advanced, multi-tier Git integration that allows you to handle everything from basic staging and commits to complex rebases, worktree isolations, and branch bisects directly from the workspace.

---

## 1. Git Status & Gutter Decorations

Quantum continuously monitors your workspace repository directory using the `gitStore` and a background `GitWorker` thread.

### File Tree Decorations
Modified, untracked, staged, or conflicted files are annotated in the File Explorer sidebar with color-coded markers and badges:
* **Green (A):** Untracked files that have been added.
* **Yellow (M):** Modified files.
* **Red (C):** Files with merge conflicts.
* **Staged Badges (S):** Staged changes ready for commit.

### Gutter Markers
The Monaco Editor displays subtle colored markers in the gutter next to line numbers:
* **Green Block:** Added lines.
* **Blue Block:** Modified lines.
* **Red Triangle:** Deleted lines.
* **Interaction:** Clicking a gutter marker opens a floating mini-diff bubble, allowing you to preview the unstaged changes or revert those lines instantly.

---

## 2. Core Git Actions

The **Source Control Panel** (`Ctrl+Shift+G`) contains tools to manage your changes:

### Staging & Committing
* **Flexible Staging:** Stage entire files, selected text chunks, or individual lines by right-clicking in the diff editor.
* **Commit Bar:** Input your message and commit (`Ctrl+Enter`). 
* **Amend Commit:** Click the dropdown menu next to the Commit button to amend your last commit.
* **Push, Pull, & Fetch:** Icons at the top of the Source Control panel allow you to fetch updates, pull changes, or push commits to remotes.

### Remotes & Branch Management
* **Branch Selector:** The active branch is displayed in the Status Bar. Click it to open the branch switcher.
* **Branch Operations:** Create new branches, delete local/remote branches, checkout branches, and merge branches.
* **Remotes Config:** View, add, or remove Git remotes.

---

## 3. Advanced Git Tooling

For power users, Quantum exposes specialized Git workflows in the editor view:

### Git Graph & Log
* **Git Graph:** Select **Source Control: View Git Graph** to open an interactive visualization of your repository history. It renders commit nodes, merge paths, branch labels, and tags. Clicking a commit shows its details, commit message, author info, and modified files with full diffs.
* **Git Log:** View a searchable history of commits, filterable by author, branch, file, or search string.

### Stash Management
* **Push Stash:** Save your unstaged/staged work without committing. Supports partial stashes and including untracked files.
* **Pop, Apply, Drop:** Stashed changes are listed at the bottom of the Source Control sidebar. Click to pop, apply, or delete a stash. You can click a stash to view its file diffs before applying it.

### Interactive Rebase Tool
* **Rebase UI:** Instead of dealing with Git rebase files in text format, Quantum loads an interactive rebase visualizer.
* **Actions:** Reorder commits using drag-and-drop, toggle actions between `pick`, `reword`, `edit`, `squash`, `fixup`, and `drop`. You can edit, continue, skip, or abort the rebase through intuitive buttons.

### Git Worktrees
* **Manage Worktrees:** View all active git worktrees. Add, prune, or check out worktrees directly.
* **Benefits:** Easily work on multiple branches in parallel folders without having to stash and switch in your main directory.

### Git Bisect
* **Troubleshoot Bugs:** Start a bisect wizard to locate the commit that introduced a regression. Mark commits as `good`, `bad`, or `skip`, and view the remaining search log.

### Git Blame
* **File History:** Open a file and run **Git: Blame File** (`Ctrl+Shift+B`). Quantum spins up a Web Worker to query Git logs, showing inline annotations next to lines indicating who made the change, when, and in which commit.

---

## 4. GitHub Integration

Quantum includes first-party integration with GitHub to connect your local repository with cloud workflows:

* **OAuth Device Flow:** Click **Sign in to GitHub** in the activities menu. Quantum displays a device code and opens a browser page. Paste the code to securely authenticate. Your access token is stored securely in the app configuration.
* **Pull Requests:** View open PRs for your repository, check their continuous integration (CI) status badges, and checkout PR branches directly.
* **Workspace Detection:** When you open a project, Quantum reads the Git remote URLs. If it detects a GitHub URL (e.g. `github.com/org/repo`), it automatically links the workspace with GitHub and queries its API.

---

## 5. Monaco DiffEditor Integration

When comparing changes for unstaged or staged files, Quantum replaces generic line comparisons with Monaco's native **`<DiffEditor>`**:

* **Diff Modes:** Users can toggle between **Inline** and **Side-by-Side** views.
* **Content Resolution:**
  * **Unstaged changes:** Compares the version in the git index (`git show :path`) with the active file on disk.
  * **Staged changes:** Compares the version in the `HEAD` commit (`git show HEAD:path`) with the index version.
* **Capabilities:** Provides syntax highlighting, scroll syncing, line-collapsing, and Monaco's full search tools within diff sheets.

---

## 6. Interactive Merge Conflict Resolver

When a git merge or rebase results in conflicts, opening the conflicted file loads it into Quantum's **Monaco-based Conflict Resolver**:

* **Visual Range Highlights (Decorations):** 
  * Green background overlays are applied to the local changes block ("Ours").
  * Blue background overlays are applied to the incoming changes block ("Theirs").
* **Interactive Resolution Actions (CodeLens):**
  * Above each conflict header, floating links appear: **Accept Ours**, **Accept Theirs**, and **Accept Both**.
  * Clicking any action executes a safe edit operation directly on the editor model, immediately resolving the conflict.
* **Validation & Staging:** The editor monitors conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in real-time. Once all markers are resolved, the **Mark Resolved** action button becomes active, allowing the developer to stage the file instantly.

