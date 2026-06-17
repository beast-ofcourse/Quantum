# Phase 4 — Terminal System — Design

**Date:** 2026-06-05
**Parent plan:** `docs/superpowers/specs/plan.md` (Phases 0–6)
**Status:** Approved (open design questions resolved 2026-06-05)

## Goal

Add an integrated terminal emulator (xterm.js + real PTY) to the bottom panel
of the existing shell. Multiple concurrent shells, theme-sync, resize, copy/paste
context menu, persisted shell picker, and a keyboard shortcut to toggle the
panel.

## Scope

Implements plan tasks **4.1 – 4.8** end to end. Out of scope (deferred):

- **Split terminal** (plan 4.7) — explicitly future
- **Tab session restore** (active sessions) — Phase 6.5
- **Per-project shell config** — Phase 5
- **Working-directory follows explorer root** — future; Phase 4 starts in `$HOME`
  on Windows, `$HOME` on macOS/Linux

## Resolved design questions

| Question | Decision |
|---|---|
| Backend: PTY vs `plugin-shell` stdio | **Real PTY via `portable-pty`** crate (ConPTY on Windows, openpty on Unix) |
| Worker: `TerminalIOWorker` (plan 4.2) | **Implement as planned** — buffers output batches and throttles stdin on the worker side |
| Initial working directory | `$HOME` resolved via existing `resolve_home` Rust command |
| Default shell when none chosen | Windows: `cmd.exe` if found, else `powershell.exe`. Unix: `$SHELL` env, fallback `/bin/sh` |
| Tab persistence | **No** — sessions die with the app (PTY processes are local; restoring them would be complex and unsafe). The shell *picker* (last-used shell) is persisted. |
| Event-name strategy | Per-session: `terminal:stdout:<id>`, `terminal:exit:<id>`. Easier filtering than a single event with a `sessionId` payload. |

## Architecture

```
Rust (src-tauri)
├── Cargo.toml                              (modify) + portable-pty = "0.9"
├── src/
│   ├── lib.rs                              (modify) register pty commands + PtySessionState
│   └── commands/
│       ├── mod.rs                          (modify) pub mod pty; pub mod shell;
│       ├── pty.rs                          (new)   spawn_pty, write_pty, resize_pty,
│       │                                          kill_pty; manages PTY master/tokio tasks
│       └── shell.rs                        (new)   detect_shells; per-platform probing
└── capabilities/default.json               (modify) add event permissions

TypeScript (src)
├── types/
│   └── terminal.ts                         (new)   Shell, TerminalSession, I/O event types
├── lib/
│   └── terminal-worker.ts                  (new)   message types (worker protocol)
│   └── terminal-worker.test.mjs            (new)   node --test smoke test
├── workers/
│   └── terminal.worker.ts                  (new)   DedicatedWorkerGlobalScope: batch stdout,
│                                                   throttle stdin, forward resize
├── tauri/
│   ├── pty.ts                              (new)   spawn/write/resize/kill invoke wrappers
│   ├── shell.ts                            (new)   detectShells wrapper
│   └── index.ts                            (modify) export *
├── stores/
│   └── terminalStore.ts                    (new)   sessions, activeSessionId, createSession,
│                                                   closeSession, setActive, writeStdin,
│                                                   resize
├── hooks/
│   ├── useTerminalHotkeys.ts               (new)   Ctrl+` to toggle, Ctrl+Shift+` for new
│   └── useTerminalTheme.ts                 (new)   syncs xterm theme with uiStore.theme
├── components/
│   ├── terminal/
│   │   ├── Terminal.tsx                    (new)   Wraps xterm.js Terminal, FitAddon, WebLinksAddon
│   │   ├── TerminalTabs.tsx                (new)   Tab strip above xterm
│   │   ├── TerminalTab.tsx                 (new)   Single tab + context menu (close, close others)
│   │   ├── ShellPicker.tsx                 (new)   Dropdown to choose default shell on + click
│   │   ├── TerminalContextMenu.tsx         (new)   Right-click menu: copy, paste, clear, select all
│   │   └── TerminalEmptyState.tsx          (new)   "No terminal" hero
│   └── layout/
│       ├── BottomPanel.tsx                 (modify) Render <TerminalTabs /> + <Terminal />
│       │                                          (or empty state) instead of placeholder text
│       └── StatusBar.tsx                   (modify) Add a "Shell: <name>" indicator
├── main.tsx                                (modify) import "@xterm/xterm/css/xterm.css"
└── index.css                               (modify) monospace font CSS var for xterm
```

## Data model

```ts
// src/types/terminal.ts
export interface Shell {
  id: string;          // stable id, e.g. "cmd", "powershell", "pwsh", "wsl", "zsh"
  label: string;       // human label
  path: string;        // absolute path to executable
  args: string[];      // default args (empty for most)
  isDefault?: boolean; // currently active default
}

export interface TerminalSession {
  id: string;          // uuid generated client-side
  shellId: string;     // references Shell.id
  shellLabel: string;  // for display in tab
  pid: number;         // returned by Rust; -1 if spawn failed
  cwd: string;         // initial cwd
  createdAt: number;   // for default tab naming "shell-1, shell-2"
  title?: string;      // user-customizable; falls back to auto name
}

export interface TerminalStoreState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  defaultShellId: string | null;
  // actions
  createSession: (shellId?: string) => Promise<string | null>;
  closeSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  setDefaultShell: (shellId: string) => void;
  getActiveSession: () => TerminalSession | null;
}
```

## PTY protocol (Rust ↔ TS)

### Tauri commands

```rust
// src-tauri/src/commands/pty.rs

#[tauri::command]
pub async fn spawn_pty(
    app: AppHandle,
    state: State<'_, PtySessionState>,
    shell_path: String,
    shell_args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    session_id: String,  // client-generated uuid
) -> Result<i32, String>;  // returns pid

#[tauri::command]
pub async fn write_pty(
    state: State<'_, PtySessionState>,
    session_id: String,
    data: String,
) -> Result<(), String>;

#[tauri::command]
pub async fn resize_pty(
    state: State<'_, PtySessionState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String>;

#[tauri::command]
pub async fn kill_pty(
    state: State<'_, PtySessionState>,
    session_id: String,
) -> Result<(), String>;
```

### Tauri events

```
terminal:stdout:<session_id>     payload: string  (utf-8 chunk)
terminal:exit:<session_id>       payload: { code: number | null, signal: number | null }
```

### PtySessionState (Rust)

```rust
pub struct PtySessionState {
    pub sessions: Mutex<HashMap<String, PtyHandle>>,
}

struct PtyHandle {
    pid: i32,
    writer: Box<dyn Write + Send>,  // PTY master for stdin
    killer: Box<dyn ChildKiller + Send + Sync>,
    reader_handle: JoinHandle<()>,  // task that reads PTY and emits stdout events
}
```

The reader task runs on `tauri::async_runtime`. When EOF is hit, it emits
`terminal:exit:<id>` and removes the session from the map.

## Worker protocol (TS)

The `TerminalIOWorker` is a `DedicatedWorkerGlobalScope`. It is owned by the
`Terminal` component for one session. The component posts messages to it; the
worker posts messages back. The worker is the only place xterm's I/O is
serialized.

```ts
// src/lib/terminal-worker.ts
export type ToWorker =
  | { type: "init"; sessionId: string }
  | { type: "input"; data: string }      // xterm.onData → PTY stdin
  | { type: "resize"; cols: number; rows: number }
  | { type: "shutdown" };

export type FromWorker =
  | { type: "ready"; sessionId: string }
  | { type: "output"; data: string }     // batched PTY stdout → xterm.write
  | { type: "exit"; code: number | null; signal: number | null }
  | { type: "error"; message: string };
```

Buffering strategy:
- `output` messages are coalesced within a 16 ms animation frame and flushed in
  one `xterm.write()` call. This avoids per-keystroke main-thread repaints.
- `input` from xterm is forwarded as-is (PTY expects individual keystrokes).
- Resize is forwarded immediately.

## Component hierarchy

```
BottomPanel
└── <div role="tabpanel" aria-label="Terminal">
    ├── TerminalTabs (header)
    │   ├── TerminalTab ×N (each with TerminalContextMenu)
    │   ├── ShellPicker (DropdownMenu, "+ New terminal" button)
    │   └── <X> (close panel, already in BottomPanel)
    └── Active session: <Terminal /> OR <TerminalEmptyState />
        ├── <div ref={containerRef} /> ← xterm.js mounts here
        ├── FitAddon resizes on container resize (ResizeObserver)
        └── WebLinksAddon wraps terminal.linkifier
```

The active session is mounted via `key={sessionId}` so xterm's internal state
resets on session switch. Inactive sessions' containers are unmounted but the
PTY keeps running in the background — output is buffered in the worker and
flushed when the tab becomes active again. (Worker persists because
`Terminal.tsx` only mounts the active one; on tab switch, the new active
session is re-mounted and creates a new worker, which reads its backlog via
PTY history on demand — implementation detail, see Worker "reconnect" below.)

**Decision simplification:** Inactive sessions **do not** buffer; on tab switch,
we re-mount the worker and rely on xterm's normal display. The PTY keeps
running, but output during inactive periods is dropped. This matches VS Code's
"inactive terminals don't accumulate scrollback" behavior. Logged as a known
limitation in `terminalStore`.

## Shell detection (4.8)

### Windows

```rust
fn detect_windows_shells() -> Vec<Shell> {
    // Walk PATH for these names in order:
    //   pwsh.exe   (PowerShell 7+)
    //   powershell.exe
    //   cmd.exe
    //   wsl.exe    (only if %WSLENV% or wsl --status works)
    // Returns first found for each.
}
```

### Unix (macOS, Linux)

```rust
fn detect_unix_shells() -> Vec<Shell> {
    // Read /etc/shells (skip comments and blanks)
    // Filter by checking the file exists
    // Sort: $SHELL first if set, then the rest alphabetically
}
```

Detection runs once at app startup. Result is cached in JS memory; the
`terminalStore` reads it via the `detect_shells` invoke.

## Theme sync

`useTerminalTheme()` watches `uiStore.theme` and on change calls
`terminal.options.theme = <matching theme object>` for every mounted xterm
instance. Theme objects mirror Monaco's dark/light palettes from
`monaco-setup.ts` (background `#0d1117`, foreground `#e6edf3`, cursor
`#58a6ff`, selection `#264f78`). Stored in a shared `terminalTheme.ts` lib so
both Monaco and xterm use identical color values.

## Capabilities

`src-tauri/capabilities/default.json` already has `core:event:default`. We do
not need new event permissions because Tauri events emitted by the app itself
are unrestricted. The `shell:default` permission stays but we don't use
`plugin-shell` for terminals.

## Verification plan

This project has no test framework installed. We add one tiny unit test
(`terminal-worker.test.mjs`) for the worker's message shape and a Rust test
file (`pty.rs` inline `#[cfg(test)] mod tests`) for the shell-detection
pure-function paths. All other verification: `npm run typecheck`, `npm run
build`, `cargo check`, and a manual smoke checklist in the plan.

## Known limitations (logged, not blocking)

1. **Inactive session scrollback** — output during inactive periods is dropped
   (PTY still runs; output not buffered). Matches VS Code default.
2. **No tab persistence** — closing the app kills all PTY children.
3. **No split terminal** — plan 4.7 marks as future.
4. **Working directory** — starts in `$HOME`; doesn't follow explorer root.
5. **No shell customization per session** — all sessions use the default shell
   unless the user picks a different one at creation time.
6. **macOS Gatekeeper** — first PTY spawn on macOS may need Accessibility
   permissions for the app; out of scope for Phase 4 (user can grant manually).
