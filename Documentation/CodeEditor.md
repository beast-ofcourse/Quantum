# Code Editor & Monaco Integration

At the heart of Quantum IDE is the **Monaco Editor** integration, the engine that powers VS Code. Quantum wraps Monaco inside a robust React wrapper, linking editor lifecycle events with Zustand state management and background web workers.

---

## 1. Monaco Editor Features

Quantum exposes the full suite of Monaco’s advanced text editing capabilities, providing a rich desktop coding experience:

* **Syntax Highlighting:** Native support for over 40 programming languages (including TypeScript, JavaScript, Rust, Python, Go, C++, HTML, CSS, JSON, and YAML).
* **IntelliSense & Autocomplete:** Smart completions, method signature suggestions, parameter hints, and quick-info hover cards.
* **Navigation Utilities:**
  * **Go to Definition (`F12`):** Instantly jump to where a variable, function, or class is defined.
  * **Find References (`Shift+F12`):** Peek or navigate to all instances of a symbol in your project.
  * **Peek Definition (`Alt+F12`):** Inspect a method's implementation inline without leaving your current cursor position.
* **Editing Productivity:**
  * **Multi-Cursor (`Alt+Click`):** Place multiple cursors to edit code in multiple places simultaneously.
  * **Column Selection (`Shift+Alt+Drag`):** Select blocks of text vertically.
  * **Auto-Save:** Configurable auto-save delays with support for automatic code formatting on save.
* **Visual Guides:**
  * **Minimap:** A miniature representation of the file on the right side for fast scrolling.
  * **Breadcrumbs:** A file path and symbol hierarchy path displayed at the top of the editor.
  * **Inlay Hints:** Inline parameter names and return type annotations.
  * **Relative Line Numbers:** Ideal for users who navigate code using Vim-like keyboard setups.

---

## 2. Editor Tabs & Split Views

Quantum manages your files using a highly flexible tabs-based workspace managed by `editorStore`:

### Tab Management
* **Drag-and-Drop Reordering:** Reorder open tabs by dragging them horizontally.
* **Dirty State Tracking:** Tabs display a dot indicator when a file has unsaved changes.
* **Session Restore:** When you close and reopen Quantum, your active tabs, cursor positions, scroll locations, and layouts are restored exactly as you left them.

### Split Editor View
To view multiple files side-by-side:
* **How to Split:** Click the split editor icon in the top-right corner of the editor area or use the shortcut `Ctrl+\`.
* **Behavior:** Splitting divides the main editor canvas into two vertical columns. You can drag tabs between the split views to arrange your workspace.
* **Focus Toggle:** Quickly focus between split views using `Ctrl+1`, `Ctrl+2`, etc.

---

## 3. File Outline Panel

The **Outline View** (typically displayed in the Left or Right Dock) extracts code structure and shows document symbols:

* **Symbol Extraction:** Parses the active file's AST (Abstract Syntax Tree) to extract functions, classes, interfaces, methods, variables, and exports.
* **Tree View Navigation:** Displays symbols in a hierarchical tree. Clicking any item in the tree automatically scrolls the editor and places the cursor on that symbol's definition line.
* **Cursor Tracking:** As you scroll through a file, the Outline View highlights the symbol containing your cursor, giving you immediate context on where you are in a massive class or module.

---

## 4. Live Markdown Preview

For documentation and Markdown files (`.md`), Quantum includes a built-in live preview tab:

* **How to Open:** Open a Markdown file and click the **Open Markdown Preview** icon in the editor toolbar (split icon with a document preview).
* **Syncing Layout:** Opens a split pane side-by-side with the editor, showing a rendered HTML preview.
* **Features:**
  * **Live Reloading:** Updates in real-time as you type in the code editor.
  * **Rendered Elements:** Full support for GitHub Flavored Markdown (GFM) including checkboxes, tables, syntax-highlighted code blocks, and lists.
  * **Table of Contents (ToC):** Generates a clickable sidebar outlining headings for fast document navigation.
