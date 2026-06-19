# Quantum

[![CI](https://github.com/user-sb737/Code-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/user-sb737/Code-editor/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A modern, extensible desktop code editor** built with Tauri 2 + React 19 + TypeScript + Monaco Editor.

Quantum is a feature-rich IDE designed for local development, with deep Git integration, a full debug adapter protocol client, LSP language server support, a flexible extension system, and a VS Code-inspired layout. Currently in active development.

---

## Features

### Editor & File Management
- **Monaco Editor** — full IDE-grade code editing with syntax highlighting for 40+ languages, IntelliSense, multi-cursor, bracket pair colorization, minimap, breadcrumbs, inlay hints, word wrap, and relative line numbers
- **Multi-tab editing** — open, close, reorder tabs (drag-and-drop), split editor view, cycle tabs, dirty state tracking
- **File explorer** — recursive directory tree with `.gitignore`-aware filtering, file CRUD, drag-and-drop file moving, hidden file toggle, keyboard navigation
- **Auto-save** — configurable delay, format-on-save support
- **Session restore** — tabs, cursor positions, and active tab persist across restarts
- **Large file handling** — warning on files >5 MB

### Git Integration
- Full **Git status** display (staged, unstaged, untracked, conflicted) with file tree decorations and gutter markers
- **Stage/unstage** files, hunks, or individual lines
- **Commit** with amend support, **push/pull/fetch** with authentication token support
- **Branch management** — create, delete, checkout, compare branches
- **Git graph** visualization, **commit detail** viewer, **Git log** with filtering
- **Stash management** — push, pop, drop, partial stash, stash diff viewing
- **Interactive rebase** — todo list editing, reorder, continue, skip, abort
- **Cherry-pick** and **revert** with conflict detection and resolution
- **Tag management** — create, delete, push tags
- **Git worktree** management — add, remove, prune
- **Git bisect** — start, good, bad, skip, reset, log
- **Git blame** (via Web Worker), **submodule status**, **init repository**
- **Remote management** — add, remove remotes
- Auto-detection of rebase/cherry-pick/revert in progress

### GitHub Integration
- OAuth device authentication flow
- Pull request listing with CI check status
- Issue listing
- Auto-detect GitHub remote and set repository context
- Session persistence across restarts

### Terminal
- Full PTY terminal via **xterm.js**
- Multi-session support (up to 8 concurrent sessions)
- Automatic shell detection (cross-platform)
- Session tabs with rename support
- Configurable font size, family, and default shell
- Theme-aware ANSI 16-color palette
- Scrollback buffer (5000 lines)
- Resize handling and clipboard integration

### Debugging (DAP)
- Built-in **Debug Adapter Protocol** client
- **Editor toolbar Run button** — config dropdown with Play/Stop button in the tab bar; three states: idle (▶), running (■), paused (■)
- **launch.json** support — configs stored in `.quantum/launch.json` with add/edit/delete via inline dialog
- **CodeLens** — "▶ Run" inline action above functions/methods/classes
- Launch and attach debug configurations
- Breakpoints — add, remove, toggle, conditional, exception breakpoints
- Call stack, variables/scopes inspection, watch expressions
- Debug console / REPL
- Full stepping controls (over, into, out, continue, pause)
- Thread management, multiple concurrent debug sessions

### LSP Support
- Built-in **Language Server Protocol** client
- Document synchronization (open, change, close)
- Completion, hover, definition, signature help via Monaco bridge
- Language server lifecycle management (auto-start, idle kill)
- Extension API for registering custom LSP servers per language
- **Pyright** bundled as a first-party LSP server

### Multi-Agent Orchestration (Quantum Swarm) — In Progress
> **Phase 0: Foundation & Dependency Audit** completed 2026-06-19
> **Phase 1: Rust Backend Core** completed 2026-06-19 (all commands compile, 45 unit tests)
> **Phase 2: Types, Store & Events** completed 2026-06-19 (16 TS tests, 137 total passing)

- **Git worktree isolation** — each AI agent runs in its own isolated checkout, no file collisions
- **Multi-agent coordination** — sequential task execution with merge conflict detection
- **File-based IPC** — agents communicate via `context.md` (IDE→agent) and `manifest.json` (agent→IDE)
- **OS keychain API keys** — secure provider credential management (file-based in v1, keychain in v2)
- **Real-time status visibility** — live agent manifest updates, activity timeline, file lock tracking
- **PTY environment injection** — `QUANTUM_*` vars + API keys injected at spawn, no manual config
- **IDE crash recovery** — reconciles agent state on restart, detects alive/dead processes
- **Supported agents:** OpenCode, KiloCode (launch); Claude Code, Codex, Aider (future)
- **Frontend types mirroring Rust state** — `SwarmState`, `AgentInfo`, `TaskSpec`, event payloads
- **Zustand store** — `swarmStore` with all state mutations, file lock auto-update, timeline
- **Tauri event bridge** — `startSwarmEventListeners` loads state, listens for manifest changes/errors
- **Coordination service** — `onAgentExit` triggers merge flow, `unblockDependents` spawns next agent, `buildContextMd` generates context, 30s heartbeat
- **Terminal integration** — `agentId` field on `TerminalSession`, exit events routed to coordination
- See [`docs/swarm-design.md`](docs/swarm-design.md) for full architecture

### Extension System
- Sandboxed extension host with lifecycle management (activation/deactivation/cleanup)
- Extension manifest format: name, displayName, description, version, main entry
- Hot-reload — watches extensions directory and reloads on changes
- Extension API:
  - `commands.register` / `commands.execute` — register and invoke commands
  - `editor` — lifecycle events (open, close, save, change, cursor), document access
  - `window` — info/warn/error prompts, input, quick pick
  - `statusBar` — contribute status bar items
  - `views.register` — custom panels that appear in the activity bar
  - `settings` — get, set, watch changes
  - `fs` — read, write, list, exists
  - `monaco` — direct editor and language API access
  - `lsp.register` — register language servers
  - `storage` — extension-scoped key-value persistence
- Extension marketplace with seed list (Prettier, ESLint, Python, Rust Analyzer, Copilot, Tailwind CSS)
- Install from GitHub URL or VS Code Marketplace

### Layout & UI
- VS Code-inspired IDE layout with three resizable dock zones (left, right, bottom)
- **Activity bar** with icons for each panel
- **Sidebar position** toggle (left / right)
- **Panel alignment** options (left, center, right, justify)
- **Layout presets** — Default, Minimal, Git Review — plus save/load/delete custom presets
- **Detachable panels** — pop out into separate windows
- **Custom title bar** with menu bar toggle
- **Status bar** with theme, branch, cursor position, diagnostics, toasts
- **Unified search bar** (`Ctrl+P`) — centered in title bar, supports files/commands/symbols/goto/full-text
- **Keyboard Shortcuts** cheat sheet (`Ctrl+Alt+K`)

### Search
- **Unified search bar** centered in the title bar — replaces QuickOpen and CommandPalette
- **Multi-mode search:** `>` commands, `@` symbols, `:` goto line, `%` full-text search, default file search
- Search-and-replace sidebar panel with full-text file search via Tauri backend
- Configurable exclude patterns (default: `node_modules`, `.git`, `dist`, `build`)
- Configurable max results

### Themes
- **4 built-in themes**: dark (GitHub-dark inspired), light, Catppuccin Mocha, Spiderman
- Full **visual theme editor** with live preview, color field editing, and color groups
- Each theme defines both Monaco editor colors and xterm.js terminal ANSI colors
- Custom themes loaded from `~/.quantum/themes/`
- User CSS overrides via `~/.quantum/custom.css`
- Live theme switching, CSS `color-scheme` support

### Outline & Markdown
- **File Outline panel** — document symbols (functions, classes, interfaces, variables) with tree view, cursor tracking, and click-to-navigate
- **Markdown preview** — live preview with table of contents, HTML rendering

### Diagnostics & Problems
- **Problems panel** — aggregated Monaco diagnostics with error/warning counts
- **Output panel** — extension and build output
- **Debug Console** — DAP REPL and evaluation

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **Rust** stable (≥ 1.77) with `rustup`
- **WebView2** (Windows, preinstalled on Win 10/11)

### Install & run

```sh
npm install
npm run tauri dev
```

Starts the Vite dev server at `http://localhost:1420` and launches the Tauri desktop window.

### Type-check

```sh
npm run typecheck
```

### Run tests

```sh
npm run test
```

### Production build

```sh
npm run tauri build
```

Outputs platform bundles to `src-tauri/target/release/bundle/`.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server (browser-only, no Tauri) |
| `npm run build` | Full production build (typecheck + copy Pyright + Vite build) |
| `npm run preview` | Preview production build |
| `npm run tauri` | Tauri CLI passthrough |
| `npm run typecheck` | TypeScript no-emit check |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (run once) |
| `npm run test:watch` | Vitest (watch mode) |
| `npm run check` | Typecheck + tests |
| `npm run copy-pyright` | Bundle Pyright extension for production builds |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | **Tauri 2** (Rust) with plugins: `fs`, `dialog`, `shell` |
| Frontend | **React 19** + **TypeScript** 5.7 |
| Build | **Vite 6** + `vite-plugin-compression` |
| Styling | **Tailwind CSS 4** (via `@tailwindcss/vite`), `class-variance-authority`, `tailwind-merge` |
| UI | **shadcn/ui** (Radix UI primitives), **lucide-react** icons |
| Editor | **Monaco Editor** 0.55 (`@monaco-editor/react`) |
| Terminal | **xterm.js** 5.5 + addon-fit + addon-web-links |
| State | **Zustand** 5 with `persist` middleware |
| Drag & drop | **@dnd-kit** (core, sortable, utilities) |
| Git | **Tauri shell plugin**, custom Rust IPC commands |
| GitHub | **@octokit/rest**, **@octokit/auth-oauth-device** |
| Testing | **Vitest** 4 + Testing Library + jsdom |
| Linting | **ESLint** 10 + typescript-eslint |
| Compression | `vite-plugin-compression` (gzip/brotli) |

---

## Architecture

```
Tauri Shell (Rust)
├── plugin-fs        → File CRUD, directory trees, file watching
├── plugin-dialog    → Native open folder / file dialogs
├── plugin-shell     → PTY spawning, shell detection, process mgmt
└── IPC commands     → 50+ commands (fs, git, search, pty, definitions)

Single WebView (React 19)
├── ShellLayout
│   ├── TitleBar / MenuBar / ActivityBar
│   ├── LeftDock ├── RightDock ─┬── BottomDock
│   │             │             │
│   ├── EditorArea ─────────────┤
│   │   └── Monaco Editor       │
│   │       └── EditorTabs      │
│   └── StatusBar               │
│                                │
├── Search ──────────────────────┤
│   ├── SearchBar (title bar)    │
│   ├── SearchSidebar (sidebar)  │
│                                │
├── Modal Overlays ──────────────┤
│   ├── SettingsPanel            │
│   ├── ThemeEditor              │
│   └── ShortcutCheatSheet       │
│                                │
├── Zustand Stores (14) ─────────┤
│   editor, file, ui, terminal,  │
│   git, github, debug,          │
│   diagnostic, settings, search │
│   keybinding, modal, toast,    │
│   extensionStatusBar           │
│                                │
├── Web Workers (3) ─────────────┤
│   fileTree, git, terminal      │
│                                │
├── Services ────────────────────┤
│   ThemeService, IconPackService │
│   LspManager, DapManager       │
│   HotkeyRegistry, CommandRegistry
│                                │
└── Extension Host ──────────────┘
    ├── ExtensionAPI (commands, editor, window, statusBar, views,
    │                 settings, fs, storage, monaco, lsp)
    ├── Extension lifecycle (activate / deactivate / hot-reload)
    └── Marketplace (VS Code, GitHub URL, seed list)
```

---

## Project Structure

```
.
├── index.html                        # Vite entry HTML
├── package.json
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── components.json                   # shadcn/ui config
├── public/                           # Static assets
├── scripts/
│   ├── copy-pyright.cjs              # Pyright bundling script
│   └── generate-icons.mjs            # Icon placeholder generator
├── src/
│   ├── App.tsx                       # Root layout + error boundary
│   ├── main.tsx                      # Entry point
│   ├── index.css                     # Tailwind 4 + design tokens
│   ├── components/
│   │   ├── ui/                       # shadcn primitives (Radix)
│   │   ├── layout/                   # Shell, title bar, menus, docks, status bar
│   │   ├── editor/                   # Monaco wrapper, tabs, split view, breadcrumbs
│   │   ├── explorer/                 # File tree, CRUD, drag-drop
│   │   ├── terminal/                 # xterm wrapper, sessions, shell picker
│   │   ├── git/                      # Git sidebar, diff, history, graph, branch mgmt
│   │   ├── github/                   # GitHub auth, PRs, issues
│   │   ├── debug/                    # DAP debugger UI
│   │   ├── search/                   # Search bar + search sidebar
│   │   ├── outline/                  # Document symbols outline
│   │   ├── command/                  # Command palette, shortcuts
│   │   ├── settings/                 # Settings panel, keybindings
│   │   ├── theme/                    # Theme editor with live preview
│   │   ├── extensions/               # Extension marketplace, install, toast, quick pick
│   │   └── markdown/                 # Markdown preview
│   ├── stores/                       # 14 Zustand stores
│   ├── workers/                      # Web Workers (fileTree, git, terminal)
│   ├── hooks/                        # Custom hooks (hotkeys, theme, git, zoom, etc.)
│   ├── tauri/                        # Tauri IPC wrappers
│   ├── lib/                          # Utilities, services, registries
│   ├── extensions/                   # Extension host, API, view registry
│   └── types/                        # TypeScript type definitions
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json              # Tauri permission grants
    ├── src/
    │   ├── main.rs                   # Binary entry
    │   └── lib.rs                    # Tauri builder + plugin init
    └── icons/                        # App icons (placeholder)
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Unified search bar (files, commands, symbols, goto, full-text) |
| `Ctrl+Shift+P` | Search bar — commands mode |
| `Ctrl+B` | Toggle sidebar |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+,` | Settings |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+W` | Close editor tab |
| `Ctrl+Tab` | Cycle tabs |
| `Ctrl+\` | Toggle split editor |
| `Ctrl+Shift+E` | Focus explorer |
| `Ctrl+Shift+F` | Focus search |
| `Ctrl+Shift+G` | Focus source control |
| `Ctrl+Alt+K` | Keyboard shortcuts cheat sheet |
| `Ctrl+.` | Quick fix |
| `Ctrl+=` / `Ctrl+-` | Zoom in / zoom out |
| `Ctrl+0` | Reset zoom |
| `` Ctrl+Shift+` `` | New terminal session |
| `Alt` | Toggle menu bar |

### Debug shortcuts

| Shortcut | Action |
|----------|--------|
| `F5` | Start/Continue debugging |
| `Ctrl+F5` | Run without debugging |
| `Shift+F5` | Stop debugging |
| `Ctrl+Shift+D` | Focus debug sidebar |

### Git shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+C` | Commit staged changes |
| `Ctrl+Alt+P` | Push to remote |
| `Ctrl+Alt+D` | Diff current file |
| `Ctrl+Shift+L` | Git log |
| `Ctrl+Shift+B` | Git blame |

---

## Extension Development

Extensions live in `~/.code-editor/extensions/`. Each extension is a directory with a manifest and entry point.

**Example manifest (`package.json`):**
```json
{
  "name": "my-extension",
  "displayName": "My Extension",
  "description": "Does something useful",
  "version": "1.0.0",
  "main": "index.js"
}
```

**Example entry point (`index.js`):**
```js
export function activate(api) {
  // Register a command
  const disposable = api.commands.register("myExt.sayHello", () => {
    api.window.showInfo("Hello from my extension!");
  });

  // Contribute a status bar item
  api.statusBar.create("Hello", "left");

  // Return cleanup
  return () => disposable.dispose();
}
```

**Available API modules:** `commands`, `editor`, `window`, `statusBar`, `views`, `settings`, `fs`, `storage`, `monaco`, `lsp`.

Extensions can also register custom LSP servers per language:
```js
api.lsp.register("python", {
  command: "pyright-langserver",
  args: ["--stdio"],
});
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
