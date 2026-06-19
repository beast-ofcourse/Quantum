# Quantum Swarm — Implementation Tasks

> **Origin:** Derived from adversarial hyperplan review of `docs/swarm-design.md` (5 roles: skeptic, validator, researcher, architect, creative — 3 rounds of cross-critique). Conceded/weak findings filtered out. Only defensible insights survive.
>
> **Design reference:** [`docs/swarm-design.md`](./swarm-design.md) — full architecture, IPC protocol, state schema, and component tree.
>
> **Codebase state:** No swarm code exists. Existing infrastructure available: PTY system (`src-tauri/src/commands/pty.rs`), git commands (`src-tauri/src/commands/git.rs`), file watcher (`notify = "8"`), Zustand stores, panel registry.

---

## Adversarial Provenance

| Role | Survivors | Filtered |
|------|-----------|----------|
| **Skeptic** (simplicity) | 5 findings | 2 conceded |
| **Validator** (integration) | 5 findings | 1 conceded |
| **Researcher** (evidence) | 5 findings | 2 conceded/refined |
| **Architect** (structure) | 6 findings | 0 conceded |
| **Creative** (alternatives) | 6 findings | 3 conceded, 3 refined |
| **Total** | **27 findings** | **8 filtered** |

---

## Hard Constraints (Must Respect)

| # | Constraint | Source | Rationale |
|---|-----------|--------|-----------|
| H1 | **Git worktrees for isolation** — not shared-dir branches | Skeptic, Architect, Creative (conceded alternatives) | Branches in shared directory cause silent data loss. Worktrees proven in git docs. Non-negotiable. |
| H2 | **PTY env var injection** — `QUANTUM_*` + API keys must be injectable at spawn | Validator | Current `spawn_pty` doesn't accept env vars. Must extend before swarm can work. |
| H3 | **File-based IPC** — manifest.json + context.md, not sockets/DB | Skeptic (cost), Creative (alternatives conceded) | Simplest debuggable approach. Survives process crashes. No additional deps. |
| H4 | **Single state file** — `swarm-state.json` merges config + runtime | Architect | Avoids split-brain between config and state. Atomic writes guarantee consistency. |
| H5 | **Event naming follow existing conventions** — reconcile with `terminal:exit:<sessionId>` | Validator | Existing PTY emits `terminal:exit:<sessionId>`. Adding `pty:session-exit` duplicates patterns. Reuse/extend existing. |
| H6 | **Zustand + immer for frontend state** — not a different store library | Architect | Already used for all 14 stores. Adding another store lib is architectural debt. |
| H7 | **notify = "8"** — use existing version, not "6" as spec'd | Validator, Researcher | Cargo.toml already has notify = "8". Design doc written with stale version. Must use v8 + compatible debouncer. |
| H8 | **API key storage interface first, implementation second** — define get/set/delete API, implement with file initially | Skeptic (conceded keyring deferral) | Keyring dependency deferred to v2. Env file storage for v1. But the `invoke` commands must match the final interface so UI doesn't change later. |

---

## Decisions (Through Debate)

| # | Decision | Trail |
|---|----------|-------|
| D0 | **Launch agents: opencode + kilocode** — not all 5 | User confirmed. Config injection and auto-detection limited to these two. claude-code, codex, aider are future additions. |
| D1 | **Sequential execution for v1** — no DAG dependency graph | Skeptic: "DAG is premature." Architect: "Defers essential complexity." Refined: Ship sequential, DAG in Phase 5. |
| D2 | **Consolidate: mergeProcessor.ts + contextBuilder.ts into coordinationService.ts** | Skeptic: "24 files is too many." Architect agreed no clear boundary. Refined: 2 files → 1. |
| D3 | **Symlink CLAUDE.md, don't copy** | Researcher: "Copy-because-symlinks-might-break is speculative." Refined: symlink is simpler, add comment noting caveats. |
| D4 | **Use tokio::process::Command for git writes, git2 for reads** | Architect: "Proven pattern used by GitButler/Zed." Researcher confirmed existing git.rs already uses this pattern. |
| D5 | **CoordinationService in renderer (not Rust)** for v1 | Architect: "Render + Zustand is correct for UI-state coupling." Validator agreed no serialization overhead. Conceded Rust coordination is future. |
| D6 | **--no-ff merge strategy** | Creative proposed squash-and-rebase. Refined: --no-ff preserves audit trail per the design rationale. |
| D7 | **std::thread for FS watcher** (not Tauri async task) | Architect defended: documented Tauri pattern via `app.clone()`. Researcher confirmed no anti-pattern. |
| D8 | **CQRS pattern: commands for actions, events for notifications** | Architect found implicit pattern. Made explicit: invoke() for do-X, listen() for something-happened. |

---

## Risks & Mitigations

| # | Risk | Mitigation | Source |
|---|------|-----------|--------|
| R1 | Existing `spawn_pty` lacks env var injection — blocks all agent spawning | Extend `spawn_pty` to accept `env: HashMap<String,String>` before building swarm commands | Validator |
| R2 | notify-debouncer-mini may not support `notify = "8"` | Audit notify-debouncer-mini v0.4+ compatibility. Fallback: implement manual debounce channel (150ms timeout + coalesce). | Validator, Researcher |
| R3 | Platform divergence: FSEvents (macOS) coalesces at ~500ms, not 200ms | Accept 500ms on macOS. Document as known platform difference. UI shows "last seen" timestamps, not live-criticial. | Researcher |
| R4 | Heartbeat 30s/35s timings are untuned | Start with these values. Add a structured log event every time heartbeat fires. Re-evaluate after 2 weeks of dogfooding. | Researcher (conceded), Skeptic |
| R5 | CoordinationService coupled to Zustand synchronous API | Adapter interface deferred. Accept for v1 — if reliability issues emerge, extract StoreAdapter in v1.1. | Architect |
| R6 | Agent terminal tabs visually indistinguishable from user terminal tabs | Add agent icon + status dot badge to terminal tab component. (Validator: "User confusion is real UX risk.") | Validator |
| R7 | `.quantum/` directory conflicts with existing tooling (linters, formatters) | Add to `.gitignore` immediately. Also add to IDE's file watcher exclusion list if one exists. | Validator |

---

## Open Questions (User Input Gates)

| # | Question | Answer | Status | Context |
|---|----------|--------|--------|---------|
| Q1 | **Default agent + model configuration?** | `opencode` + `deepseek-v4-flash-free` | ✅ Answered | State schema default values: `defaultAgent: "opencode"`, `defaultModel: "deepseek-v4-flash-free"` |
| Q2 | **Which agents to support at launch?** | `opencode` + `kilocode` (2 of 5) | ✅ Answered | Config injection only for these two. Agent detection patterns limited to opencode + kilocode. |
| Q3 | **Sequential or parallel agent execution for v1?** | Sequential | ✅ Answered | Confirmed. Coordination service uses sequential queue. DAG deferred to Phase 5. |
| Q4 | **API key storage: env file path?** | `.quantum/.secrets.env` | ✅ Answered | File-based storage at `.quantum/.secrets.env` with 600 permissions on Unix. |

---

## Implementation Phases

---

### ✅ Phase 0 — Foundation & Dependency Audit (Days 1-2) [COMPLETED 2026-06-19]

**Goal:** Settle open questions, audit existing infrastructure for compatibility, prepare dependencies.

#### Subtasks

**0.1 — User configuration gate (Q1, Q2)**

- [x] **0.1.1 — Present open questions to user**: All 4 questions answered (Q1-Q4 ✅). See `docs/phase-0-audit.md`.
- [x] **0.1.2 — Capture decisions in a swarm config seed**: Documented seed config in `docs/phase-0-audit.md`.

**0.2 — Dependency audit**

- [x] **0.2.1 — Audit `notify = "8"` compatibility**: notify = "8" present in Cargo.toml. notify-debouncer-mini v0.7.0 depends on notify ^8.2.0 ✅. Confirmed via crates.io API.
- [x] **0.2.2 — Verify `git2` crate version compatibility**: git2 NOT used in codebase. All git via `std::process::Command`. Deferred indefinitely — existing pattern is sufficient.
- [x] **0.2.3 — Verify `keyring` crate compatibility**: Deferred to v2. v1 uses file-based `.quantum/.secrets.env` storage (Q4 decision).
- [x] **0.2.4 — Audit `tokio` features**: Tokio not explicit dependency. PTY uses `std::thread::spawn`. Plan: use `std::process::Command` + `std::thread` for v1, consistent with existing codebase.

**0.3 — Pre-existing PTY system audit**

- [x] **0.3.1 — Read and understand `src-tauri/src/commands/pty.rs`**: Full audit in `docs/phase-0-audit.md`. Key gaps: env var injection (BLOCKER), swarm exit event, graceful kill.
- [x] **0.3.2 — Read and understand `src/tauri/pty.ts`**: Documented. Need `swarm:agent-exit` listener addition.
- [x] **0.3.3 — Read and understand `src/stores/terminalStore.ts`**: Documented. Need `agentId` field on `TerminalSession`.

**0.4 — .gitignore preparation**

- [x] **0.4.1 — Add swarm exclusion patterns**: Applied to `.gitignore`.

**Success criteria:**
- [x] All open questions answered and documented
- [x] notify-debouncer-mini compatibility confirmed (or fallback plan written)
- [x] Full understanding of existing PTY system documented in subtask outputs
- [x] `.gitignore` updated

---

### Phase 1 — Rust Backend Core (Days 3-7)

**Goal:** All swarm Rust commands exist, compiled, unit-tested against a real temp git repo.

**Files to create:**
- `src-tauri/src/swarm/mod.rs`
- `src-tauri/src/swarm/commands.rs`
- `src-tauri/src/swarm/state.rs`
- `src-tauri/src/swarm/git.rs`
- `src-tauri/src/swarm/watcher.rs`
- `src-tauri/src/swarm/keyring.rs` (file-based for v1, keyring interface defined)

**Files to modify:**
- `src-tauri/Cargo.toml` (add notify-debouncer-mini)
- `src-tauri/src/lib.rs` (register commands, start watcher)
- `src-tauri/src/commands/pty.rs` (add env var injection to spawn_pty)

#### Subtasks

**1.1 — Extend existing PTY for env var injection**

- [x] **1.1.1 — Add `env` parameter to `spawn_pty`**: Added `Option<HashMap<String, String>>` param to both `spawn_pty` command and `spawn_pty_internal` function.
- [x] **1.1.2 — Merge env vars with process environment**: `CommandBuilder.env(key, value)` sets each var on top of existing process env.
- [x] **1.1.3 — Emit swarm-compatible exit event**: Both `reader_thread` and `reader_thread_internal` now emit `swarm:agent-exit` global event alongside per-session `terminal:exit:<sessionId>`.
- [ ] **1.1.4 — Test**: Spawn PTY with custom env var, verify subprocess sees the variable. (Requires integration test environment)

> **Handles risk R1.** Existing `spawn_pty` does not accept env vars — this is the first blocker.

**1.2 — Module scaffold + `SwarmError`**

- [x] **1.2.1 — Create `src-tauri/src/swarm/mod.rs`**: Module scaffold with 5 submodules + `SwarmError` enum.
- [x] **1.2.2 — Define `SwarmError`**: All 7 variants (Io, Json, Git, Keyring, WorktreeExists, AgentNotFound, StateParse).
- [x] **1.2.3 — Implement `Serialize` for `SwarmError`**: Serializes as string for Tauri IPC.
- [ ] **1.2.4 — Test**: `SwarmError` display and serialization round-trip.

> **Handles architect finding A2** — SwarmManager struct defined in `state.rs`.

**1.3 — State types: `state.rs`**

- [x] **1.3.1 — Define `SwarmState` struct**: Full schema with version, swarmId, name, createdAt, phase, config, agents, tasks, fileLocks, mergeQueue.
- [x] **1.3.2 — Define `AgentInfo` struct**: All fields including AgentType/AgentStatus enums.
- [x] **1.3.3 — Define `Task`, `FileLock`, `MergeQueueItem`**: Matching design spec.
- [x] **1.3.4 — Define `SwarmConfig`**: Defaults matching Phase 0 decisions: opencode + deepseek-v4-flash-free.
- [x] **1.3.5 — Implement `serde::Serialize`/`Deserialize`**: All state types derive both traits.
- [x] **1.3.6 — Define `SwarmManager` struct**: Arc<RwLock<SwarmState>> + project_root.
- [ ] **1.3.7 — Implement validation**: Version check, required fields.
- [ ] **1.3.8 — Test**: JSON round-trip, validation failure cases.

> **Handles H4** (single state file), **H8** (keyring interface defined for swap later).

**1.4 — Keyring module: `keyring.rs`**

- [x] **1.4.1 — Define API key operations**: `get_api_key`, `set_api_key`, `delete_api_key` — all return `Result<_, SwarmError>`.
- [x] **1.4.2 — Implement file-based storage (v1)**: `.quantum/.secrets.env` with 600 perms on Unix.
- [x] **1.4.3 — Keyring-rs stub**: Doc-comment noting v2 target. Interface ready for swap.
- [x] **1.4.4 — Provider → env-var mapping**: DeepSeek, OpenAI, Anthropic, OpenRouter mapped.
- [x] **1.4.5 — Test**: set/get/delete round-trip with tempdir. Provider env var mapping tests.

> **Handles H8** (interface defined, file-based for v1), **Skeptic's keyring deferral**.

**1.5 — Git operations: `git.rs`**

- [x] **1.5.1 — Implement `git()` helper**: Using `std::process::Command` (tokio not needed for v1).
- [x] **1.5.2 — Implement `create_worktree()`**: `git worktree add` with stale directory rename handling.
- [x] **1.5.3 — Implement `check_merge_conflicts()`**: `git merge-tree --write-tree` with CONFLICT line parsing.
- [x] **1.5.4 — Implement `merge_agent_branch()`**: `git merge --no-ff` + `worktree remove` + `branch -d`.
- [x] **1.5.5 — Implement `is_pid_alive()`**: Unix: `kill(pid, 0)`, Windows: `tasklist` filter.
- [x] **1.5.6 — Implement `ensure_initial_commit()`**: Creates initial commit if repo is empty.
- [x] **1.5.7 — Implement `symlink_config_files()`**: Symlinks AGENTS.md + CLAUDE.md into worktree (Decision D3).
- [x] **1.5.8 — Test**: Sync tests with tempdir + git init (not async — `git()` is sync).

> **Handles H1** (worktree isolation), **D3** (symlink over copy), **D4** (tokio::process + git2 pattern).

**1.6 — File watcher: `watcher.rs`**

- [x] **1.6.1 — Implement `start_swarm_watcher()`**: Spawns `std::thread`, uses `notify-debouncer-mini 0.7` with 150ms debounce, watches `.quantum/agents/` recursively.
- [x] **1.6.2 — Implement `handle_fs_event()`**: Filters for `manifest.json`, extracts agent-id from path, parses manifest, emits `swarm:manifest-changed`.
- [x] **1.6.3 — Handle parse errors**: Emits `swarm:manifest-parse-error` with agent-id. Never panics on bad JSON.
- [x] **1.6.4 — Handle stale reads**: Skips failed reads, waits for next debounce cycle.
- [x] **1.6.5 — Platform-aware acceptance**: Documented timing expectations. (Risk R3.)
- [ ] **1.6.6 — Test**: Integration test: write manifest.json → verify event fires. Write invalid JSON → error event fires.

> **Handles R3** (platform-specific timing), **D7** (std::thread is valid Tauri pattern), **R2** (notify-debouncer-mini v0.7 confirmed compatible).

**1.7 — Tauri commands: `commands.rs`**

- [x] **1.7.1 — Implement `init_swarm`**: Creates `.quantum/` dir structure, writes initial `swarm-state.json`, starts FS watcher.
- [x] **1.7.2 — Implement `add_agent`**: Creates worktree, registers agent in state, writes initial `context.md`.
- [x] **1.7.3 — Implement `spawn_agent_pty`**: Reads API keys from keyring, builds `QUANTUM_*` env vars + provider keys, calls `spawn_pty_internal`.
- [x] **1.7.4 — Implement `kill_agent`**: Marks agent as failed, releases file locks.
- [x] **1.7.5 — Implement `get_swarm_state`**: Reads and deserializes `swarm-state.json`.
- [x] **1.7.6 — Implement `check_merge`** and **`merge_agent`**: Wired to git.rs, updates state after merge.
- [x] **1.7.7 — Implement `set/get/delete_api_key`**: Wired to keyring.rs.
- [x] **1.7.8 — Implement `reconcile_swarm`**: Checks PIDs, revives/purges agents, re-attaches watcher, re-processes merge queue.
- [x] **1.7.9 — Implement `update_swarm_config`**: Writes config section to `swarm-state.json`.
- [x] **1.7.10 — Implement `write_agent_context`**: Writes `context.md` for coordination service.

> **Handles R1** (spawn_agent_pty injects env vars), **H2** (PTY env injection).

**1.8 — Register in `lib.rs`**

- [x] **1.8.1 — Register `mod swarm`** at crate root.
- [x] **1.8.2 — Register all 12 swarm commands** in `generate_handler![]`.
- [x] **1.8.3 — Start FS watcher** on `init_swarm` and `reconcile_swarm`.
- [x] **1.8.4 — Run reconciliation** on startup if `swarm-state.json` exists.

**1.9 — Integration tests**

- [ ] **1.9.1 — Worktree lifecycle test**: Create agent → worktree exists → agent completes → merge → worktree removed.
- [ ] **1.9.2 — Conflict detection test**: Create two agents modifying same file → merge-tree detects conflict.
- [ ] **1.9.3 — Atomic write test**: Write state → crash mid-write (simulated) → state file is not corrupted.
- [ ] **1.9.4 — Reconciliation test**: Start agent → kill process externally → reconcile marks agent dead.

**Success criteria:**
- [ ] All commands compile and register without Tauri plugin conflicts
- [ ] `spawn_agent_pty` injects env vars verified by subprocess test
- [ ] Worktree create → merge → remove cycle passes with temp git repo
- [ ] Conflict detection works with conflicting and non-conflicting branches
- [ ] FS watcher fires `swarm:manifest-changed` within platform-appropriate timing
- [ ] API key get/set/delete round-trips correctly
- [ ] Reconciliation correctly identifies alive vs dead agent PIDs
- [ ] All Rust unit tests pass (`cargo test`)

---

### Phase 2 — Types, Store & Events (Days 8-11)

**Goal:** Frontend receives and processes all Rust events correctly. Store schema is battle-tested.

**Files to create:**
- `src/types/swarm.ts`
- `src/stores/swarmStore.ts`
- `src/tauri/swarm.ts`
- `src/lib/swarm/coordinationService.ts` (consolidated: includes merge process + context building)

**Files to modify:**
- `src/stores/terminalStore.ts` (agentId → sessionId mapping)
- `src/tauri/pty.ts` (swarm event listeners)

**Dependency:** Phase 1 complete (Rust backend with all commands).

#### Subtasks

**2.1 — Type definitions: `src/types/swarm.ts`**

- [ ] **2.1.1 — Define types that mirror Rust state structs**: `SwarmState`, `AgentInfo`, `Task`, `FileLock`, `MergeQueueItem`, `SwarmConfig`, `AgentType`, `AgentStatus`, `SwarmPhase`.
- [ ] **2.1.2 — Define IPC event payload types**: `ManifestChangedPayload`, `PtyExitPayload` (swarm-specific), `ReconciliationReport`.
- [ ] **2.1.3 — Define `TaskSpec` type**: For creating new tasks from the UI.
- [ ] **2.1.4 — Export all types** as a clean module interface.

**2.2 — Zustand store: `src/stores/swarmStore.ts`**

- [ ] **2.2.1 — Create store with `immer` middleware**: Define all actions from design Section 10.1.
- [ ] **2.2.2 — Implement `setState`**: Replace entire state (used on initial load and full refresh).
- [ ] **2.2.3 — Implement `updateAgentManifest`**: Update nested agent.manifest + auto-update fileLocks from `filesModified`. (Tests: nested state correctness, file lock auto-creation.)
- [ ] **2.2.4 — Implement `updateAgentStatus`**: Update agent.status in immer.
- [ ] **2.2.5 — Implement `markManifestError`**: Set `_parseError` flag without clearing other manifest fields.
- [ ] **2.2.6 — Implement `appendTimelineEvent`**: Add event to in-memory timeline array.
- [ ] **2.2.7 — Implement `updateMergeQueueItem`**: Update status of a merge queue entry.

> **Handles H6** (Zustand + immer), **D8** (CQRS: store is the event-sourced read model).

**2.3 — Tauri event bridge: `src/tauri/swarm.ts`**

- [ ] **2.3.1 — Implement `startSwarmEventListeners`**: Called on app init with `projectRoot`.
- [ ] **2.3.2 — Load initial state**: `invoke("get_swarm_state")` → `store.setState()`.
- [ ] **2.3.3 — Listen for `swarm:manifest-changed`**: Update store via `updateAgentManifest`.
- [ ] **2.3.4 — Listen for `swarm:manifest-parse-error`**: Call `markManifestError`.
- [ ] **2.3.5 — Listen for `terminal:exit:<sessionId>`**: Translate to agent status update. Design decision: REUSE existing `terminal:exit:*` pattern (H5) rather than inventing new `pty:session-exit`.
- [ ] **2.3.6 — Listen for `swarm:agent-exit`**: Dedicated swarm event (added in 1.1.3) for clean architecture separation.

**2.4 — Coordination service: `src/lib/swarm/coordinationService.ts`**

- [ ] **2.4.1 — Implement `onAgentExit`**: Check merge queue, verify DAG deps resolved (if using DAG), trigger merge.
- [ ] **2.4.2 — Implement `processMerge`**: Invoke `check_merge` → if conflict, set phase to 'conflict' and emit conflict event. If clean, invoke `merge_agent`, mark task completed.
- [ ] **2.4.3 — Implement `unblockDependents`**: For sequential v1: simply spawn next pending agent. For DAG (future): traverse dependsOn graph.
- [ ] **2.4.4 — Implement `refreshContext`**: Build context.md content (string interpolation) → invoke `write_agent_context`.
- [ ] **2.4.5 — Implement `onStateChange`**: Called by event listeners — if a running agent's dependencies/new locks changed, refresh context.
- [ ] **2.4.6 — Implement heartbeat check**: `setInterval(30_000)`. Check `heartbeatAt > 35s` for running agents. If stale: write context once. If PID dead: mark dead.
- [ ] **2.4.7 — Implement `buildContextMd`** (consolidated from contextBuilder.ts — Decision D2): Build context.md from state for a given agent. Template per design Section 3.2.

> **Handles D2** (consolidated coordination service), **D5** (renderer coordination), **R4** (heartbeat monitoring note).

**2.5 — Terminal store integration**

- [ ] **2.5.1 — Add `agentId` tracking to terminalStore**: Map `sessionId → agentId` so PTY exit events can be routed to the correct agent.
- [ ] **2.5.2 — Wire agent terminal sessions**: When `spawn_agent_pty` returns a sessionId, store the mapping.
- [ ] **2.5.3 — Handle visual badge**: Add agent type icon + status dot to terminal tab data.

**2.6 — Unit tests**

- [ ] **2.6.1 — swarmStore tests**: Nested immer mutations, file lock auto-update, unknown status handling, `_parseError` isolation.
- [ ] **2.6.2 — coordinationService tests**: Mocked invoke, test `onAgentExit` triggers merge, `unblockDependents` spawns correct agents.

**Success criteria:**
- [ ] `swarmStore` correctly updates on all event types
- [ ] `immer` mutations produce correct nested state (verified by tests)
- [ ] PTY exit events update correct agent status
- [ ] Coordination service triggers merge flow after agent exit
- [ ] Context.md is rebuilt on relevant state changes (not timer)
- [ ] Heartbeat safety write triggers after 35s of stale heartbeat
- [ ] All TypeScript tests pass (`vitest run`)

---

### Phase 3 — UI Components (Days 12-17)

**Goal:** User can create, monitor, and control a swarm through the IDE. Full visual feedback loop.

**Files to create:**
- `src/components/swarm/SwarmPanel.tsx`
- `src/components/swarm/TaskBoard.tsx`
- `src/components/swarm/AgentCard.tsx`
- `src/components/swarm/AgentGrid.tsx`
- `src/components/swarm/ActivityLog.tsx`
- `src/components/swarm/FileLocksPanel.tsx`
- `src/components/swarm/ConflictResolver.tsx`
- `src/components/swarm/SwarmSettingsDialog.tsx`
- `src/components/swarm/NewTaskDialog.tsx`

**Files to modify:**
- `src/lib/panelRegistry.tsx` (register SwarmPanel)
- `src/components/explorer/FileTree.tsx` (lock badges)

**Dependency:** Phase 2 complete (store receives events, coordination service works).

#### Subtasks

**3.1 — Core swarm panel shell**

- [ ] **3.1.1 — Create `SwarmPanel.tsx`**: Main panel component with responsive layout (header + body split).
- [ ] **3.1.2 — Implement empty state**: "No swarm active" with "Create Swarm" and "Create Task" buttons.
- [ ] **3.1.3 — Implement planning state**: Task creation flow — agent type selector, model selector, task description input.
- [ ] **3.1.4 — Implement execution state**: Show AgentGrid, TaskBoard, ActivityLog, FileLocksPanel (design Section 12.3 state table).
- [ ] **3.1.5 — Implement conflict state**: Show ConflictResolver modal.
- [ ] **3.1.6 — Implement done state**: Summary: tasks completed, merge history, timeline.
- [ ] **3.1.7 — Register in `panelRegistry.tsx`**: So SwarmPanel appears in the IDE panel system.

**3.2 — Agent visualization**

- [ ] **3.2.1 — Create `AgentCard.tsx`**: Per-agent card showing:
  - Agent type icon + model label
  - Status dot (color-coded: green=running, yellow=waiting, red=failed, blue=merging, gray=done)
  - `currentThought` from latest manifest (auto-scrolling, truncated at 2 lines)
  - `filesModified` list (truncated, expandable)
  - Action buttons: "View Terminal" (focus PTY tab), "Kill" (only when running)
  - "Merging" spinner when status = merging
- [ ] **3.2.2 — Implement agent-scoped selector**: `useSwarmStore((s) => s.state?.agents[agentId], shallow)` — prevents re-render on other agents' changes.
- [ ] **3.2.3 — Create `AgentGrid.tsx`**: Grid/flex layout of AgentCards. Responsive: single column on narrow panels, multi-column when space permits.
- [ ] **3.2.4 — Handle merge-in-progress**: Agent card shows progress indicator when status transitions to "merging".

**3.3 — Task board**

- [ ] **3.3.1 — Create `TaskBoard.tsx`**: Three-column layout (Pending | Running | Done).
- [ ] **3.3.2 — Implement task cards**: Each shows description, assigned agent badge, status, dependency indicators.
- [ ] **3.3.3 — Implement DAG edges** (optional for v1): SVG lines between task cards showing dependency arrows. Can be deferred if sequential-only.
- [ ] **3.3.4 — Implement task creation dialog**: `NewTaskDialog.tsx` — form with description, agent type selector, model selector, dependency picker (if DAG enabled).

**3.4 — Activity + file locks**

- [ ] **3.4.1 — Create `ActivityLog.tsx`**: Render `timeline.jsonl` events as a scrollable list. Timestamp + event type + agent + detail.
- [ ] **3.4.2 — Create `FileLocksPanel.tsx`**: Table: File → Locked By → Since. Update in real-time as manifest updates arrive.
- [ ] **3.4.3 — Implement lock badges in FileTree**: Read `useSwarmStore` for file locks, apply `data-lock-agent` attribute to locked files in `FileTree.tsx`. CSS: small badge showing agent-id.

**3.5 — Conflict resolver**

- [ ] **3.5.1 — Create `ConflictResolver.tsx`**: Blocking modal when `state.phase === "conflict"`.
- [ ] **3.5.2 — Integrate Monaco diff editor**: Show conflicting files side-by-side or unified diff.
- [ ] **3.5.3 — Implement resolution actions**: Accept theirs, accept ours, or manually edit + confirm.
- [ ] **3.5.4 — Wire to coordination service**: On confirm, invoke `merge_agent` with resolved content.

**3.6 — Settings dialog**

- [ ] **3.6.1 — Create `SwarmSettingsDialog.tsx`**:
  - Default agent / default model selectors
  - Provider API key inputs (one per provider, masked, with save/delete buttons)
  - Agent auto-detection toggle (enable/disable heuristic detection)
  - "Test Connection" button per provider
- [ ] **3.6.2 — Wire API key UI**: save → `invoke("set_api_key")`, load → `invoke("get_api_key")`, delete → `invoke("delete_api_key")`.
- [ ] **3.6.3 — Wire config save**: `invoke("update_swarm_config")`.

**3.7 — Terminal tab integration (Risk R6)**

- [ ] **3.7.1 — Add visual agent badge to terminal tabs**: Small icon + status dot next to the terminal title.
- [ ] **3.7.2 — Distinguish agent terminals from user terminals**: Background tint or icon overlay. Not obtrusive but clearly different.
- [ ] **3.7.3 — "View Terminal" button on AgentCard**: Focuses the agent's PTY tab via terminalStore.

**Success criteria:**
- [ ] SwarmPanel renders all states correctly (empty, planning, executing, conflict, done)
- [ ] AgentCard shows real-time updates from manifest.json via store
- [ ] Clicking "View Terminal" focuses the correct terminal tab
- [ ] Kill button sends SIGTERM → SIGKILL and updates UI
- [ ] ConflictResolver shows Monaco diff for conflicting files
- [ ] FileTree shows lock badges for locked files
- [ ] API key save/load/delete works through settings dialog
- [ ] Agent terminal tabs are visually distinguishable from user terminals
- [ ] All UI states tested manually per design Section 12.3 table

---

### Phase 4 — Recovery & Edge Cases (Days 18-21)

**Goal:** The swarm is resilient to crashes, corrupted state, and all documented edge cases.

**Files to modify:**
- `src-tauri/src/swarm/commands.rs` (reconcile_swarm hardening)
- `src/lib/swarm/coordinationService.ts` (heartbeat, recovery path, edge case handling)
- `src/tauri/swarm.ts` (startup reconciliation integration)

**Dependency:** Phase 3 complete (UI shows swarm; now make it survive real-world conditions).

#### Subtasks

**4.1 — Startup reconciliation**

- [ ] **4.1.1 — Harden `reconcile_swarm` command**: For each agent, check PID + worktree existence. Mark dead/release locks as needed.
- [ ] **4.1.2 — Integrate reconciliation in app init**: In `src/tauri/swarm.ts` → `startSwarmEventListeners`, call `reconcile_swarm` after loading initial state.
- [ ] **4.1.3 — Handle partial state**: If swarm-state.json exists but some agents are missing from the file, rebuild from worktree directory listing.
- [ ] **4.1.4 — Handle orphan worktrees**: Worktrees on disk not in state → offer to import as dead agents or clean up.

> **Handles design Section 13.1 recovery.**

**4.2 — Heartbeat + crash detection**

- [ ] **4.2.1 — Implement PID health check in heartbeat**: For each running agent, every 30s, if `heartbeatAt > 35s` ago, call `invoke("is_pid_alive")`.
- [ ] **4.2.2 — Handle agent process death**: If PID dead → mark agent "dead", release file locks, emit timeline event, cancel dependent tasks.
- [ ] **4.2.3 — Handle stale heartbeat with live PID**: Write context.md once (safety catch for missed FS events).
- [ ] **4.2.4 — Heartbeat monitoring**: Log structured event every time heartbeat fires to `timeline.jsonl` for post-hoc analysis.

> **Handles R4** (monitoring for tuning), **design Section 13.2 heartbeat.**

**4.3 — State corruption recovery**

- [ ] **4.3.1 — Handle `swarm-state.json` parse failure**: Show error dialog with raw JSON content. Offer two choices: "Reset state" (lose tracking, keep agent branches) or "Restore from timeline.jsonl" (replay events to reconstruct state).
- [ ] **4.3.2 — Verify atomic write integrity**: Test that mid-write crash (simulated) leaves either old file or new file, never corrupt partial file.
- [ ] **4.3.3 — Handle `.quantum/` deletion at runtime**: Coordination service gets FS error → recreate directory structure (empty state, agents continue in worktrees unaffected).

> **Handles design Section 13.3 crash scenarios (IDE crash, state corruption, deleted .quantum/).**

**4.4 — Merge resilience**

- [ ] **4.4.1 — Handle merge interruption (IDE crash during merge)**: On reconciliation, check merge queue. For items with status "merging": re-run `check_merge`. If conflict → surface. If clean → re-run merge.
- [ ] **4.4.2 — Handle worktree-already-exists**: Before `create_worktree`, check if path exists. If it's a valid worktree: error with details. If it's stale: rename to `.bak.<timestamp>` and proceed.
- [ ] **4.4.3 — Handle git-not-found**: Catch `NotFound` error from `tokio::process::Command`, surface user-readable error: "Git not found. Install Git and restart."
- [ ] **4.4.4 — Handle agent-ignores-exit instruction**: "Kill" button → SIGTERM → 5s wait → SIGKILL → mark failed, release locks.

> **Handles design Section 14 edge cases table items 7-9 (worktree exists, git missing, agent won't exit).**

**4.5 — Dual-agent conflict handling**

- [ ] **4.5.1 — Handle two agents modifying same file**: Worktree isolation prevents OS-level collision. At merge time, `git merge-tree` detects conflict. Set phase to "conflict", show ConflictResolver.
- [ ] **4.5.2 — Handle agent starting before dependency finishes**: Task dispatcher checks DAG (or sequential queue). PTY not spawned until deps merged.
- [ ] **4.5.3 — Handle agent creating new files**: Git tracks new files in the worktree index. Merged in on `git merge --no-ff`. No registration needed.
- [ ] **4.5.4 — Handle agent deleting files**: Git tracks deletes. Merge handles. If dependent task needed those files → merge conflict surfaces.
- [ ] **4.5.5 — Handle agent running `git checkout`**: Worktree confinement prevents impact on other worktrees or main. Agent's own branch pointer may move; merge may fail. Recoverable user error.

> **Handles design Section 14 edge cases items 1-6.**

**4.6 — Manifest and keyring edge cases**

- [ ] **4.6.1 — Handle malformed `manifest.json`**: JSON parse error → log to activity log, set `_parseError: true` in store, show stale indicator in UI. Agent completion still detected via PTY exit.
- [ ] **4.6.2 — Handle unknown manifest status value**: Validation coerces unknown statuses to `"running"`. Never crash the store.
- [ ] **4.6.3 — Handle keyring unavailable**: When file-based storage is used (v1): verify `.quantum/.secrets.env` permissions. If unreadable, tell user to set API keys via UI.
- [ ] **4.6.4 — Handle agent that never writes manifest**: Harmless. PTY exit event signals completion. Agent marked "done" on exit regardless of manifest.

> **Handles design Section 14 items 10-13.**

**4.7 — Manual QA pass**

- [ ] **4.7.1 — Execute QA checklist** from design Section 17.3:
  - [ ] Setup: Git >= 2.5, at least one API key configured
  - [ ] Core coordination: 3-task swarm, worktrees created, env vars injected, manifest updates UI within 200ms(linux)/500ms(macos)
  - [ ] Kill agent → status "failed", locks released
  - [ ] Agent exits cleanly → merge queue runs
  - [ ] Conflict handling: 2 agents editing same file → ConflictResolver appears
  - [ ] Recovery: Force-kill IDE → reopen → reconcile detects alive agents
  - [ ] All 14 edge cases in design Section 14 manually verified

**Success criteria:**
- [ ] IDE restart with running agents → reconcile detects and re-attaches watcher
- [ ] Agent process crash detected within 35s
- [ ] Stale locks released after agent death
- [ ] Corrupted `swarm-state.json` shows error dialog, does not crash
- [ ] `.quantum/` deleted at runtime → recreated on next state write
- [ ] Merge interrupted → re-attempted on restart
- [ ] Worktree already exists → graceful rename
- [ ] Git not in PATH → user-readable error
- [ ] All 14 edge cases in design Section 14 manually verified

---

### Phase 5 — DAG Dependency Orchestration (Post-v1 Enhancement)

**Goal:** Replace sequential execution with full DAG-based task scheduling. Parallel agent execution when dependencies allow.

**Source:** Skeptic's DAG simplification was accepted for v1. This phase re-introduces it with hardened design based on all adversarial feedback.

**When to start:** Only after all Phase 4 edge cases are verified in production-like usage.

**Key changes:**
- Coordination service: replace `sequentialQueue` with `DagEngine` — evaluates dependency graph after each merge
- SwarmState.tasks: `dependsOn` array is actively used (currently ignored)
- Task status: add `"blocked"` status for tasks whose deps are not yet met
- UI: TaskBoard shows real DAG edges, dependency chains visible
- New file: `src/lib/swarm/dagEngine.ts` — pure function: `(tasks, completedTaskId) => nextTasks[]`

---

## Summary

| Phase | Timeline | New Files | Modified Files | Key Risks |
|-------|----------|-----------|----------------|-----------|
| **0 — Foundation** | Days 1-2 | 0 | 1 (`.gitignore`) | User input gates |
| **1 — Rust Backend** | Days 3-7 | 6 | 3 (Cargo.toml, lib.rs, pty.rs) | Env injection, debouncer compat |
| **2 — Types/Store/Events** | Days 8-11 | 4 | 2 (terminalStore, pty.ts) | Zustand + immer correctness |
| **3 — UI Components** | Days 12-17 | 9 | 2 (panelRegistry, FileTree) | Real-time update latency |
| **4 — Recovery/Edge Cases** | Days 18-21 | 0 | 3 (commands.rs, coordination, swarm.ts) | State corruption, process death |
| **5 — DAG (post-v1)** | Future | 1 | 3 | DAG correctness under concurrent failure |

**Total v1:** ~19 new files, ~1,500 LOC, 8 modified files. ~21 days implementation.

---

## File Manifest (v1)

### New Files (19)

```
src-tauri/src/swarm/mod.rs          ~40 LOC   Module scaffold + SwarmError
src-tauri/src/swarm/commands.rs     ~200 LOC  All #[tauri::command] functions
src-tauri/src/swarm/state.rs        ~120 LOC  SwarmState + SwarmManager + validation
src-tauri/src/swarm/git.rs          ~120 LOC  Worktree create/merge/remove + conflict check
src-tauri/src/swarm/watcher.rs      ~70 LOC   Notify debouncer + manifest parser
src-tauri/src/swarm/keyring.rs      ~40 LOC   File-based key storage (keyring interface)

src/types/swarm.ts                  ~150 LOC  TypeScript mirror of Rust types + event payloads
src/stores/swarmStore.ts            ~150 LOC  Zustand + immer — all state mutations
src/tauri/swarm.ts                  ~60 LOC   Tauri event listeners + bridge initialization
src/lib/swarm/coordinationService.ts ~280 LOC  Merge processor, heartbeat, context builder (consolidated)

src/components/swarm/SwarmPanel.tsx         ~120 LOC
src/components/swarm/TaskBoard.tsx          ~120 LOC
src/components/swarm/AgentCard.tsx          ~100 LOC
src/components/swarm/AgentGrid.tsx          ~80 LOC
src/components/swarm/ActivityLog.tsx        ~80 LOC
src/components/swarm/FileLocksPanel.tsx     ~60 LOC
src/components/swarm/ConflictResolver.tsx   ~120 LOC
src/components/swarm/SwarmSettingsDialog.tsx ~80 LOC
src/components/swarm/NewTaskDialog.tsx      ~80 LOC
```

### Modified Files (8)

```
src-tauri/Cargo.toml                  +2 lines  (notify-debouncer-mini)
src-tauri/src/lib.rs                  +15 lines (register commands, watcher, reconciliation)
src-tauri/src/commands/pty.rs         +20 lines (env var injection, swarm-exit event)
src/tauri/pty.ts                      +8 lines  (swarm:agent-exit listener)
src/stores/terminalStore.ts           +8 lines  (agentId → sessionId mapping)
src/lib/panelRegistry.tsx             +5 lines  (register SwarmPanel)
src/components/explorer/FileTree.tsx  +20 lines (lock badges)
.gitignore                            +4 lines  (swarm exclusions)
```

---

*Plan derived from hyperplan adversarial review (5 roles, 3 rounds) of `docs/swarm-design.md` and formalized based on current codebase state. Open questions (Q1-Q4) need user input before Phase 0 completes.*
