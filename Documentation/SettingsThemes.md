# Settings & Themes Customization

Quantum IDE is designed to be highly customizable. This guide explains how to use the Theme Editor, customize editor options, configure global preferences, and rebind keybindings to match your workflow.

---

## 1. The Theme System & Visual Theme Editor

Quantum supports active theme switching and visual theme designing. A theme in Quantum controls not only the Monaco editor style but also the global React window frame, Activity Bar, sidebar panels, and integrated terminal colors.

### Built-in Themes
Quantum ships with four pre-configured themes out of the box:
* **Dark (GitHub Dark inspired):** Low contrast, deep slate-blue workspace.
* **Light:** Clean, high-contrast light workspace.
* **Catppuccin Mocha:** Extremely popular, soft pastel palette.
* **Spiderman:** Bold, comic-book red and blue accents.

### The Visual Theme Editor
To open the theme editor, click **Theme Editor** inside the Activity Bar or select **Preferences: Configure Theme** from the Command Palette.
* **Live Preview:** As you modify color inputs in the editor, the changes are updated instantly on screen, allowing you to test readability.
* **Color Groups:** Colors are grouped logically to make styling simple:
  * **Workspace Colors:** Backgrounds for title bars, activity bars, editor tabs, and sidebars.
  * **Editor Syntax Colors:** Text colors for comments, strings, variables, keywords, and functions inside Monaco.
  * **Terminal ANSI Colors:** Palette settings for terminal execution lines.
* **Saving & Custom Themes:** Custom themes are saved to your home directory under `~/.quantum/themes/<theme-name>.json`. These custom themes are automatically detected and added to the themes picker.
* **Custom CSS Overrides:** For complete custom styles, you can write raw CSS inside `~/.quantum/custom.css`. Quantum monitors this file and applies styles dynamically over the main React app.

---

## 2. Settings Manager & Configurations

System options are controlled via the Settings Panel (`Ctrl+,`). 

### Schema Configuration
Settings are saved in `~/.quantum/settings.json`. The settings engine syncs changes in real-time, meaning editing settings visually updates the file, and modifying the file directly updates the editor interface.

Here is an example `settings.json` file showing key configurations:
```json
{
  "editor.fontSize": 14,
  "editor.fontFamily": "Fira Code, Consolas, monospace",
  "editor.tabSize": 2,
  "editor.wordWrap": "on",
  "editor.minimap.enabled": true,
  "editor.breadcrumbs.enabled": true,
  "editor.lineNumbers": "relative",
  "editor.autoSave": "afterDelay",
  "editor.autoSaveDelay": 1000,
  "editor.formatOnSave": true,
  "workbench.colorTheme": "Catppuccin Mocha",
  "workbench.sideBar.location": "left",
  "workbench.statusBar.visible": true,
  "terminal.integrated.fontSize": 14
}
```

---

## 3. Keyboard Shortcuts & Keybindings

Quantum provides a unified keybinding registry (`keybindingStore`) that intercepts shortcuts before browser events fire, allowing you to customize hotkeys.

### Shortcut Cheat Sheet
To view a list of default hotkeys, press `Ctrl+Alt+K` or select **Help: Keyboard Shortcuts**. The modal groups hotkeys by their operational context (File Management, Navigation, Terminal, Git, Debugger).

### Custom Keybindings
You can override any keyboard shortcut by writing configuration objects inside `~/.quantum/keybindings.json`.

**Example `keybindings.json`:**
```json
[
  {
    "command": "workbench.action.toggleSidebarPosition",
    "key": "Ctrl+Shift+X"
  },
  {
    "command": "workbench.action.terminal.new",
    "key": "Ctrl+Shift+T"
  },
  {
    "command": "editor.action.triggerSuggest",
    "key": "Ctrl+Space"
  }
]
```

### Keybinding Fields
* **command:** The internal registry identifier of the command (e.g. `workbench.action.closeActiveEditor`).
* **key:** The key sequence to bind (supports modifiers like `Ctrl`, `Shift`, `Alt`, `Cmd`, and combinations like `Ctrl+K Ctrl+C`).
