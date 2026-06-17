# Phase 4 — Terminal System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an integrated xterm.js-based terminal to the bottom panel, backed by a real PTY (`portable-pty`) on the Rust side, with multi-session tabs, theme sync, copy/paste, and shell detection.

**Architecture:** Rust owns PTY lifecycle (spawn, write, resize, kill, exit). TS uses a `TerminalIOWorker` per active session to batch stdout and forward stdin/resize. `terminalStore` is the single source of truth for sessions. One xterm.js instance is mounted at a time (the active session), keyed by session id.

**Tech Stack:** xterm 5.5, `@xterm/addon-fit` 0.11, `@xterm/addon-web-links` 0.12, `portable-pty` 0.9 (Rust), React 19, Zustand 5, Tailwind 4, Radix context-menu / dropdown-menu.

**Spec:** `docs/superpowers/specs/2026-06-05-phase4-terminal-system-design.md`

**Conventions from existing code (Phase 3 follow):**
- Components: PascalCase, one per file
- Stores: camelCase + `Store` suffix
- Hooks: `use*` prefix
- Files use `@/` alias (Vite)
- Zustand stores: `create<T>()(persist(...))` if persisted, else `create<T>()`
- No comments in code unless requested
- Use `cn()` from `@/lib/utils` for className merging
- Worker pattern matches `fileTree.worker.ts` (DedicatedWorkerGlobalScope)
- IPC layer follows `tauri/fs.ts` (typed `invoke<T>` wrapper) and `tauri/dialog.ts`
- Tauri commands registered in `src-tauri/src/lib.rs` via `tauri::generate_handler!`

**Verification approach:** No test framework installed. One Rust `#[cfg(test)] mod
tests` for pure shell-detection logic. All other verification:
`npm run typecheck`, `npm run build`, `cargo check`, and a manual smoke
checklist (Task 8) executed in the running app.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types/terminal.ts` | `Shell`, `TerminalSession`, Tauri event payload types |
| `src/lib/terminal-theme.ts` | Dark/light xterm theme objects (mirror Monaco) |
| `src/lib/terminal-worker.ts` | `ToWorker` / `FromWorker` message types |
| `src/workers/terminal.worker.ts` | DedicatedWorkerGlobalScope: batch stdout, forward stdin/resize |
| `src/tauri/pty.ts` | Typed `invoke` wrappers: `spawnPty`, `writePty`, `resizePty`, `killPty`, `onPtyStdout`, `onPtyExit` |
| `src/tauri/shell.ts` | `detectShells` invoke wrapper |
| `src/stores/terminalStore.ts` | Sessions, activeSessionId, defaultShellId, createSession, closeSession, writeStdin, resize |
| `src/hooks/useTerminalHotkeys.ts` | Ctrl+` to toggle, Ctrl+Shift+` to create new session |
| `src/hooks/useTerminalTheme.ts` | Syncs xterm theme with `uiStore.theme` |
| `src/components/terminal/Terminal.tsx` | xterm.js mount + FitAddon + WebLinksAddon + worker wiring |
| `src/components/terminal/TerminalTabs.tsx` | Tab strip above xterm |
| `src/components/terminal/TerminalTab.tsx` | Single tab UI + close / context menu |
| `src/components/terminal/ShellPicker.tsx` | DropdownMenu for "+ New terminal" shell choice |
| `src/components/terminal/TerminalContextMenu.tsx` | Copy, Paste, Clear, Select All (right-click on xterm) |
| `src/components/terminal/TerminalEmptyState.tsx` | "No terminal" hero |
| `src/components/layout/BottomPanel.tsx` | **Modify:** render tabs + active terminal / empty state |
| `src/components/layout/StatusBar.tsx` | **Modify:** add shell indicator |
| `src/main.tsx` | **Modify:** import xterm CSS |
| `src/index.css` | **Modify:** xterm font + line-height |
| `src-tauri/Cargo.toml` | **Modify:** add `portable-pty` |
| `src-tauri/src/lib.rs` | **Modify:** register pty + shell commands, manage state |
| `src-tauri/src/commands/mod.rs` | **Modify:** add `pty`, `shell` modules |
| `src-tauri/src/commands/pty.rs` | **New:** `spawn_pty`, `write_pty`, `resize_pty`, `kill_pty`; `PtySessionState` |
| `src-tauri/src/commands/shell.rs` | **New:** `detect_shells`; per-platform probing |

---

## Task 1: Rust PTY foundation

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands/pty.rs`
- Create: `src-tauri/src/commands/shell.rs`

- [ ] **Step 1.1: Add `portable-pty` to Cargo.toml**

Append under `[dependencies]`:
```toml
portable-pty = "0.9"
```

- [ ] **Step 1.2: Create `src-tauri/src/commands/pty.rs`**

Module structure:
- `PtyHandle` (private): holds the master writer (`Box<dyn Write + Send>`),
  killer, and the `JoinHandle` for the reader task.
- `PtySessionState` (public): `pub struct { sessions: Mutex<HashMap<String, PtyHandle>> }`
  with `new()` constructor.
- `to_async_writer`: helper that turns the PTY master into a non-blocking writer
  that can be sent to from the Tauri command runtime. Use
  `tokio::sync::mpsc` channel of `Vec<u8>` to a `tokio::task::spawn_blocking`
  loop that calls `master.try_clone_writer().write_all(buf).await`.
  (Skip the channel: `portable-pty` returns a sync writer. Wrap it in a
  `Mutex<Vec<u8>>` and use `tauri::async_runtime::spawn_blocking` to write.
  Simpler. Each `write_pty` invocation is `spawn_blocking`.)
- `spawn_pty`: takes `(app, state, shell_path, shell_args, cwd, cols, rows, session_id)`.
  1. Build a `CommandBuilder` from `portable-pty` with the args + cwd.
  2. Call `pty_system.openpty(builder)` → `(master, slave)`.
  3. Spawn the child on the slave via `pty_system.spawn(cmd)` (or
     `slave.spawn_command(cmd)` — depends on portable-pty API; use the
     `native_pty_system().spawn(cmd)` form which gives a `Child` with a
     `master`).
  4. Stash `child.process_id()` (returns `Option<u32>` — convert to i32) and
     a clonable writer in the state.
  5. Spawn a reader task: `let mut reader = child.clone().try_clone_reader()` →
     loop reading bytes, emitting `app.emit(format!("terminal:stdout:{}", session_id), String::from_utf8_lossy(&buf).into_owned())` to the webview. On EOF or error, emit `terminal:exit:<id>` and remove from map.
  6. Return the pid as `i32`.

- [ ] **Step 1.3: `write_pty`, `resize_pty`, `kill_pty`**

`write_pty`:
- Look up `PtyHandle` in `state.sessions`.
- Clone the writer (it must be `Send`).
- `tauri::async_runtime::spawn_blocking(move || writer.write_all(data.as_bytes()))`.
- On error, emit exit event and remove from map.

`resize_pty`:
- Look up handle, get master via `master_clone` (need to store the master in
  `PtyHandle` too). Call `master.resize(pty_size)` with `PtySize { rows, cols, .. }`.
- portable-pty 0.9 API: `master.resize(PtySize)`.

`kill_pty`:
- Look up handle. Call `child.kill()`. Remove from map. Emit exit.

- [ ] **Step 1.4: Create `src-tauri/src/commands/shell.rs`**

`detect_shells` command returns `Vec<Shell>`.

For Windows: probe in order `pwsh.exe`, `powershell.exe`, `cmd.exe`, `wsl.exe`
by walking `PATH` env var. `which`-like helper using `which` crate OR manual
PATH walk. To avoid adding `which` dep, use a manual walker:
- Get `PATH` from `std::env::var("PATH")`.
- Split on `;` (Windows) or `:` (Unix).
- For each dir, check if `<dir>/<name>.exe` exists via `std::path::Path::exists()`.
- On Unix, for `wsl`, run `Command::new("wsl").arg("--status").output()` and
  check exit 0.

For Unix: read `/etc/shells`, skip blanks + comments, filter to existing
files. Sort: `$SHELL` first if set, then alphabetical.

Add a small `#[cfg(test)] mod tests` block:
- Test that PATH parsing on Unix splits on `:`.
- Test that comments and blanks in `/etc/shells` are filtered (use a tempfile
  or just test the filter function in isolation).

- [ ] **Step 1.5: Wire `src-tauri/src/commands/mod.rs`**

```rust
pub mod fs;
pub mod pty;
pub mod shell;
pub mod watch;
```

- [ ] **Step 1.6: Wire `src-tauri/src/lib.rs`**

- Add `tauri_plugin_shell::init()` is already there. Leave it.
- Add `.manage(commands::pty::PtySessionState::new())`.
- Register commands: `commands::pty::spawn_pty`, `commands::pty::write_pty`,
  `commands::pty::resize_pty`, `commands::pty::kill_pty`,
  `commands::shell::detect_shells`.

- [ ] **Step 1.7: Verify**

```bash
cd src-tauri && cargo check
```

Expected: compiles cleanly. New errors in portable-pty API are expected;
fix them per the actual API of 0.9. Document the final API call shape in a
brief inline note (allowed because the spec allows comments only when
needed for non-obvious code, and Rust API mismatches qualify).

---

## Task 2: TypeScript Tauri IPC wrappers

**Files:**
- Create: `src/types/terminal.ts`
- Create: `src/lib/terminal-theme.ts`
- Create: `src/lib/terminal-worker.ts`
- Create: `src/tauri/pty.ts`
- Create: `src/tauri/shell.ts`
- Modify: `src/tauri/index.ts`

- [ ] **Step 2.1: Create `src/types/terminal.ts`**

```ts
export interface Shell {
  id: string;
  label: string;
  path: string;
  args: string[];
  isDefault?: boolean;
}

export interface TerminalSession {
  id: string;
  shellId: string;
  shellLabel: string;
  pid: number;
  cwd: string;
  createdAt: number;
  title?: string;
}

export interface PtyExitPayload {
  code: number | null;
  signal: number | null;
}
```

- [ ] **Step 2.2: Create `src/lib/terminal-theme.ts`**

Exports `TERMINAL_THEME_DARK` and `TERMINAL_THEME_LIGHT` matching the Monaco
themes. xterm ITheme shape: `{ background, foreground, cursor, cursorAccent,
selectionBackground, black, red, green, yellow, blue, magenta, cyan, white,
brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta,
brightCyan, brightWhite }`. Use the 16-color "vscode dark+" palette that
matches Monaco's defaults.

- [ ] **Step 2.3: Create `src/lib/terminal-worker.ts`**

Just types:

```ts
export type ToWorker =
  | { type: "init"; sessionId: string }
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "shutdown" };

export type FromWorker =
  | { type: "ready"; sessionId: string }
  | { type: "output"; data: string }
  | { type: "exit"; code: number | null; signal: number | null }
  | { type: "error"; message: string };
```

- [ ] **Step 2.4: Create `src/tauri/pty.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PtyExitPayload } from "@/types/terminal";

export interface SpawnPtyArgs {
  sessionId: string;
  shellPath: string;
  shellArgs: string[];
  cwd: string;
  cols: number;
  rows: number;
}

export async function spawnPty(args: SpawnPtyArgs): Promise<number> {
  return invoke<number>("spawn_pty", args);
}

export async function writePty(sessionId: string, data: string): Promise<void> {
  await invoke("write_pty", { sessionId, data });
}

export async function resizePty(sessionId: string, cols: number, rows: number): Promise<void> {
  await invoke("resize_pty", { sessionId, cols, rows });
}

export async function killPty(sessionId: string): Promise<void> {
  await invoke("kill_pty", { sessionId });
}

export async function onPtyStdout(sessionId: string, handler: (data: string) => void): Promise<UnlistenFn> {
  return listen<string>(`terminal:stdout:${sessionId}`, (event) => handler(event.payload));
}

export async function onPtyExit(sessionId: string, handler: (payload: PtyExitPayload) => void): Promise<UnlistenFn> {
  return listen<PtyExitPayload>(`terminal:exit:${sessionId}`, (event) => handler(event.payload));
}
```

- [ ] **Step 2.5: Create `src/tauri/shell.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Shell } from "@/types/terminal";

export async function detectShells(): Promise<Shell[]> {
  return invoke<Shell[]>("detect_shells");
}
```

- [ ] **Step 2.6: Update `src/tauri/index.ts`**

```ts
export * from "./fs";
export * from "./dialog";
export * from "./pty";
export * from "./shell";
```

- [ ] **Step 2.7: Verify**

```bash
npm run typecheck
```

---

## Task 3: TerminalIOWorker

**Files:**
- Create: `src/workers/terminal.worker.ts`

- [ ] **Step 3.1: Implement `src/workers/terminal.worker.ts`**

`DedicatedWorkerGlobalScope` (cast `self as unknown as ...`).

State:
- `sessionId: string | null`
- `outputBuffer: string[]`
- `flushScheduled: boolean`

Behavior:
- On `init` message: store sessionId, post `ready` back.
- On `input` message: `postMessage({ type: "sendInput", sessionId, data })` to
  the main thread (the main thread then calls `writePty`).
- On `output` message **from main thread** (this is the main thread forwarding
  PTY stdout to the worker for buffering): `outputBuffer.push(data)`. If
  `!flushScheduled`, schedule `setTimeout(flush, 16)`. `flush` joins the
  buffer into one string and posts `output` to main thread.
- On `resize` from main thread: no-op for now (main thread handles resize
  directly via `resizePty`). The worker doesn't need to react.
- On `shutdown`: cancel the timeout, post `ready: false`, stop listening.

The worker is a passthrough with one feature: it batches stdout. The main
thread sends raw stdout to the worker (`type: "output"`) and the worker
re-emits it as one batched message.

Wait — re-reading the spec: the worker should batch and forward. The
direction is:
- Main → Worker: xterm input, raw stdout (for batching)
- Worker → Main: batched stdout (→ xterm.write), forwarded input (→ writePty)

So the worker has TWO responsibilities:
1. Coalesce stdout from PTY before writing to xterm (the batching we just
   described).
2. Forward xterm input to PTY (just a passthrough, no batching).

Both responsibilities are real: (1) reduces main-thread repaints; (2) keeps
the architecture symmetrical per the plan.

The main-thread `Terminal.tsx` component will:
- On xterm `onData`: `worker.postMessage({ type: "input", data })`
- Worker posts back `{ type: "sendInput", sessionId, data }` (same shape)
- Main thread handles `sendInput` → `writePty(sessionId, data)`
- On `onPtyStdout` (from Tauri): `worker.postMessage({ type: "output", data })`
- Worker batches and posts `{ type: "output", data: "joined" }`
- Main thread handles `output` → `xterm.write(data)`

- [ ] **Step 3.2: Implement Task 3 verification**

Actually — testing a `*.worker.ts` file from Node is awkward (it imports
TS types). Better: test the message-shape helpers if we extract them. For
Phase 4 keep it simple: just assert the type unions compile and have
expected discriminants. We can use `tsc --noEmit` on a `.test-d.ts` file.

Alternative: skip the test file entirely and rely on typecheck + manual
smoke. The plan says "one tiny unit test", and the message protocol is the
one piece of pure logic. Let me keep a real test using `worker_threads` from
Node — but the file is TS, so we need to either compile or hand-port.

**Pragmatic decision:** Use a `.test.mjs` that imports the `.ts` types
through a compiled step. We already use `tsc -b` in build, so `tsc --noEmit
-p tsconfig.app.json` is available. Simplest: hand-port the message shapes
to `.mjs` and assert equality. Not great.

**Better:** Don't add a worker test. Add a Rust test for shell detection
(Task 1.4 already plans this) and skip the worker test. The worker's
batching logic is simple enough that manual smoke covers it. Update the
verification approach: no JS test, one Rust test.

- [ ] **Step 3.3 (revised): No JS test file. Just the worker + typecheck.**

- [ ] **Step 3.4: Verify**

```bash
npm run typecheck
```

---

## Task 4: terminalStore

**Files:**
- Create: `src/stores/terminalStore.ts`

- [ ] **Step 4.1: Implement `src/stores/terminalStore.ts`**

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { spawnPty, killPty, resizePty, writePty, detectShells } from "@/tauri";
import { resolveHome } from "@/tauri/fs";
import type { Shell, TerminalSession } from "@/types/terminal";

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  defaultShellId: string | null;
  shells: Shell[];
  shellsLoaded: boolean;
  homeDir: string | null;

  loadShells: () => Promise<void>;
  createSession: (shellId?: string) => Promise<string | null>;
  closeSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  setDefaultShell: (shellId: string) => void;
  writeStdin: (id: string, data: string) => Promise<void>;
  resize: (id: string, cols: number, rows: number) => Promise<void>;
  getActiveSession: () => TerminalSession | null;
}

function uid(): string {
  return crypto.randomUUID();
}

function nextTitle(sessions: TerminalSession[]): string {
  const nums = sessions
    .map((s) => Number(s.title?.match(/^shell-(\d+)$/)?.[1] ?? 0))
    .filter((n) => n > 0);
  const n = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `shell-${n}`;
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      defaultShellId: null,
      shells: [],
      shellsLoaded: false,
      homeDir: null,

      loadShells: async () => {
        if (get().shellsLoaded) return;
        try {
          const [shells, home] = await Promise.all([detectShells(), resolveHome()]);
          const withDefaults = shells.map((s, i) => ({ ...s, isDefault: i === 0 }));
          const persistedDefault = get().defaultShellId;
          const validDefault = withDefaults.some((s) => s.id === persistedDefault)
            ? persistedDefault
            : (withDefaults[0]?.id ?? null);
          set({
            shells: withDefaults,
            shellsLoaded: true,
            homeDir: home,
            defaultShellId: validDefault,
          });
        } catch (err) {
          console.error("[terminalStore] loadShells failed:", err);
        }
      },

      createSession: async (shellId) => {
        const { shells, defaultShellId, homeDir, sessions } = get();
        const shell = shells.find((s) => s.id === (shellId ?? defaultShellId)) ?? shells[0];
        if (!shell || !homeDir) return null;
        const id = uid();
        const pid = await spawnPty({
          sessionId: id,
          shellPath: shell.path,
          shellArgs: shell.args,
          cwd: homeDir,
          cols: 80,
          rows: 24,
        });
        const session: TerminalSession = {
          id,
          shellId: shell.id,
          shellLabel: shell.label,
          pid,
          cwd: homeDir,
          createdAt: Date.now(),
          title: nextTitle(sessions),
        };
        set((s) => ({
          sessions: [...s.sessions, session],
          activeSessionId: id,
        }));
        return id;
      },

      closeSession: async (id) => {
        try {
          await killPty(id);
        } catch (err) {
          console.error("[terminalStore] killPty failed:", err);
        }
        set((s) => {
          const idx = s.sessions.findIndex((x) => x.id === id);
          const next = s.sessions.filter((x) => x.id !== id);
          let active = s.activeSessionId;
          if (active === id) {
            if (next.length === 0) active = null;
            else active = next[Math.min(idx, next.length - 1)]?.id ?? null;
          }
          return { sessions: next, activeSessionId: active };
        });
      },

      setActiveSession: (id) => {
        if (get().sessions.some((s) => s.id === id)) {
          set({ activeSessionId: id });
        }
      },

      renameSession: (id, title) => {
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
        }));
      },

      setDefaultShell: (shellId) => {
        const { shells } = get();
        if (!shells.some((s) => s.id === shellId)) return;
        set({
          defaultShellId: shellId,
          shells: shells.map((s) => ({ ...s, isDefault: s.id === shellId })),
        });
      },

      writeStdin: async (id, data) => {
        try {
          await writePty(id, data);
        } catch (err) {
          console.error("[terminalStore] writePty failed:", err);
        }
      },

      resize: async (id, cols, rows) => {
        try {
          await resizePty(id, cols, rows);
        } catch (err) {
          console.error("[terminalStore] resizePty failed:", err);
        }
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId) ?? null;
      },
    }),
    {
      name: "code-editor:terminal",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        defaultShellId: state.defaultShellId,
      }),
    },
  ),
);
```

- [ ] **Step 4.2: Verify**

```bash
npm run typecheck
```

---

## Task 5: Terminal component

**Files:**
- Create: `src/components/terminal/Terminal.tsx`
- Create: `src/hooks/useTerminalTheme.ts`

- [ ] **Step 5.1: Create `src/hooks/useTerminalTheme.ts`**

```ts
import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";
import { TERMINAL_THEME_DARK, TERMINAL_THEME_LIGHT } from "@/lib/terminal-theme";

export function useTerminalTheme() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--terminal-theme",
      theme === "dark" ? "dark" : "light",
    );
  }, [theme]);
  return { theme, dark: theme === "dark" ? TERMINAL_THEME_DARK : TERMINAL_THEME_LIGHT };
}
```

- [ ] **Step 5.2: Create `src/components/terminal/Terminal.tsx`**

`Terminal` component takes `session: TerminalSession`.

Implementation:
- `useRef<HTMLDivElement>` for the xterm container.
- `useRef<Terminal>` for the xterm instance.
- `useRef<FitAddon>` for the addon.
- `useRef<Worker>` for the terminal worker.
- On mount:
  1. Create `new Terminal({...})` with `theme: darkOrLight`, `fontFamily`,
     `fontSize`, `cursorBlink: true`, `scrollback: 5000`.
  2. Create `FitAddon`, `WebLinksAddon`, load both, `terminal.loadAddon(...)`.
  3. `terminal.open(containerRef.current)`.
  4. `fitAddon.fit()` to size.
  5. Create new `Worker(new URL("@/workers/terminal.worker.ts", import.meta.url), { type: "module" })`.
  6. Post `{ type: "init", sessionId }`.
  7. `terminal.onData((data) => worker.postMessage({ type: "input", data }))`.
  8. `worker.onmessage`: handle `ready` (no-op), `output` (`terminal.write(data)`),
     `sendInput` (`writeStdin(session.id, data)`), `error` (`console.error`).
  9. Listen for PTY stdout: `const unlisten = await onPtyStdout(session.id, (data) => worker.postMessage({ type: "output", data }))`. Store unlisten in a ref.
  10. Listen for PTY exit: handle by removing session from store (call
      `useTerminalStore.getState().closeSession(session.id)`).
  11. `ResizeObserver` on container: on resize, `fitAddon.fit()` then
      `resize(session.id, cols, rows)`.

- Cleanup on unmount:
  - `unlisten` for stdout and exit
  - `worker.terminate()`
  - `terminal.dispose()`

- Theme sync: `useEffect([theme])` calls `terminal.options.theme = ...` and
  does NOT re-fit (theme change doesn't change geometry).

- [ ] **Step 5.3: Verify**

```bash
npm run typecheck
```

---

## Task 6: Multi-terminal tabs

**Files:**
- Create: `src/components/terminal/TerminalTab.tsx`
- Create: `src/components/terminal/TerminalTabs.tsx`
- Create: `src/components/terminal/ShellPicker.tsx`
- Create: `src/components/terminal/TerminalEmptyState.tsx`

- [ ] **Step 6.1: Create `src/components/terminal/TerminalTab.tsx`**

Single tab UI: shell icon + title + close button.
- Click on the tab body: `setActiveSession(id)`.
- Click on the close button: `closeSession(id)`.
- Middle-click on the tab: `closeSession(id)`.
- Right-click: open context menu with "Close" and "Close Others".

Pattern follows `src/components/editor/EditorTab.tsx`.

- [ ] **Step 6.2: Create `src/components/terminal/TerminalTabs.tsx`**

Tab strip with the existing "Terminal" / "Problems" / "Output" / "Debug Console"
header (the spec's BottomPanel already has these as visual placeholders). For
Phase 4, only the "Terminal" group is functional; the others stay as
placeholders. Tab strip renders TerminalTab for each session, plus a "+"
button that opens ShellPicker.

- [ ] **Step 6.3: Create `src/components/terminal/ShellPicker.tsx`**

`DropdownMenu` from `components/ui/dropdown-menu`. Trigger: a `+` icon button.
Content: list of `shells` from `terminalStore`. Each item:
- Label
- "Default" badge if `isDefault`
- Click: `setDefaultShell(id)` (for items without isDefault) and
  `createSession(id)`.

Plus a "Default Shell" section at the top showing the current default and a
radio group to change it.

- [ ] **Step 6.4: Create `src/components/terminal/TerminalEmptyState.tsx`**

Hero: "No terminal open" + a "New Terminal" button (opens ShellPicker or
calls `createSession()` directly if shells not yet loaded).

- [ ] **Step 6.5: Verify**

```bash
npm run typecheck
```

---

## Task 7: Wire BottomPanel and context menu

**Files:**
- Modify: `src/components/layout/BottomPanel.tsx`
- Create: `src/components/terminal/TerminalContextMenu.tsx`

- [ ] **Step 7.1: Create `src/components/terminal/TerminalContextMenu.tsx`**

Wraps the xterm container in a `ContextMenu` from
`components/ui/context-menu`. Items:
- Copy (uses `navigator.clipboard.writeText(terminal.getSelection())`)
- Paste (uses `navigator.clipboard.readText()` then `terminal.paste(text)`)
- Separator
- Select All (`terminal.selectAll()`)
- Clear (`terminal.clear()`)

The component takes a `terminalRef` and a `containerRef`. It uses
`ContextMenuTrigger` on the container (manual mode).

- [ ] **Step 7.2: Modify `src/components/layout/BottomPanel.tsx`**

Replace the placeholder paragraph with:
- `<TerminalTabs />` (the header stays)
- Below the header: either `<Terminal session={...} />` if a session is
  active, or `<TerminalEmptyState />` if not.

Initialize the store: `useEffect(() => { useTerminalStore.getState().loadShells(); }, [])` once on mount.

- [ ] **Step 7.3: Verify**

```bash
npm run typecheck
npm run build
```

---

## Task 8: xterm CSS, shortcuts, status bar, final wiring

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/index.css`
- Modify: `src/components/layout/StatusBar.tsx`
- Create: `src/hooks/useTerminalHotkeys.ts`
- Modify: `src/components/layout/ShellLayout.tsx` (to mount the hotkey hook)

- [ ] **Step 8.1: Modify `src/main.tsx`**

Add import at top: `import "@xterm/xterm/css/xterm.css";`

- [ ] **Step 8.2: Modify `src/index.css`**

Add under `@theme inline`:
```css
--font-mono: ui-monospace, "Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace;
```

(Actually the project doesn't have a `--font-mono` yet. Check the existing
index.css — no font variable exists. We can either add this CSS var or just
pass `fontFamily` directly to xterm. We'll pass it directly in the Terminal
component to avoid CSS churn. Skip this step.)

- [ ] **Step 8.3: Create `src/hooks/useTerminalHotkeys.ts`**

```ts
import { useHotkey } from "@/hooks/useHotkey";
import { useTerminalStore } from "@/stores/terminalStore";
import { useUiStore } from "@/stores/uiStore";

export function useTerminalHotkeys() {
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);
  const createSession = useTerminalStore((s) => s.createSession);
  const setActivePanel = useUiStore((s) => s.setActivePanel);

  useHotkey({
    combo: "mod+`",
    description: "Toggle terminal panel",
    handler: () => {
      toggleTerminal();
      setActivePanel("terminal");
    },
  });
  useHotkey({
    combo: "mod+shift+`",
    description: "Create new terminal",
    handler: async () => {
      const terminalOpen = useUiStore.getState().terminalOpen;
      if (!terminalOpen) toggleTerminal();
      setActivePanel("terminal");
      await createSession();
    },
  });
}
```

- [ ] **Step 8.4: Mount hotkey hook in `src/components/layout/ShellLayout.tsx`**

Add `useTerminalHotkeys();` near `useTheme();`. Also focus the active panel
properly: the existing `toggleTerminal` is already wired to Ctrl+`; remove
the duplicate from ShellLayout to avoid double-registration. Verify the
existing `useHotkey({ combo: "mod+`", handler: () => toggleTerminal() })`
in ShellLayout and replace it with `useTerminalHotkeys()`.

- [ ] **Step 8.5: Modify `src/components/layout/StatusBar.tsx`**

Add a "Shell: <label>" indicator that reads from `useTerminalStore`'s
`getActiveSession()`. Place it next to the existing "Toggle Terminal"
button. Style: same `StatusItem` component, with the shell label or "—" if
no session is active. Clicking it focuses the terminal panel (set
`activePanel = "terminal"`).

- [ ] **Step 8.6: Final verification**

```bash
cd src-tauri && cargo check
npm run typecheck
npm run build
```

Expected:
- `cargo check` succeeds (Rust PTY + shell detection compile)
- `npm run typecheck` passes
- `npm run build` produces a working dist

---

## Manual Smoke Checklist

After `npm run tauri dev` succeeds:

- [ ] App opens, no console errors
- [ ] Press Ctrl+` → bottom panel opens, "No terminal" empty state shown
- [ ] Press Ctrl+Shift+` → new terminal spawned, default shell prompt visible
- [ ] Type `dir` (Windows) or `ls` (Unix) → output appears
- [ ] Run `echo hello` → "hello" printed
- [ ] Switch theme (Ctrl+Shift+T) → xterm colors update in place
- [ ] Press `+` button → ShellPicker opens, lists detected shells
- [ ] Pick a different shell → new tab created with that shell
- [ ] Close one tab → tab removed, adjacent tab becomes active
- [ ] Right-click in terminal → Copy / Paste / Select All / Clear work
- [ ] Drag the resizer → terminal height changes, PTY resizes (run `stty size`
      to verify)
- [ ] Press Ctrl+` again → panel closes
- [ ] Press Ctrl+` again → panel reopens with last-active session
- [ ] Restart app → default shell choice is remembered (persisted), but
      sessions themselves are NOT (PTY processes died with the app)
- [ ] Cargo `cargo test` runs (only the shell-detection test we added)

---

## Commit Strategy

One commit per task, using the project's existing convention:
`phase-4: <description>`. No comments in code unless strictly necessary.
