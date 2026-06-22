# Monaco Editor Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three key Monaco enhancements: Monaco-based DiffEditor in GitDiffView, inline merge conflict resolution in MergeConflictResolver using CodeLens and decorations, and keybinding interception + custom context menu inside MonacoEditor.

**Architecture:**
- **Backend:** Spawns `git show <revision>:<path>` via a new `git_show_file` Tauri command.
- **DiffEditor:** Leverages Monaco's `<DiffEditor>` React component.
- **Merge Conflict:** Embeds Monaco `<Editor>` inside `MergeConflictResolver.tsx`, parsing conflict boundaries and applying Monaco `CodeLens` actions and line decorations.
- **Keybindings/Menu:** Uses Monaco's `addCommand` and `addAction` to bind shortcuts and context menus directly.

**Tech Stack:** TypeScript, React, Monaco Editor, Rust (Tauri command)

---

### Task 1: Implement Backend `git_show_file` Command
**Files:**
- Modify: `src-tauri/src/commands/git.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/tauri/git.ts`
- Modify: `src/stores/gitStore.ts`

- [ ] **Step 1: Add command in git.rs**
  Add a `git_show_file` function in Rust:
  ```rust
  #[tauri::command]
  pub async fn git_show_file(root: String, path: String, revision: String) -> Result<String, String> {
      let rev_path = if revision.is_empty() {
          format!(":{}", path)
      } else {
          format!("{}:{}", revision, path)
      };
      run_git(&root, &["show", &rev_path])
  }
  ```
- [ ] **Step 2: Register in lib.rs**
  Add `commands::git::git_show_file` to the `invoke_handler!` macro list in `lib.rs`.
- [ ] **Step 3: Export in git.ts**
  Add frontend TypeScript wrapper function:
  ```typescript
  export async function gitShowFile(root: string, path: string, revision: string): Promise<string> {
    return invoke<string>("git_show_file", { root, path, revision });
  }
  ```
- [ ] **Step 4: Add to gitStore.ts**
  Add a `showFile` helper in `gitStore.ts` that gets the repo root and executes `gitShowFile`.

### Task 2: Implement Monaco DiffEditor in GitDiffView
**Files:**
- Modify: `src/components/git/GitDiffView.tsx`

- [ ] **Step 1: Replace UI with DiffEditor**
  Import `DiffEditor` from `@monaco-editor/react`. On load, query the base content (left side) and modified content (right side) using `gitStore`'s `showFile` and Tauri `readFile`.
  Render the `<DiffEditor />` component in the main area of the diff view.
- [ ] **Step 2: Bind Layout and Theme Options**
  Link the `renderSideBySide` setting to the existing layout toggle buttons (Inline / Side by Side). Set `theme` using `ThemeService.toMonacoThemeId(theme)`.

### Task 3: Implement Inline Merge Conflict Resolver
**Files:**
- Modify: `src/components/git/MergeConflictResolver.tsx`

- [ ] **Step 1: Embed Monaco Editor**
  Replace scroll list with Monaco `<Editor />` component displaying the conflicted file content.
- [ ] **Step 2: Implement Conflict Parsing, Decorations, and CodeLens**
  - Implement a conflict parser that finds ranges of conflict blocks (`<<<<<<< ours ======= theirs >>>>>>>`).
  - Add green/blue decorations to the ours/theirs lines.
  - Register a `CodeLensProvider` that shows floating links for `Accept Ours`, `Accept Theirs`, and `Accept Both`.
  - When clicked, execute operations to replace the block with the accepted text.

### Task 4: Implement Keybinding Interception and Custom Context Menu
**Files:**
- Modify: `src/components/editor/MonacoEditor.tsx`

- [ ] **Step 1: Add commands to MonacoEditor**
  In the `handleMount` callback, intercept keystrokes:
  - `Ctrl+P` -> open unified search files
  - `Ctrl+Shift+P` -> open unified search commands
  - `Ctrl+Shift+F` -> open sidebar search
  - `Ctrl+B` -> toggle sidebar
  - `Ctrl+,` -> open settings panel
  - `Ctrl+Alt+K` -> open shortcuts modal
  - `` Ctrl+` `` -> toggle terminal panel
- [ ] **Step 2: Add actions to context menu**
  Register "Format Document" and "Run Active File" context menu actions.

### Task 5: Verify and Update Documentation
**Files:**
- Modify: `Documentation/CodeEditor.md`
- Modify: `Documentation/SourceControl.md`

- [ ] **Step 1: Run tests and typecheck**
  Ensure everything compiles and Vitest tests pass cleanly.
- [ ] **Step 2: Update Docs**
  Document the newly implemented Monaco features in the respective documentation files.
