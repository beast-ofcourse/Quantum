# User Interface & Workbench Layout

Quantum IDE features a clean, responsive, and highly customizable user interface inspired by modern professional development environments. The layout is optimized to allow developers to resize, arrange, and even detach panels to suit their multi-monitor workspaces.

---

## 1. Workbench Areas

The user interface of Quantum is composed of five primary zones:

```
+--------------------------------------------------------------+
|                         Title Bar                            |
+---+----------------------+-------------------------------+---+
| A |                      |                               | D |
| c |      Left Dock       |          Editor Area          | e |
| t |   (Explorer, Git,    |    (Monaco, Tabs, Splits)     | t |
| i |    Search, Debug)    |                               | a |
| v |                      |                               | c |
| i |                      +-------------------------------+ h |
| t |                      |          Bottom Dock          | e |
| y |                      |  (Terminal, Output, Problems) | d |
+---+----------------------+-------------------------------+---+
|                         Status Bar                           |
+--------------------------------------------------------------+
```

### 1. Title Bar & Menu Bar
* **Title Bar:** Contains the application title, window control buttons, and the **Unified Search Bar**.
* **Menu Bar:** A classic dropdown menu system (File, Edit, Selection, View, Go, Run, Terminal, Help). Press `Alt` to toggle the menu bar visibility.

### 2. Activity Bar
A slim vertical bar on the edge of the screen containing shortcuts for each primary tool panel:
* **Explorer** (`Ctrl+Shift+E`)
* **Search & Replace** (`Ctrl+Shift+F`)
* **Source Control (Git)** (`Ctrl+Shift+G`)
* **Run and Debug** (`Ctrl+Shift+D`)
* **Extensions Marketplace**
* **AI Agent Launcher** — launch AI coding agents (OpenCode, Claude Code, Pi, Antigravity, etc.) in a new terminal
* **Settings & Themes** (`Ctrl+,`)

### 3. Layout Docks (Left, Right, Bottom Docks)
Quantum features three resizable zones that house tool panels:
* **Left Dock / Right Dock:** Typically houses the File Explorer, Git Sidebar, and Outline View.
* **Bottom Dock:** Holds the Terminal sessions, Output logs, Problems log (Monaco diagnostics), and Debug Console.
* **Resizing:** Docks can be resized by dragging their borders. Double-click borders to snap to default sizes.

### 4. Editor Area
The central editing canvas containing the **Monaco Editor**. It supports multi-tab navigation, tab reordering, and horizontal/vertical split screens.

### 5. Status Bar
Located at the bottom of the window, providing context-sensitive information:
* Git Branch display & sync indicators
* Monaco cursor location (Line, Column)
* Active file encoding and language mode
* Warning/Error counts from Monaco diagnostics
* Status updates from long-running background tasks

---

## 2. Layout Customization

Quantum allows you to reposition and customize UI panels:

### Sidebar Position Toggle
By default, the primary sidebar resides on the left. You can toggle the sidebar position between **Left** and **Right** through the settings or by choosing **View > Appearance > Toggle Sidebar Position**. Moving the sidebar helps prevent layout shift when toggling file trees.

### Panel Alignment
The Bottom Dock panel tabs can be aligned to fit your preference:
* **Left / Center / Right / Justify:** Set tab alignment in the dock header.
* **Terminal Maximize / Restore:** Click the chevron button in the bottom dock toolbar (similar to VS Code) to expand the bottom panel to full screen, or restore it to its original split height.

---

## 3. Layout Presets

To quickly switch between workspace layouts, Quantum supports **Layout Presets** (available via **View > Layout Presets** or `Ctrl+Shift+L`):

### Built-in Presets
* **Default:** Standard IDE view (Explorer on Left, Editor in center, Terminal at the bottom).
* **Minimal:** Collapses the left, right, and bottom docks, maximizing the editor view for clean coding.
* **Git Review:** Maximizes the Source Control panel, hides unnecessary panels, and opens the Git Graph / diff view.

### Custom Presets
You can arrange panels to your liking, click **Save Current Layout Preset**, give it a name, and recall it at any time. Custom presets are persisted inside the local `~/.quantum/settings.json` file.

---

## 4. Detachable Panels

For developers using multi-monitor setups, Quantum supports **Detachable Panels**:
* **How to Detach:** Click the "Pop Out" icon in the header of any tool panel (e.g., Git Graph, Terminal, or Outline View).
* **Behavior:** The panel is popped out of the main browser-based WebView into its own native Tauri window shell.
* **Syncing:** The detached panel stays synced with the core Zustand stores. Selecting a file in a detached file explorer or stepping through code in a detached debugger instantly updates the main editor view.
* **Re-attaching:** Close the detached window to snap the panel back into its original dock zone in the main window.
