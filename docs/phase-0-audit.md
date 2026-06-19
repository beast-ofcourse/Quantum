# Phase 0 — Foundation & Dependency Audit

> Date: 2026-06-19
> Branch: `phase-0-foundation`
> Design ref: [`docs/swarm-design.md`](./swarm-design.md)
> Task ref: [`docs/tasks.md`](./tasks.md)

---

## 0.1 — User Configuration Gate

All open questions are confirmed answered from the adversarial hyperplan review. Decisions captured below:

| # | Question | Decision | Source |
|---|----------|----------|--------|
| Q1 | Default agent + model | `opencode` + `deepseek-v4-flash-free` | User confirmed via hyperplan |
| Q2 | Supported agents at launch | `opencode` + `kilocode` only (2 of 5) | User confirmed; claude-code, codex, aider deferred |
| Q3 | Sequential or parallel | **Sequential** for v1. DAG deferred to Phase 5. | Skeptic finding, user confirmed |
| Q4 | API key storage | File-based at `.quantum/.secrets.env` (600 perms on Unix). `keyring-rs` deferred to v2. | Skeptic finding, user confirmed |

### Seed Configuration for `swarm-state.json` config section

```jsonc
{
  "config": {
    "defaultAgent": "opencode",
    "defaultModel": "deepseek-v4-flash-free",
    "quickPresets": [
      { "agent": "opencode",  "model": "deepseek-v4-flash-free", "label": "OpenCode · DeepSeek V4 Flash Free" },
      { "agent": "kilocode", "model": "deepseek-v4-flash-free", "label": "KiloCode · DeepSeek V4 Flash Free" }
    ],
    "modelOptions": {
      "opencode":  ["deepseek-v4-flash-free", "deepseek-v4-flash"],
      "kilocode": ["deepseek-v4-flash-free", "deepseek-v4-flash"]
    }
  }
}
```

**Agent → model mapping** (used at spawn time for env injection):

| Provider  | Env Var               | Used By                 |
|-----------|-----------------------|-------------------------|
| DeepSeek  | `DEEPSEEK_API_KEY`    | OpenCode, KiloCode      |
| OpenAI    | `OPENAI_API_KEY`      | OpenCode *(fallback)*   |
| OpenRouter| `OPENROUTER_API_KEY`  | OpenCode, KiloCode *(fallback)* |

---

## 0.2 — Dependency Audit

### notify = "8"

| Item | Status | Details |
|------|--------|---------|
| Cargo.toml | ✅ Already present | `notify = "8"` (no debouncer yet) |
| notify-debouncer-mini | ✅ **v0.7.0 compatible** | Depends on `notify ^8.2.0`. Verified via crates.io API. Use `notify-debouncer-mini = "0.7"`. |
| Fallback | ✅ Documented (not needed) | Manual debounce: 150ms timeout + coalesce via `std::sync::mpsc::channel`. Only needed if v0.7 has issues. |
| Next step | Add `notify-debouncer-mini = "0.7"` to Cargo.toml in Phase 1. |

### git2

| Item | Status | Details |
|------|--------|---------|
| Cargo.toml | ❌ Not present | All git operations use `std::process::Command` shell-outs |
| Existing git.rs | ✅ 2173 lines | Proven pattern: shell-based git via `run_git` helper |
| git2 rationale | Deferred | Per D4 decision: `tokio::process::Command` for writes; git2 was planned for reads only. Since existing pattern works, consider if git2 is needed at all. For v1, **skip git2** — use shell commands for everything, consistent with existing codebase. |
| Worktree git CLI availability | ⚠️ `git worktree add` requires git >= 2.5 | Verify target systems have compatible git. In practice, any git < 2.5 is extremely rare in 2026. |

### keyring

| Item | Status | Details |
|------|--------|---------|
| Cargo.toml | ❌ Not present | Deferred to v2 per Q4 decision |
| v1 approach | File-based | `.quantum/.secrets.env` with 600 permissions |
| Interface | Defined in design | `get_api_key`, `set_api_key`, `delete_api_key` — same function signatures as keyring-rs would use |
| Keyring-rs research | ⏳ Deferred | Not needed for v1. When implementing, check `keyring = "3"` compiles on Windows (WinCred), macOS (Keychain), Linux (Secret Service + kernel keyring fallback). |

### tokio

| Item | Status | Details |
|------|--------|---------|
| Cargo.toml | ❌ Not explicit | Tauri 2 ships tokio internally but does not expose `process` feature publicly |
| Existing pattern | `std::thread::spawn` | PTY reader thread uses std threads, not tokio tasks |
| Plan for v1 | Use `std::process::Command` + `std::thread` | Consistent with existing codebase. `tokio::process::Command` would need tokio to be an explicit dep. Use blocking `std::process::Command` in spawned threads instead. |
| If async git needed | Add `tokio = { version = "1", features = ["process"] }` | But this can wait. For v1, synchronous git commands in `std::thread::spawn` callbacks are sufficient. |

### Dependency Summary for Phase 1 Cargo.toml additions

```toml
# Exact additions for Phase 1 Cargo.toml
notify-debouncer-mini = "0.7"   # Compatible with notify = "8" (depends on notify ^8.2.0)
# No git2, no keyring, no tokio in v1
```

---

## 0.3 — Pre-existing PTY System Audit

### File: `src-tauri/src/commands/pty.rs` (229 lines)

**`spawn_pty` signature:**
```rust
#[tauri::command]
pub async fn spawn_pty(
    app: AppHandle,
    state: State<'_, PtySessionState>,
    session_id: String,
    shell_path: String,
    shell_args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<i32, String>
```

**Key observations:**

| Aspect | Current | Swarm Requirement | Gap |
|--------|---------|-------------------|-----|
| Env vars | None — `CommandBuilder` gets only shell_path, shell_args, cwd | Must inject `QUANTUM_*` vars + API keys | **BLOCKER** — must add `env: HashMap<String, String>` parameter |
| Session ID | Passed by caller | Swarm will generate via `crypto.randomUUID()` | No gap — caller can pass any ID |
| CWD | Arbitrary path | Must be `.quantum/worktrees/<agent-id>/` | No gap — caller passes the worktree path |
| Return | `pid: i32` | Need PID for tracking, health checks | No gap — returns PID already |
| Exit events | `terminal:exit:{session_id}` with `PtyExitPayload { code, signal }` | Need swarm-level event `swarm:agent-exit` | **Gap** — add global `swarm:agent-exit` event in addition to per-session event |
| Kill | `kill_pty(session_id)` — kills process | Need timeout: SIGTERM → 5s → SIGKILL | **Gap** — current kill is immediate. Add graceful shutdown sequence. |

**`PtySessionState` structure:**
```rust
pub struct PtySessionState {
    pub sessions: Arc<Mutex<HashMap<String, PtyHandle>>>,
}
```
Safe to share across swarm commands. No change needed.

**`PtyExitPayload`:**
```rust
pub struct PtyExitPayload {
    pub code: Option<i32>,
    pub signal: Option<i32>,
}
```
Adequate for swarm — `code: 0` = done, non-zero = failed.

### File: `src/tauri/pty.ts` (50 lines)

**Exported functions:** `spawnPty`, `writePty`, `resizePty`, `killPty`, `onPtyStdout`, `onPtyExit`

**For swarm**, we need:
- `spawnPty` wrapper that passes `env` parameter (after Rust side is extended)
- Listener for `swarm:agent-exit` event (to be added alongside existing `terminal:exit:<sessionId>`)

### File: `src/stores/terminalStore.ts` (297 lines)

**Key details:**
- Zustand store with `persist` middleware (storage key `"code-editor:terminal"`)
- `TerminalSession` has: `id`, `shellId`, `shellLabel`, `pid`, `cwd`, `createdAt`, `title`
- `createSession` generates UUID, calls `spawnPty`, registers listeners
- No `agentId` mapping exists — **gap**: need to add `agentId?: string` to `TerminalSession`
- Session limit: 8 (MAX_TERMINAL_SESSIONS)

### Summary of PTY Changes Needed (Phase 1)

| Change | File | Priority |
|--------|------|----------|
| Add `env` param to `spawn_pty` | `src-tauri/src/commands/pty.rs` | **Critical** — blocks all agent spawning |
| Emit `swarm:agent-exit` event | `src-tauri/src/commands/pty.rs` | Medium — coordination service needs it |
| Add graceful kill (SIGTERM → 5s → SIGKILL) | `src-tauri/src/commands/pty.rs` | Medium — for edge cases |
| Add `agentId` to `TerminalSession` | `src/stores/terminalStore.ts` | Low — needed for Phase 2 |
| Wire `spawnPty` swarm wrapper | `src/tauri/pty.ts` | Low — needed for Phase 2 |

---

## 0.4 — `.gitignore` Preparation

The following patterns must be added to `.gitignore` to prevent swarm state from being committed:

```
# Quantum Swarm state
.quantum/worktrees/
.quantum/swarm-state.json
.quantum/timeline.jsonl
.quantum/agents/*/manifest.json
.quantum/.secrets.env
```

**Rationale:**
- `worktrees/` — large, ephemeral, per-machine
- `swarm-state.json` — contains runtime state, changes constantly
- `timeline.jsonl` — append-only log, not for VCS
- `manifest.json` — per-agent live status, constantly rewritten
- `.secrets.env` — API keys (security critical)

---

## Phase 0 Completion Checklist

- [x] **0.1.1** — Present open questions to user: All 4 questions answered (Q1-Q4 ✅)
- [x] **0.1.2** — Capture decisions in swarm config seed: Documented above
- [x] **0.2.1** — Audit `notify = "8"` compatibility: notify-debouncer-mini v0.7.0 uses notify ^8.2.0 ✅. Confirmed via crates.io API.
- [x] **0.2.2** — Verify `git2` crate: Deferred to future (not needed for v1)
- [x] **0.2.3** — Verify `keyring` crate: Deferred to v2 (file-based for v1)
- [x] **0.2.4** — Audit `tokio` features: Use `std::thread` pattern (consistent with existing codebase)
- [x] **0.3.1** — Read and understand `pty.rs`: Complete audit documented above
- [x] **0.3.2** — Read and understand `src/tauri/pty.ts`: Complete
- [x] **0.3.3** — Read and understand `src/stores/terminalStore.ts`: Complete
- [x] **0.4.1** — Add swarm exclusion patterns to `.gitignore`: Applied

**Ready for Phase 1 — Rust Backend Core** 🚀
