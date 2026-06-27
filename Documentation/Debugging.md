# Execution Engine

Quantum IDE features a layered **Execution Engine** that handles running source files, managing processes, and piping output to the terminal. It replaces the old DAP-based debug subsystem with a clean, extensible architecture designed for future debug, AI-execute, SSH, and Docker layers.

---

## 1. Architecture

The Execution Engine follows a strict layered design — UI never runs code directly, it sends commands to a dedicated execution service.

```
┌─────────────────────────────────────────────────────┐
│  UI Layer (React)                                   │
│  RunButton / StopButton / TerminalPanel             │
│  ── calls ExecutionService ──                       │
├─────────────────────────────────────────────────────┤
│  ExecutionService (singleton)                       │
│  ── ProcessManager ── TaskQueue                     │
├─────────────────────────────────────────────────────┤
│  Resolution Layer                                   │
│  LanguageDetector → RuntimeResolver → CommandBuilder│
├─────────────────────────────────────────────────────┤
│  Process Layer                                      │
│  ProcessRegistry → PtyService (tauriSpawn)          │
├─────────────────────────────────────────────────────┤
│  Tauri Backend (Rust)                               │
│  OS-level PTY spawning, process lifecycle           │
└─────────────────────────────────────────────────────┘
```

### Core Modules (9 files in `src/core/execution/`)

| Module | Responsibility |
|--------|---------------|
| `types.ts` | Shared types: `Language`, `ProcessStatus`, `RunRequest`, `Task`, `OutputChunk`, `TerminalEvent` |
| `LanguageDetector.ts` | Maps file extensions to `Language` enum |
| `RuntimeResolver.ts` | Resolves runtime command per language (e.g. `python3` for `.py`) |
| `CommandBuilder.ts` | Builds command arrays — compile+run for C/C++/Java, single command for interpreted |
| `ProcessManager.ts` | Manages process start/stop via pluggable `SpawnFn` |
| `ProcessRegistry.ts` | Tracks running processes: id, language, status, start time, exit code |
| `TaskQueue.ts` | Serializes execution tasks, deduplicates by file+type |
| `OutputParser.ts` | Structures stdout/stderr into `OutputChunk` |
| `ExecutionService.ts` | Singleton orchestrator — ties everything together |

### Terminal Layer (3 files in `src/core/terminal/`)

| Module | Responsibility |
|--------|---------------|
| `TerminalEvents.ts` | Event types for terminal I/O |
| `TerminalAdapter.ts` | Adapts process output for terminal display |
| `PtyService.ts` | Wraps `@tauri-apps/plugin-shell` `Command.create()` — default spawn function |

### Backend Layer (3 files in `src/core/backend/`)

| Module | Responsibility |
|--------|---------------|
| `spawn.ts` | Platform-agnostic spawn interface |
| `ipc.ts` | Tauri IPC communication helpers |
| `permissions.ts` | Permission checks for process spawning |

### UI Components (in `src/ui/`)

| Component | Responsibility |
|-----------|---------------|
| `RunButton.tsx` | Triggers execution via `executionService.run()` |
| `StopButton.tsx` | Kills running process via `executionService.stop()` |
| `TerminalPanel.tsx` | Displays stdout/stderr in a terminal-like view |

---

## 2. Execution Flow

### Running a File

1. User clicks **Run** (▶) in the editor toolbar
2. `RunButton` calls `executionService.run({ file, cwd })`
3. `ExecutionService` enqueues a task in `TaskQueue` (deduplicates by file)
4. `TaskQueue` calls back `executeTask()` when ready
5. `LanguageDetector` detects language from file extension
6. `RuntimeResolver` resolves runtime command (e.g. `node`, `python3`, `go run`)
7. `CommandBuilder` builds command array (compile+run for compiled languages)
8. `ProcessManager.start()` spawns process via `PtyService.tauriSpawn()`
9. Output flows through callbacks → UI terminal display
10. On exit, `ProcessRegistry` updates status, UI shows Stop button

### Stopping a Process

1. User clicks **Stop** (■) in the editor toolbar
2. `StopButton` calls `executionService.stop(processId)`
3. `ProcessManager.stop()` kills the process
4. `ProcessRegistry` updates status to `"stopped"`

### States

| State | UI Indication |
|-------|---------------|
| **Idle (▶)** | Ready to run |
| **Running (■)** | Process is executing; Stop button visible |
| **Exited** | Process completed; output shown in terminal |
| **Error** | Process failed to start or crashed |

---

## 3. Language Support

| Language | Runtime | Command |
|----------|---------|---------|
| JavaScript | `node` | `node <file>` |
| TypeScript | `npx tsx` or `node` | `npx tsx <file>` |
| Python | `python3` | `python3 <file>` |
| C | `gcc` | `gcc <file> -o <out> && ./<out>` |
| C++ | `g++` | `g++ <file> -o <out> && ./<out>` |
| Rust | `cargo` | `cargo run` |
| Go | `go` | `go run <file>` |
| Java | `javac` + `java` | `javac <file> && java <ClassName>` |

Language detection is by file extension. Runtime resolution uses the system PATH.

---

## 4. Extending the Engine

The Execution Engine is designed for future layers without redesign:

### Adding a Debug Layer
Add a `DebugManager` that intercepts `RunRequest`, injects debug flags, and wraps the spawn function with a DAP-compatible adapter.

### Adding AI-Execute
Add an `AiExecutor` that sends code to an LLM backend, receives execution plans, and runs them through the same `ProcessManager`.

### Adding SSH/Docker
Swap `PtyService.tauriSpawn()` for an SSH spawn function or Docker exec spawn function. The `ProcessManager` accepts any `SpawnFn` — no other changes needed.

### Adding a New Language
1. Add language to `Language` type in `types.ts`
2. Add detection in `LanguageDetector.ts`
3. Add runtime in `RuntimeResolver.ts`
4. Add command in `CommandBuilder.ts` (if compiled)

---

## 5. Configuration

No special configuration required for basic execution. Future configuration (e.g. custom run commands, environment variables, debug profiles) will live in `.quantum/settings.json`:

```json
{
  "execution.defaultRuntime": {},
  "execution.envVars": {},
  "execution.timeout": 30000
}
```

---

## 6. Comparison to Old DAP System

| Feature | Old DAP System | New Execution Engine |
|---------|---------------|---------------------|
| **Scope** | Debug-focused | Run-focused, extensible |
| **Architecture** | Tightly coupled to DAP protocol | Layered, swappable backends |
| **Breakpoints** | Yes | Future debug layer |
| **Variable Inspection** | Yes | Future debug layer |
| **Call Stack** | Yes | Future debug layer |
| **Process Management** | Via DAP adapter | Native ProcessManager |
| **Output** | Debug console (REPL) | Terminal Panel |
| **File Count** | 19 files | 18 files (9 core + 3 terminal + 3 backend + 3 UI) |
| **Dependency** | DAP protocol libraries | None — uses `@tauri-apps/plugin-shell` |
