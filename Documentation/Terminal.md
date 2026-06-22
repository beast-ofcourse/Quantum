# Terminal Integration

Quantum IDE features a fully-integrated command-line terminal interface powered by **xterm.js** on the frontend and a native Rust PTY (Pseudo-Terminal) manager on the backend. This gives you a fast, theme-aware terminal environment without leaving the editor.

---

## 1. Under the Hood: PTY & Shell Detection

When you open a terminal in Quantum, the editor doesn't just run a subshell in a separate process; it spawns a native PTY on the operating system.

### Operating System Shell Detection
The Rust backend detects available shells and defaults to the most appropriate system shell:
* **Windows:** Detects Powershell, Git Bash, Command Prompt (cmd.exe), and WSL (Windows Subsystem for Linux), defaulting to PowerShell.
* **macOS:** Spawns `zsh` (default on macOS 10.15+) or falls back to `bash`.
* **Linux:** Detects `/etc/shells` to launch the user’s default shell (e.g., `bash`, `zsh`, `fish`).

### Tauri IPC Bridge
The frontend xterm.js instance writes keystrokes to a Tauri IPC command. The Rust backend takes this input, feeds it into the PTY process, and streams back the output (standard output and standard error) to the frontend via event listeners. This asynchronous bridge ensures zero input latency.

---

## 2. Multi-Session Management

Quantum supports up to **8 concurrent terminal sessions** in the Bottom Dock.

* **Open a Terminal:** Use the keyboard shortcut ``Ctrl+` `` or select **Terminal > New Terminal** (`Ctrl+Shift+` `).
* **Session Tabs:** Terminal sessions are displayed in a list in the bottom panel. You can rename tabs (e.g., "build server", "git logs", "test-runner") to organize your workflow.
* **Grid / Split Views:** You can split a terminal tab horizontally or vertically to view two shells in the same panel window.
* **Status Badges:** Tabs show connection states (e.g., active, exited).

---

## 3. Terminal Features & Integrations

### Clipboard Integration
* **Copy:** Highlight any text inside the terminal window to copy it to your OS clipboard automatically.
* **Paste:** Right-click inside the terminal pane or press `Ctrl+Shift+V` / `Cmd+V` to paste text from your clipboard.

### Dynamic Resize Handling
When you resize the Bottom Dock or maximize the panel, the terminal automatically recalculates its grid size. It sends a message to the Rust backend to resize the native PTY columns and rows, ensuring text is wrapped correctly without breaking output alignment.

### ANSI Theme Sync
Terminal colors are fully integrated with Quantum's active editor theme. If you switch from GitHub Dark to Catppuccin, the terminal’s 16 ANSI colors (black, red, green, yellow, blue, magenta, cyan, white, and their bright variants) update instantly to maintain visual cohesion.

---

## 4. Customizing Terminal Settings

You can customize the terminal behavior inside the Settings panel (`Ctrl+,`) or by editing `.quantum/settings.json`:

```json
{
  "terminal.integrated.fontSize": 14,
  "terminal.integrated.fontFamily": "Consolas, 'Courier New', monospace",
  "terminal.integrated.shell.windows": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  "terminal.integrated.scrollback": 5000,
  "terminal.integrated.cursorStyle": "block"
}
```

### Customization Options
* **Font Customization:** Set the terminal font size and family independently from the main editor font.
* **Default Shell:** Override the auto-detected shell by providing an absolute path to your preferred binary (e.g., pointing cmd.exe or git bash on Windows).
* **Scrollback Buffer:** Set the scrollback limit (defaults to `5000` lines) to control memory footprint.
* **Cursor Customizations:** Toggle cursor blink styles between `block`, `underline`, and `line`.
