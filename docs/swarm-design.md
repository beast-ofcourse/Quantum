# Quantum Swarm — Refactored Architecture

> **Core goal:** Coordinate multiple AI coding agents (OpenCode, KiloCode, Claude Code, Codex, Aider) running as unmodified CLI tools inside a Tauri IDE, with Git-based isolation, file-based IPC, and real-time status visibility.

---

## Table of Contents

2. [Architecture](#2-architecture)
3. [File Layout](#3-file-layout)
4. [Core Principle: Git Worktrees (not branches)](#4-core-principle-git-worktrees-not-branches)
5. [Agent Protocol](#5-agent-protocol)
6. [Agent Auto-Detection](#6-agent-auto-detection)
7. [Agent & Model Selection](#7-agent--model-selection)
8. [Config Injection](#8-config-injection)
9. [Rust Backend](#9-rust-backend)
10. [TypeScript Store](#10-typescript-store)
11. [Coordination Service](#11-coordination-service)
12. [UI Components](#12-ui-components)
13. [Recovery & Reliability](#13-recovery--reliability)
14. [Edge Cases](#14-edge-cases)
15. [Implementation Phases](#15-implementation-phases)
16. [Files to Create or Modify](#16-files-to-create-or-modify)
17. [Testing Strategy](#17-testing-strategy)
18. [Key Design Decisions](#18-key-design-decisions)

---



## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Quantum IDE                                    │
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────────┐   │
│  │ Swarm Panel  │──►│ swarmStore   │──►│ Rust Backend               │   │
│  │ (React/TS)   │   │ (Zustand +   │   │                            │   │
│  │              │   │  immer)      │   │  SwarmManager (tokio task) │   │
│  └──────────────┘   └──────┬───────┘   │  ├─ git (tokio::process)  │   │
│                            │           │  ├─ git2 (read-only query) │   │
│                  Tauri events           │  ├─ notify-rs watcher     │   │
│                  (IPC bridge)          │  ├─ keyring (API keys)     │   │
│                            │           │  └─ atomic_write           │   │
│                            │           └─────────────┬──────────────┘   │
│                            └─────────────────────────┘                  │
│                                                                          │
│  File System (Project Root)                                              │
│  .quantum/                                                               │
│  ├── swarm-state.json       IDE-only. Atomic writes. Never agent.        │
│  ├── timeline.jsonl         Append-only newline-delimited JSON log       │
│  ├── agents/                                                             │
│  │   ├── .config/           Agent instruction files (auto-generated)    │
│  │   │   ├── AGENTS.md                                                  │
│  │   │   ├── CLAUDE.md                                                  │
│  │   │   └── opencode.md                                                │
│  │   └── <agent-id>/                                                    │
│  │       ├── context.md     IDE → Agent (event-driven writes)           │
│  │       └── manifest.json  Agent → IDE (FS-watched)                    │
│  └── worktrees/             Git worktrees (one per agent)               │
│      ├── agent-1/           → git worktree add, branch swarm/agent-1    │
│      └── agent-2/           → git worktree add, branch swarm/agent-2    │
│                                                                          │
│  Agent Processes (each in own PTY, own worktree, own branch)            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │OpenCode  │  │KiloCode  │  │ClaudeCode│  │  Codex   │               │
│  │ worktree │  │ worktree │  │ worktree │  │ worktree │               │
│  │ agent-1/ │  │ agent-2/ │  │ agent-3/ │  │ agent-4/ │               │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Flow

```
1. User configures API keys once → stored in OS keychain via keyring-rs
2. User creates swarm (or opens terminals manually)
3. For each task/agent:
   a. Rust: git worktree add .quantum/worktrees/agent-<id> -b swarm/agent-<id>
   b. Rust: write context.md to .quantum/agents/agent-<id>/context.md
   c. Rust: spawn PTY with CWD = .quantum/worktrees/agent-<id>/
              inject QUANTUM_* env vars + provider API keys from keyring
   d. PTY tab opens in IDE terminal area
4. Agent starts, reads context.md, works in its worktree (full project files, isolated)
5. Agent writes manifest.json → notify-rs detects → Tauri event → swarmStore update → UI
6. Agent exits (PTY EOF) → worktree branch enters merge queue
7. Merge processor: git -C .quantum/worktrees/agent-<id> merge-tree --write-tree main HEAD
   → no conflicts: git merge --no-ff into main; prune worktree
   → conflicts: pause swarm, show Monaco diff; user resolves
8. After merge: unblock dependent tasks, spawn next agents
```

---

## 3. File Layout

```
.quantum/
├── swarm-state.json          Atomic. IDE-only. Never agent-written.
├── timeline.jsonl            Append-only. One JSON object per line.
├── agents/
│   ├── .config/
│   │   ├── AGENTS.md        Universal agent instructions
│   │   ├── CLAUDE.md        Claude Code specific (maps to project CLAUDE.md)
│   │   ├── opencode.md      OpenCode config
│   │   ├── kilocode.md      KiloCode config
│   │   └── aider.md         Aider config
│   └── <agent-id>/
│       ├── context.md       IDE → Agent (written on state change events)
│       └── manifest.json    Agent → IDE (watched by notify-rs)
└── worktrees/
    ├── agent-1/             Full project checkout on branch swarm/agent-1
    ├── agent-2/             Full project checkout on branch swarm/agent-2
    └── ...
```

Add to `.gitignore`:
```
.quantum/worktrees/
.quantum/swarm-state.json
.quantum/timeline.jsonl
.quantum/agents/*/manifest.json
```

### 3.1 `swarm-state.json`

```jsonc
{
  "version": 3,
  "swarmId": "swarm_2xkt9m4j",
  "name": "Auth System Refactor",
  "createdAt": "2026-06-19T16:00:00.000Z",
  "phase": "executing",
  // "planning" | "executing" | "merging" | "conflict" | "done"

  "config": {
    "defaultAgent": "opencode",
    "defaultModel": "deepseek-v4-flash",
    "quickPresets": [
      { "agent": "opencode",  "model": "deepseek-v4-flash",      "label": "OpenCode · DeepSeek V4 Flash"      },
      { "agent": "kilocode", "model": "deepseek-v4-flash-free", "label": "KiloCode · DeepSeek V4 Flash Free" }
    ],
    "modelOptions": {
      "opencode":    ["deepseek-v4-flash", "deepseek-v4-flash-free", "gpt-4o", "claude-sonnet-4"],
      "kilocode":   ["deepseek-v4-flash-free", "deepseek-v4-flash"],
      "claude-code": ["claude-sonnet-4", "claude-haiku-4"],
      "codex":       ["gpt-4o", "gpt-4o-mini"],
      "aider":       ["deepseek-v4-flash", "gpt-4o"]
    }
  },

  "agents": {
    "agent-1": {
      "id": "agent-1",
      "type": "opencode",
      "model": "deepseek-v4-flash",
      "taskId": "task-1",
      "status": "running",
      // "idle" | "running" | "waiting" | "merging" | "done" | "failed" | "dead"
      "pid": 12345,
      "sessionId": "term_abc",
      "worktreePath": ".quantum/worktrees/agent-1",
      "branch": "swarm/agent-1",
      "dependsOn": [],
      "heartbeatAt": "2026-06-19T16:05:00.000Z",
      "exitCode": null,
      "manifest": {
        // Last successfully parsed manifest.json content, cached here
        "status": "running",
        "currentThought": "Refactoring verifyToken()",
        "filesModified": ["src/auth.ts"],
        "error": null,
        "ts": "2026-06-19T16:05:00.000Z"
      }
    }
  },

  "tasks": [
    {
      "id": "task-1",
      "description": "Refactor auth.ts to use JWT middleware",
      "status": "in_progress",
      // "pending" | "in_progress" | "merging" | "completed" | "failed" | "cancelled"
      "assignedTo": "agent-1",
      "dependsOn": [],
      "priority": 1
    },
    {
      "id": "task-2",
      "description": "Write unit tests for auth module",
      "status": "pending",
      "assignedTo": null,
      "dependsOn": ["task-1"],
      "priority": 2
    }
  ],

  "fileLocks": {
    "src/auth.ts": { "lockedBy": "agent-1", "lockedAt": "2026-06-19T16:02:00.000Z" }
  },

  "mergeQueue": [
    { "agentId": "agent-1", "branch": "swarm/agent-1", "taskId": "task-1", "status": "pending" }
    // "pending" | "merging" | "merged" | "conflict"
  ]
}
```

### 3.2 `context.md` — IDE → Agent

Written to `.quantum/agents/<id>/context.md`. The agent's CWD is `.quantum/worktrees/<id>/` — so the context path relative to the worktree is `../../agents/<id>/context.md`. The env var `QUANTUM_AGENT_DIR` gives the absolute path.

```markdown
# Task
Refactor src/auth.ts to use JWT middleware pattern.

# Your Environment
- Worktree: /project/.quantum/worktrees/agent-1  (this is your working directory)
- Branch:   swarm/agent-1  (already checked out — do not run git checkout)
- Agent ID: agent-1
- Model:    deepseek-v4-flash

# Other Active Agents
| Agent    | Task                    | Status  | Files (advisory)     |
|----------|-------------------------|---------|----------------------|
| agent-2  | Add payment tests       | running | src/payment.ts       |
| agent-3  | Update README           | done    | README.md            |

# Advisory File Locks
| File          | Held By | Since                |
|---------------|---------|----------------------|
| src/auth.ts   | YOU     | 2026-06-19T16:02Z   |
| src/payment.ts| agent-2 | 2026-06-19T16:03Z   |

# Protocol
1. Work freely in this directory — all files are yours (git isolated worktree).
2. Do NOT run `git checkout` or `git worktree` commands.
3. Write status periodically to: /project/.quantum/agents/agent-1/manifest.json
   Format: {"status":"running","currentThought":"...","filesModified":["src/auth.ts"]}
4. Exit your process when the task is complete.
```

### 3.3 `manifest.json` — Agent → IDE

```typescript
// Validated schema on parse. All fields have defaults if missing.
interface AgentManifest {
  status: "idle" | "running" | "done" | "failed" | "waiting";
  currentThought: string;      // default: ""
  filesModified: string[];     // default: []
  error: string | null;        // default: null
}
```

If parse fails: log warning, use last known good manifest. Never crash.

### 3.4 `timeline.jsonl`

Newline-delimited JSON (NDJSON). Append-only. Each event is one line.

```jsonl
{"t":"2026-06-19T16:01:00Z","agent":"agent-1","type":"started","detail":"Auth refactor"}
{"t":"2026-06-19T16:02:00Z","agent":"agent-1","type":"file_locked","file":"src/auth.ts"}
{"t":"2026-06-19T16:05:00Z","agent":"agent-1","type":"completed","detail":"Task done"}
```

NDJSON instead of a JSON array: appending a line requires no file read, no JSON parse, no rewrite. A single `writeln!` with `OpenOptions::append(true)`.

---

## 4. Core Principle: Git Worktrees (not branches)

Each agent gets its own worktree — a fully isolated project directory — rather than sharing the project root with branch checkouts.

### Why This Matters

With branches in a shared directory:
- Agent-1 checks out `swarm/agent-1`, starts editing `src/auth.ts`
- Agent-2 checks out `swarm/agent-2` in the **same directory** → `src/auth.ts` is now agent-2's version
- Agent-1 continues editing, silently writing over a different version of the file
- No error, no conflict, pure data loss

With worktrees:
- Agent-1 works in `.quantum/worktrees/agent-1/src/auth.ts`
- Agent-2 works in `.quantum/worktrees/agent-2/src/auth.ts`
- Completely different files on disk. No collision possible at the OS level.

### Worktree Lifecycle

```rust
// Create: one command, one directory, one branch
// git worktree add <path> -b <branch> [<start-point>]
git worktree add .quantum/worktrees/agent-1 -b swarm/agent-1 main

// Agent's CWD when PTY is spawned:
// /project/.quantum/worktrees/agent-1/

// After agent exits and branch is merged:
git worktree remove .quantum/worktrees/agent-1 --force
git branch -d swarm/agent-1
```

### Merge Flow

```
main ──── A ──── B ──── C ─────────────── M1 ──── M2
                         \               /         /
                     worktree-1: D ─ E /           /
                         \               \         /
                     worktree-2: F ─ G ─ \─────────
```

Steps:
1. Agent finishes → PTY EOF → branch enters `mergeQueue`
2. DAG check: all `dependsOn` tasks must be `"completed"` before this task merges
3. Dry-run conflict check: `git -C <worktree-path> merge-tree --write-tree main HEAD`
   - Exit 0, no conflict markers: proceed
   - Exit 1 or conflict markers in output: pause swarm, show conflict UI
4. Actual merge: `git merge --no-ff swarm/agent-<id> -m "Merge agent-<id>: <task>"`
   (run from the main project root, not the worktree)
5. Prune: `git worktree remove` + `git branch -d`
6. Unblock: any task whose `dependsOn` is now fully resolved moves to `"pending"` → spawn

---

## 5. Agent Protocol

Agents are unmodified CLI tools. They interact through environment variables and files only.

### 5.1 Environment Variables (Injected at PTY Spawn)

```
QUANTUM_AGENT_ID=agent-1
QUANTUM_AGENT_DIR=/project/.quantum/agents/agent-1
QUANTUM_WORKTREE=/project/.quantum/worktrees/agent-1
QUANTUM_PROJECT_ROOT=/project
QUANTUM_BRANCH=swarm/agent-1
QUANTUM_SWARM_ID=swarm_2xkt9m4j
QUANTUM_AGENT_TYPE=opencode
QUANTUM_MODEL=deepseek-v4-flash

# Provider API keys (from keyring, injected per agent)
DEEPSEEK_API_KEY=sk-ds-...
# (only keys relevant to this agent's provider are injected)
```

**PTY working directory:** `QUANTUM_WORKTREE` — the agent starts already inside its isolated checkout.

### 5.2 File-Based IPC

| Direction    | File                                     | Written By          | Frequency       |
|--------------|------------------------------------------|---------------------|-----------------|
| IDE → Agent  | `.quantum/agents/<id>/context.md`        | Coordination svc    | On state change |
| Agent → IDE  | `.quantum/agents/<id>/manifest.json`     | Agent               | Periodically    |
| IDE ← PTY   | PTY stdout                               | Agent               | Continuous      |

### 5.3 What Agents Are Asked to Do

Communicated via `.quantum/agents/.config/AGENTS.md` and `context.md`:

```
1. Read $QUANTUM_AGENT_DIR/context.md at startup (your task, your worktree, other agents)
2. Work in your current directory — it is already your isolated checkout
3. Do not run git checkout, git worktree, or git branch commands
4. Periodically write status to $QUANTUM_AGENT_DIR/manifest.json:
     {"status":"running","currentThought":"...","filesModified":["src/auth.ts"]}
5. Exit your process when done
```

If an agent never writes `manifest.json`: harmless. PTY exit event signals completion.

---

## 6. Agent Auto-Detection

Detect agent type by scanning first 500 bytes of PTY stdout per session.

```typescript
type AgentType =
  | "opencode"
  | "kilocode"
  | "claude-code"
  | "codex"
  | "aider"
  | "unknown";

const DETECTION_RULES: { type: AgentType; patterns: RegExp[] }[] = [
  { type: "opencode",    patterns: [/opencode/i,    /╭─.*opencode/i] },
  { type: "kilocode",   patterns: [/kilocode/i] },
  { type: "claude-code", patterns: [/claude\s*code/i, /╭─.*claude/i] },
  { type: "codex",       patterns: [/codex/i,        /@codex/i] },
  { type: "aider",       patterns: [/aider/i,        /Aider\s+v\d/i] },
];

// Implementation: xterm.js onData listener
// Match against accumulated bytes (not per-chunk)
// Once matched: lock type for session, stop scanning
// No match after 500 bytes: type = "unknown", still coordinates normally
```

Detection triggers the same worktree + context.md setup regardless of whether the agent was spawned by Quantum (structured) or typed by the user manually (unstructured). There is one code path.

---

## 7. Agent & Model Selection

### 7.1 Config (inside `swarm-state.json`)

```jsonc
"config": {
  "defaultAgent": "opencode",
  "defaultModel": "deepseek-v4-flash",
  "quickPresets": [
    { "agent": "opencode",  "model": "deepseek-v4-flash",      "label": "OpenCode · DeepSeek V4 Flash"      },
    { "agent": "kilocode", "model": "deepseek-v4-flash-free", "label": "KiloCode · DeepSeek V4 Flash Free" }
  ],
  "modelOptions": {
    "opencode":    ["deepseek-v4-flash", "deepseek-v4-flash-free", "gpt-4o", "claude-sonnet-4"],
    "kilocode":   ["deepseek-v4-flash-free", "deepseek-v4-flash"],
    "claude-code": ["claude-sonnet-4", "claude-haiku-4"],
    "codex":       ["gpt-4o", "gpt-4o-mini"],
    "aider":       ["deepseek-v4-flash", "gpt-4o"]
  }
}
```

### 7.2 Priority Resolution

```
1. Per-task override (set when creating task)
2. Quick preset (one-click assigns both agent + model)
3. Global defaultAgent / defaultModel from config
```

### 7.3 Provider API Keys

```
User enters key in Swarm Settings → Rust keyring::Entry::new("quantum", "deepseek")?.set_password(key)
At PTY spawn → Rust reads key from keyring → injected as env var into PTY environment only
Agent reads env var automatically → no config file needed
Key never written to disk, never in swarm-state.json
```

**Provider → env var mapping:**

| Provider  | Env Var            | Used By                       |
|-----------|--------------------|-------------------------------|
| DeepSeek  | `DEEPSEEK_API_KEY` | OpenCode, KiloCode, Aider     |
| OpenAI    | `OPENAI_API_KEY`   | OpenCode, Codex               |
| Anthropic | `ANTHROPIC_API_KEY`| Claude Code, OpenCode         |
| OpenRouter| `OPENROUTER_API_KEY`| OpenCode, KiloCode (fallback) |

---

## 8. Config Injection

Auto-generated in `.quantum/agents/.config/`. Regenerated on swarm init and on any agent type change.

### `AGENTS.md` — Universal

```markdown
# Quantum Swarm Agent Protocol

## Your Environment
- `$QUANTUM_AGENT_DIR` — your per-agent directory (context.md and manifest.json live here)
- `$QUANTUM_WORKTREE`  — your working directory (already checked out on your branch)
- `$QUANTUM_BRANCH`    — your git branch name
- `$QUANTUM_PROJECT_ROOT` — absolute path to the project root (for reference)

## Instructions
1. Read `$QUANTUM_AGENT_DIR/context.md` — contains your task and coordination context.
2. Work in your current directory. It is already isolated. Do not run git checkout.
3. Periodically update `$QUANTUM_AGENT_DIR/manifest.json`:
   {"status":"running","currentThought":"<what you are doing>","filesModified":["src/x.ts"]}
4. Exit when your task is complete.
```

### `CLAUDE.md` — Claude Code Specific

Placed at `.quantum/agents/.config/CLAUDE.md` and symlinked (or copied) to `<worktree>/CLAUDE.md` at worktree creation, so Claude Code picks it up automatically via its CLAUDE.md discovery.

```markdown
# Quantum Swarm Integration (Claude Code)

You are running inside a Quantum Swarm. Your task and coordination context
are in: $QUANTUM_AGENT_DIR/context.md

After reading your task:
1. Work in your current directory (already on your isolated branch).
2. Do not use /git checkout or /git branch commands.
3. Write status to $QUANTUM_AGENT_DIR/manifest.json periodically.
4. Use /exit when done.
```

### `opencode.md` — OpenCode Specific

Written to `<worktree>/.opencode.md` (OpenCode's config discovery path):

```markdown
model = "$QUANTUM_MODEL"
# Quantum task context: read $QUANTUM_AGENT_DIR/context.md
# Write status to $QUANTUM_AGENT_DIR/manifest.json
# Do not run git checkout or git branch
```

---

## 9. Rust Backend

### 9.1 Crate Dependencies (New)

```toml
# Cargo.toml additions
[dependencies]
notify              = "6"          # FS watching (replaces tauri-plugin-fs-watch)
notify-debouncer-mini = "0"        # 150ms debounce wrapper
git2                = "0.19"       # Read-only git queries only
keyring             = "3"          # OS keychain for API keys
serde               = { version = "1", features = ["derive"] }
serde_json          = "1"
tokio               = { version = "1", features = ["process", "io-util"] }
thiserror           = "1"
```

`tokio` is already a Tauri dependency — the `process` feature adds async subprocess management.

### 9.2 Module Structure

```
src-tauri/src/
└── swarm/
    ├── mod.rs           Re-exports, SwarmError type
    ├── commands.rs      Tauri #[command] functions (public API to frontend)
    ├── state.rs         SwarmState, Task, Agent structs + serde + validation
    ├── git.rs           All git operations via tokio::process::Command
    ├── watcher.rs       notify-rs watcher + debounce + emit logic
    └── keyring.rs       API key get/set/delete via keyring crate
```

### 9.3 `SwarmError` Type

```rust
#[derive(thiserror::Error, Debug)]
pub enum SwarmError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Git command failed: {stderr}")]
    Git { stdout: String, stderr: String, exit_code: i32 },

    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("Worktree already exists: {0}")]
    WorktreeExists(String),

    #[error("Agent not found: {0}")]
    AgentNotFound(String),

    #[error("State parse error: {0}")]
    StateParse(String),
}

// Serialize for Tauri IPC
impl serde::Serialize for SwarmError {
    fn serialize<S>(&self, s: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        s.serialize_str(&self.to_string())
    }
}
```

### 9.4 Tauri Commands (`commands.rs`)

```rust
// Initialize swarm: create .quantum/ structure, write initial swarm-state.json
#[tauri::command]
pub async fn init_swarm(
    project_root: String,
    name: String,
    state: tauri::State<'_, SwarmManager>,
) -> Result<SwarmState, SwarmError>

// Add a task + immediately create worktree + write context.md
// Returns agentId that was assigned
#[tauri::command]
pub async fn add_agent(
    project_root: String,
    task: TaskSpec,          // { description, agentType, model, dependsOn[] }
    state: tauri::State<'_, SwarmManager>,
) -> Result<String, SwarmError>

// Spawn the PTY for an already-registered agent
// Injects env vars + API keys from keyring
#[tauri::command]
pub async fn spawn_agent_pty(
    project_root: String,
    agent_id: String,
    app: tauri::AppHandle,
) -> Result<SessionInfo, SwarmError>

// Kill agent: SIGTERM → wait 5s → SIGKILL; release locks; update state
#[tauri::command]
pub async fn kill_agent(
    project_root: String,
    agent_id: String,
) -> Result<(), SwarmError>

// Get current swarm state (full)
#[tauri::command]
pub async fn get_swarm_state(
    project_root: String,
) -> Result<SwarmState, SwarmError>

// Dry-run merge check. Returns conflict files if any.
#[tauri::command]
pub async fn check_merge(
    project_root: String,
    agent_id: String,
) -> Result<MergeCheckResult, SwarmError>

// Execute actual merge after check passes (or after user resolves conflict)
#[tauri::command]
pub async fn merge_agent(
    project_root: String,
    agent_id: String,
) -> Result<MergeResult, SwarmError>

// API key management
#[tauri::command]
pub async fn set_api_key(provider: String, key: String) -> Result<(), SwarmError>
#[tauri::command]
pub async fn get_api_key(provider: String) -> Result<Option<String>, SwarmError>
#[tauri::command]
pub async fn delete_api_key(provider: String) -> Result<(), SwarmError>

// On IDE startup: reconcile running state vs actual OS processes
#[tauri::command]
pub async fn reconcile_swarm(
    project_root: String,
    app: tauri::AppHandle,
) -> Result<ReconciliationReport, SwarmError>

// Update swarm config (user changed defaults in settings)
#[tauri::command]
pub async fn update_swarm_config(
    project_root: String,
    config: SwarmConfig,
) -> Result<(), SwarmError>
```

### 9.5 Git Operations (`git.rs`)

All Git operations use `tokio::process::Command`. Helper:

```rust
async fn git(project_root: &str, args: &[&str]) -> Result<GitOutput, SwarmError> {
    let output = tokio::process::Command::new("git")
        .args(args)
        .current_dir(project_root)
        .output()
        .await?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(GitOutput { stdout, stderr })
    } else {
        Err(SwarmError::Git {
            stdout,
            stderr,
            exit_code: output.status.code().unwrap_or(-1),
        })
    }
}
```

Key operations:

```rust
// Create worktree for a new agent
pub async fn create_worktree(project_root: &str, agent_id: &str) -> Result<String, SwarmError> {
    let worktree_path = format!(".quantum/worktrees/{}", agent_id);
    let branch = format!("swarm/{}", agent_id);

    // Ensure main is up to date before branching
    // (skip pull if no remote configured — local-only repos are valid)
    let _ = git(project_root, &["pull", "--ff-only", "--quiet"]).await;

    git(project_root, &["worktree", "add", &worktree_path, "-b", &branch]).await?;

    // Copy CLAUDE.md into worktree for Claude Code auto-discovery
    // (copy, not symlink — symlinks across worktrees can confuse some tools)
    let src = format!("{}/.quantum/agents/.config/CLAUDE.md", project_root);
    let dst = format!("{}/{}/CLAUDE.md", project_root, worktree_path);
    tokio::fs::copy(&src, &dst).await.ok(); // Non-fatal if missing

    Ok(format!("{}/{}", project_root, worktree_path))
}

// Dry-run conflict check (does not touch working tree)
pub async fn check_merge_conflicts(
    project_root: &str,
    agent_id: &str,
) -> Result<Vec<String>, SwarmError> {
    let worktree_path = format!("{}/.quantum/worktrees/{}", project_root, agent_id);

    // git merge-tree --write-tree branches to a temporary tree object
    // does not touch the index or working directory
    // exit code 1 = conflicts; stdout contains conflict markers
    let result = tokio::process::Command::new("git")
        .args(&["merge-tree", "--write-tree", "main", "HEAD"])
        .current_dir(&worktree_path)
        .output()
        .await?;

    if result.status.success() {
        return Ok(vec![]); // Clean merge
    }

    // Parse conflict files from stderr
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    let conflict_files = stderr
        .lines()
        .filter(|l| l.contains("CONFLICT"))
        .filter_map(|l| l.split_whitespace().last().map(str::to_string))
        .collect();

    Ok(conflict_files)
}

// Execute merge (only after check_merge_conflicts returns empty)
pub async fn merge_agent_branch(project_root: &str, agent_id: &str) -> Result<(), SwarmError> {
    let branch = format!("swarm/{}", agent_id);
    let worktree_path = format!(".quantum/worktrees/{}", agent_id);
    let msg = format!("swarm: merge agent-{}", agent_id);

    // Merge into main from the project root
    git(project_root, &["merge", "--no-ff", &branch, "-m", &msg]).await?;

    // Clean up worktree and branch
    git(project_root, &["worktree", "remove", &worktree_path, "--force"]).await?;
    git(project_root, &["branch", "-d", &branch]).await?;

    Ok(())
}

// Read-only: check if a PID is still alive (for reconciliation)
pub fn is_pid_alive(pid: u32) -> bool {
    // git2 not needed here — pure OS call
    #[cfg(unix)]
    unsafe { libc::kill(pid as i32, 0) == 0 }

    #[cfg(windows)]
    {
        use std::os::windows::io::FromRawHandle;
        // OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION) + GetExitCodeProcess
        // Returns true if exit code is STILL_ACTIVE (259)
        windows_pid_alive(pid)
    }
}
```

### 9.6 File Watcher (`watcher.rs`)

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use std::time::Duration;
use tauri::AppHandle;

pub fn start_swarm_watcher(app: AppHandle, project_root: String) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();

        // 150ms debounce — eliminates FSEvents double-fires on macOS
        let mut debouncer = new_debouncer(Duration::from_millis(150), tx)
            .expect("Failed to create watcher");

        let watch_path = format!("{}/.quantum/agents", project_root);
        debouncer
            .watcher()
            .watch(std::path::Path::new(&watch_path), RecursiveMode::Recursive)
            .expect("Failed to watch .quantum/agents");

        for result in rx {
            match result {
                Ok(events) => {
                    for event in events {
                        handle_fs_event(&app, &event);
                    }
                }
                Err(e) => {
                    eprintln!("[swarm-watcher] error: {:?}", e);
                }
            }
        }
    });
}

fn handle_fs_event(app: &AppHandle, event: &DebouncedEvent) {
    let path = &event.path;

    // Only care about manifest.json files
    if path.file_name().and_then(|n| n.to_str()) != Some("manifest.json") {
        return;
    }

    // Extract agent ID from path: .quantum/agents/<agent-id>/manifest.json
    let agent_id = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(str::to_string);

    let Some(agent_id) = agent_id else { return };

    // Read and validate manifest
    match std::fs::read_to_string(path) {
        Ok(content) => {
            match serde_json::from_str::<AgentManifest>(&content) {
                Ok(manifest) => {
                    let _ = app.emit("swarm:manifest-changed", ManifestChangedPayload {
                        agent_id,
                        manifest,
                    });
                }
                Err(e) => {
                    eprintln!("[swarm-watcher] manifest parse error for {}: {}", agent_id, e);
                    // Emit stale event so UI can show "manifest error" state
                    let _ = app.emit("swarm:manifest-parse-error", agent_id);
                }
            }
        }
        Err(e) => {
            eprintln!("[swarm-watcher] manifest read error for {}: {}", agent_id, e);
        }
    }
}
```

### 9.7 Atomic Write

Used for `swarm-state.json` only. All other files use normal writes.

```rust
pub fn atomic_write(path: &std::path::Path, content: &str) -> Result<(), SwarmError> {
    // Write to a temp file in the same directory (same filesystem = atomic rename)
    let tmp = path.with_extension("json.tmp");

    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?; // fsync before rename
    }

    std::fs::rename(&tmp, path)?;
    // rename is atomic on POSIX. On Windows: std::fs::rename is NOT atomic,
    // but for our use case (single writer, IDE-only file) it is acceptable.
    // If Windows atomic rename is needed: use MoveFileExW with MOVEFILE_REPLACE_EXISTING.

    Ok(())
}
```

---

## 10. TypeScript Store

### 10.1 `swarmStore.ts`

Single Zustand store with `immer` middleware for nested state mutations.

```typescript
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { SwarmState, AgentManifest } from "../types/swarm";

interface SwarmStore {
  state: SwarmState | null;
  isLoading: boolean;
  error: string | null;

  // Actions (all mutate via immer)
  setState: (state: SwarmState) => void;
  updateAgentManifest: (agentId: string, manifest: AgentManifest) => void;
  updateAgentStatus: (agentId: string, status: Agent["status"]) => void;
  markManifestError: (agentId: string) => void;
  appendTimelineEvent: (event: TimelineEvent) => void;
}

export const useSwarmStore = create<SwarmStore>()(
  immer((set) => ({
    state: null,
    isLoading: false,
    error: null,

    setState: (state) => set((s) => { s.state = state; }),

    updateAgentManifest: (agentId, manifest) =>
      set((s) => {
        if (s.state?.agents[agentId]) {
          s.state.agents[agentId].manifest = {
            ...manifest,
            ts: new Date().toISOString(),
          };
          // Auto-update file locks from manifest
          if (manifest.filesModified) {
            manifest.filesModified.forEach((file) => {
              if (!s.state!.fileLocks[file]) {
                s.state!.fileLocks[file] = {
                  lockedBy: agentId,
                  lockedAt: new Date().toISOString(),
                };
              }
            });
          }
        }
      }),

    updateAgentStatus: (agentId, status) =>
      set((s) => {
        if (s.state?.agents[agentId]) {
          s.state.agents[agentId].status = status;
        }
      }),

    markManifestError: (agentId) =>
      set((s) => {
        if (s.state?.agents[agentId]) {
          s.state.agents[agentId].manifest = {
            ...s.state.agents[agentId].manifest,
            _parseError: true,
          };
        }
      }),
  }))
);
```

### 10.2 Tauri Event Bridge (`src/tauri/swarm.ts`)

```typescript
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSwarmStore } from "../stores/swarmStore";

export async function startSwarmEventListeners(projectRoot: string) {
  const store = useSwarmStore.getState();

  // Load initial state
  const state = await invoke<SwarmState>("get_swarm_state", { projectRoot });
  store.setState(state);

  // Listen to manifest changes from Rust watcher
  await listen<ManifestChangedPayload>("swarm:manifest-changed", (event) => {
    store.updateAgentManifest(event.payload.agentId, event.payload.manifest);
  });

  await listen<string>("swarm:manifest-parse-error", (event) => {
    store.markManifestError(event.payload);
  });

  // Listen to PTY exit events (agent completed)
  await listen<PtyExitPayload>("pty:session-exit", (event) => {
    const { sessionId, exitCode } = event.payload;
    const state = useSwarmStore.getState().state;
    if (!state) return;

    const agent = Object.values(state.agents).find(
      (a) => a.sessionId === sessionId
    );
    if (!agent) return;

    store.updateAgentStatus(
      agent.id,
      exitCode === 0 ? "done" : "failed"
    );

    // Trigger merge queue processing if exit was clean
    if (exitCode === 0) {
      coordinationService.onAgentExit(agent.id);
    }
  });
}
```

---

## 11. Coordination Service

`src/lib/swarm/coordinationService.ts` — runs in the renderer process, orchestrates the high-level swarm lifecycle.

```typescript
class CoordinationService {
  private projectRoot: string = "";

  async onAgentExit(agentId: string): Promise<void> {
    const state = useSwarmStore.getState().state;
    if (!state) return;

    const agent = state.agents[agentId];
    if (!agent || agent.status !== "done") return;

    // Check if this agent's task is in the merge queue
    const inQueue = state.mergeQueue.some(
      (item) => item.agentId === agentId && item.status === "pending"
    );
    if (!inQueue) return;

    // Check DAG: all dependencies must be merged before we merge this
    const task = state.tasks.find((t) => t.id === agent.taskId);
    if (!task) return;

    const depsResolved = task.dependsOn.every((depTaskId) => {
      const depTask = state.tasks.find((t) => t.id === depTaskId);
      return depTask?.status === "completed";
    });

    if (!depsResolved) return; // Will be re-triggered when dependency merges

    await this.processMerge(agentId);
  }

  private async processMerge(agentId: string): Promise<void> {
    try {
      // Dry-run check
      const check = await invoke<MergeCheckResult>("check_merge", {
        projectRoot: this.projectRoot,
        agentId,
      });

      if (check.conflictFiles.length > 0) {
        // Pause swarm, notify UI to show conflict resolver
        useSwarmStore.getState().updateAgentStatus(agentId, "conflict");
        this.emitConflict(agentId, check.conflictFiles);
        return;
      }

      // Execute merge
      useSwarmStore.getState().updateAgentStatus(agentId, "merging");
      await invoke("merge_agent", { projectRoot: this.projectRoot, agentId });
      useSwarmStore.getState().updateAgentStatus(agentId, "done");

      // Mark task completed
      this.markTaskCompleted(agentId);

      // Unblock dependent tasks
      this.unblockDependents(agentId);
    } catch (err) {
      console.error(`[coordination] merge failed for ${agentId}:`, err);
      useSwarmStore.getState().updateAgentStatus(agentId, "failed");
    }
  }

  private unblockDependents(completedAgentId: string): void {
    const state = useSwarmStore.getState().state;
    if (!state) return;

    const completedAgent = state.agents[completedAgentId];
    const completedTask = state.tasks.find((t) => t.id === completedAgent.taskId);
    if (!completedTask) return;

    // Find tasks that depend on this one and are now fully unblocked
    const unblocked = state.tasks.filter((task) => {
      if (task.status !== "pending") return false;
      if (!task.dependsOn.includes(completedTask.id)) return false;

      // All of this task's dependencies must now be completed
      return task.dependsOn.every((depId) => {
        const dep = state.tasks.find((t) => t.id === depId);
        return dep?.status === "completed";
      });
    });

    // For each unblocked task with an assigned agent, spawn the agent
    for (const task of unblocked) {
      if (task.assignedTo) {
        invoke("spawn_agent_pty", {
          projectRoot: this.projectRoot,
          agentId: task.assignedTo,
        });
      }
    }
  }

  // Context refresh: called when state changes that affect an agent
  async refreshContext(agentId: string): Promise<void> {
    const state = useSwarmStore.getState().state;
    if (!state) return;

    const contextContent = buildContextMd(agentId, state);
    await invoke("write_agent_context", {
      projectRoot: this.projectRoot,
      agentId,
      content: contextContent,
    });
  }

  // Called by event listeners on: agent status change, file lock change, task completion
  async onStateChange(changedAgentIds: string[]): Promise<void> {
    for (const id of changedAgentIds) {
      const agent = useSwarmStore.getState().state?.agents[id];
      if (agent?.status === "running") {
        await this.refreshContext(id);
      }
    }
  }
}

export const coordinationService = new CoordinationService();
```

**Context write trigger points:**
- An agent's `manifest.json` is parsed and shows a new file lock → refresh all other running agents
- An agent's status changes to `"done"` or `"failed"` → refresh remaining running agents
- A task is newly unblocked (dependency resolved) → write context for that task's agent before spawning

**Safety heartbeat:** A single `setInterval(60_000)` checks if any running agent has had no manifest update in more than 2 minutes. If so, log a warning to the activity log and write context once (in case the write event was missed).

---

## 12. UI Components

### 12.1 Component Tree

```
SwarmPanel
├── SwarmHeader          Swarm name, phase badge, "New Task" button
├── TaskBoard            DAG visualization (pending/running/done columns)
│   └── TaskCard[]       Per-task: description, agent badge, status, "Kill" / "Merge"
├── AgentGrid            Running agents with live manifest data
│   └── AgentCard[]      currentThought, filesModified, status dot, "View Terminal"
├── ActivityLog          Timeline events from timeline.jsonl
├── FileLocksPanel       Advisory lock table (file → agent)
└── ConflictResolver     Monaco diff + resolve controls (shown on conflict only)
```

### 12.2 Key Components

**`AgentCard`** — subscribes to `useSwarmStore` with a selector scoped to one agent:
```typescript
const agent = useSwarmStore(
  (s) => s.state?.agents[agentId],
  shallow  // from zustand/shallow — prevents re-render if other agents change
);
```

**`TaskBoard`** — renders tasks in three columns (Pending, Running, Done). DAG edges drawn as SVG lines between cards.

**`ConflictResolver`** — appears as a blocking modal when `state.phase === "conflict"`. Shows Monaco diff of the conflicting files. User picks resolution (theirs/ours/manual). On confirm: calls `merge_agent` with the resolved content.

**`SwarmTerminalTab`** — wraps existing PTY terminal component. Badge: agent icon + status dot. Tabs are the existing IDE terminal tabs — no new terminal UI.

### 12.3 UI States

| State | What UI Shows |
|-------|---------------|
| No swarm | "Create Swarm" or "Create Task" button |
| Planning | Task creation flow, agent + model assignment |
| Executing | AgentGrid with live manifest, TaskBoard, ActivityLog |
| Merging | Agent card shows "merging" spinner |
| Conflict | ConflictResolver modal blocks interaction |
| Done | Summary: tasks completed, merge history, timeline |

### 12.4 Editor Integration

**Monaco decorations** — when a file is open and it appears in `state.fileLocks`:

```typescript
const lockEntry = fileLocks[currentFilePath];
if (lockEntry) {
  editor.createDecorationsCollection([{
    range: new monaco.Range(1, 1, 1, 1),
    options: {
      isWholeLine: false,
      glyphMarginClassName: "swarm-lock-glyph",
      glyphMarginHoverMessage: {
        value: `🔒 Advisory lock held by ${lockEntry.lockedBy}`
      }
    }
  }]);
}
```

**File tree badges** — in `FileTree.tsx`, apply a `data-lock-agent` attribute to locked items for CSS targeting. No React state needed — reads directly from `useSwarmStore`.

---

## 13. Recovery & Reliability

### 13.1 Startup Reconciliation

On IDE startup, if `.quantum/swarm-state.json` exists:

```typescript
// In app initialization
const report = await invoke<ReconciliationReport>("reconcile_swarm", { projectRoot });

// Rust reconcile_swarm does:
// 1. Load swarm-state.json
// 2. For each agent with status "running" or "dead":
//    a. Check if PID is alive (kill(pid, 0) on Unix)
//    b. Check if worktree directory exists
//    c. If PID alive + worktree exists: mark "running", re-attach FS watcher
//    d. If PID dead: release file locks, mark "dead", add to activity log
// 3. Resume FS watcher on .quantum/agents/
// 4. Re-process merge queue for any agents with status "done" (merge may have been interrupted)
// 5. Return ReconciliationReport { revived, dead, resumedMerges }
```

### 13.2 Heartbeat

**Where:** Single `setInterval(30_000)` in `coordinationService`.

**What it checks:**
- `agent.heartbeatAt` is more than 35 seconds ago AND `agent.status === "running"`
- Check OS: `invoke("is_pid_alive", { pid: agent.pid })`
- If pid dead: mark agent `"dead"`, release locks, log event
- If pid alive but stale heartbeat: write fresh context.md once (agent may have missed earlier context updates)

**Why 35s / 30s:** Agents write manifest on a multi-second cadence when active. 35 seconds is long enough to avoid false positives from a slow API call but short enough to catch a crashed process promptly.

### 13.3 Crash Scenarios

| Scenario | Recovery |
|----------|----------|
| IDE crashes while agents run | Agents continue (they are child processes of OS, not IDE). On restart, reconcile_swarm detects PIDs still alive, re-attaches watchers. |
| Agent crashes (process dies) | PTY EOF fires → update agent status. If PID check on reconciliation: mark dead. |
| `swarm-state.json` corrupted | Parse fails → show error dialog with raw content. Offer: reset state (lose tracking, keep agent branches) or restore from timeline.jsonl. |
| `.quantum/` deleted while running | Coordination service gets FS error on next write. Re-create directory structure. Agents continue in their worktrees unaffected. |
| Merge interrupted (IDE crash during merge) | Branch still exists, worktree may be in conflict state. On reconcile: re-run check_merge. If conflict: surface to user. If clean: re-run merge. |
| Two IDE instances open same project | Both read swarm-state.json. Atomic writes prevent torn reads. Last writer wins on state updates — for a single-user IDE this is acceptable. |

---

## 14. Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Two agents modify same file | Worktree isolation prevents collision at write time. Merge conflict detected at merge time via `git merge-tree`. Swarm paused, ConflictResolver shown. |
| Agent starts before dependency finishes | Task dispatcher checks DAG. Worktree is created eagerly (so the branch exists), but PTY is not spawned until all dependencies are in `"completed"` status. |
| Agent exits non-zero | PTY exit event fires with non-zero code. Agent marked `"failed"`. Locks released. Task marked `"failed"`. User can retry. |
| Agent creates new files | Tracked in the worktree's git index. Merged in on `git merge --no-ff`. No registration needed. |
| Agent deletes files | Git tracks deletes. Merge handles it. If dependent task needed those files, conflict surfaces at merge. |
| Agent runs `git checkout` despite instructions | This changes their own worktree's checked-out branch. The worktree is theirs — Git's worktree system prevents it from affecting main or other worktrees. Consequence: their branch pointer moves; merge may fail or not include their work. This is a recoverable user error. |
| `manifest.json` is malformed JSON | Parse error → log to activity log, mark agent manifest as `_parseError: true`, show stale indicator in UI. Agent completion still detected via PTY exit. |
| Agent writes manifest with unknown status value | Validation coerces to `"running"`. Unknown values never crash the store. |
| Keyring unavailable (Linux without libsecret) | `keyring::Entry::get_password()` returns `keyring::Error::NoStorageAccess`. UI tells user to export API keys as env vars before launching Quantum. |
| Worktree path already exists | `git worktree add` fails with "already exists". Rust checks path before calling add; if directory exists but is not a worktree, rename it `<path>.bak.<timestamp>` and proceed. |
| `git` not found in PATH | `tokio::process::Command::new("git")` returns `NotFound` error. Surface clear error: "Git not found. Install Git and restart." |
| Agent forgets to exit | User clicks "Kill" → SIGTERM → 5 second wait → SIGKILL. Marks `"failed"`, releases locks. |
| User closes IDE without ending swarm | Worktrees remain on disk. Agents that were spawned as PTY children may or may not survive depending on whether IDE uses process groups. On next IDE open, reconcile detects worktrees, re-reads state, re-attaches. |

---

## 15. Implementation Phases

### Phase 1 — Rust Backend (Week 1)

Goal: All Rust commands work, tested in isolation.

```
Files:
  src-tauri/src/swarm/mod.rs
  src-tauri/src/swarm/commands.rs
  src-tauri/src/swarm/state.rs
  src-tauri/src/swarm/git.rs
  src-tauri/src/swarm/watcher.rs
  src-tauri/src/swarm/keyring.rs
  src-tauri/src/lib.rs          (register commands + watcher on setup)

Acceptance:
  □ init_swarm creates correct directory structure
  □ add_agent creates worktree at correct path with correct branch
  □ spawn_agent_pty injects env vars + API keys from keyring
  □ FS watcher fires swarm:manifest-changed within 200ms of manifest write
  □ check_merge returns empty for non-conflicting branches
  □ check_merge returns conflict files for conflicting branches
  □ merge_agent completes successfully, worktree removed, branch deleted
  □ reconcile_swarm correctly identifies dead vs alive agents
  □ atomic_write is used for all swarm-state.json writes
```

### Phase 2 — Types + Store + Events (Week 2)

Goal: Frontend receives and applies all Rust events correctly.

```
Files:
  src/types/swarm.ts
  src/stores/swarmStore.ts
  src/tauri/swarm.ts
  src/lib/swarm/coordinationService.ts

Acceptance:
  □ swarmStore updates when manifest-changed event fires
  □ immer middleware correctly mutates nested agent state
  □ PTY exit event updates agent status
  □ Merge queue processes correctly after agent exits
  □ Dependent tasks spawn after dependency merges
  □ Context.md is re-written on the right state change events (not on timer)
  □ 60-second heartbeat safety write works
```

### Phase 3 — UI Components (Week 3)

Goal: User can see and control the swarm.

```
Files:
  src/components/swarm/SwarmPanel.tsx
  src/components/swarm/TaskBoard.tsx
  src/components/swarm/AgentCard.tsx
  src/components/swarm/AgentGrid.tsx
  src/components/swarm/ActivityLog.tsx
  src/components/swarm/FileLocksPanel.tsx
  src/components/swarm/ConflictResolver.tsx
  src/components/swarm/SwarmSettingsDialog.tsx
  src/components/swarm/NewTaskDialog.tsx
  src/lib/panelRegistry.tsx            (+5 lines)
  src/components/explorer/FileTree.tsx (+20 lines for lock badges)

Acceptance:
  □ SwarmPanel shows correct agent statuses
  □ AgentCard shows currentThought from latest manifest
  □ Clicking "View Terminal" focuses agent's PTY tab
  □ Kill button sends SIGTERM → SIGKILL sequence
  □ ConflictResolver shows Monaco diff for conflicting files
  □ File tree shows lock badges for locked files
  □ SwarmSettings saves defaultAgent/model to swarm-state.json config section
  □ Provider API key entry saves to OS keychain via invoke
```

### Phase 4 — Recovery + Edge Cases (Week 4)

Goal: No user-visible crash in any edge case.

```
Files (modifications):
  src-tauri/src/swarm/commands.rs    (reconcile_swarm, is_pid_alive)
  src/lib/swarm/coordinationService.ts  (heartbeat, recovery path)
  src/tauri/swarm.ts                 (reconciliation on startup)

Acceptance:
  □ Kill IDE → restart → reconcile detects which agents are alive
  □ Agent process crash detected within 35 seconds
  □ Stale locks released after agent dies
  □ Corrupted swarm-state.json shows error dialog, not crash
  □ .quantum/ deleted → recreated on next write
  □ Merge interrupted (IDE crash during merge) → re-attempted on restart
  □ Worktree already exists error handled gracefully
  □ Git not in PATH shows user-readable error
  □ All 14 edge cases in Section 14 manually verified
```

---

## 16. Files to Create or Modify

### New Files (~2,000 LOC)

```
Rust (~550 LOC):
  src-tauri/src/swarm/mod.rs          ~40
  src-tauri/src/swarm/commands.rs     ~200
  src-tauri/src/swarm/state.rs        ~120
  src-tauri/src/swarm/git.rs          ~120
  src-tauri/src/swarm/watcher.rs      ~70
  src-tauri/src/swarm/keyring.rs      ~40

TypeScript Core (~400 LOC):
  src/types/swarm.ts                  ~150
  src/stores/swarmStore.ts            ~150
  src/tauri/swarm.ts                  ~60
  src/lib/swarm/coordinationService.ts ~200
  src/lib/swarm/mergeProcessor.ts     ~80
  src/lib/swarm/contextBuilder.ts     ~60

UI (~800 LOC):
  src/components/swarm/SwarmPanel.tsx       ~120
  src/components/swarm/TaskBoard.tsx        ~120
  src/components/swarm/AgentCard.tsx        ~100
  src/components/swarm/AgentGrid.tsx        ~80
  src/components/swarm/ActivityLog.tsx      ~80
  src/components/swarm/FileLocksPanel.tsx   ~60
  src/components/swarm/ConflictResolver.tsx ~120
  src/components/swarm/SwarmSettingsDialog.tsx ~80
  src/components/swarm/NewTaskDialog.tsx    ~80
```

### Modified Files

```
src-tauri/Cargo.toml                  +4 dependency lines
src-tauri/src/lib.rs                  +15 lines (register swarm commands, start watcher)
src-tauri/src/commands/pty.rs         +10 lines (emit pty:session-exit event)
src/tauri/pty.ts                      +5 lines  (listen for session-exit)
src/stores/terminalStore.ts           +8 lines  (sessionId → agentId mapping)
src/lib/panelRegistry.tsx             +5 lines  (register SwarmPanel)
src/components/explorer/FileTree.tsx  +20 lines (lock badges)
.gitignore                            +4 lines
```

**Total new: ~1,750 LOC across 24 new files.**

---

## 17. Testing Strategy

### 17.1 Rust Unit Tests

Each function in `git.rs` has tests using a real temporary git repo (created with `tempdir` + `git init`):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempdir::TempDir;

    async fn setup_test_repo() -> (TempDir, String) {
        let dir = TempDir::new("swarm-test").unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        git(&root, &["init"]).await.unwrap();
        git(&root, &["config", "user.email", "test@test.com"]).await.unwrap();
        git(&root, &["config", "user.name", "Test"]).await.unwrap();
        // Create initial commit so main branch exists
        std::fs::write(format!("{}/README.md", root), "init").unwrap();
        git(&root, &["add", "."]).await.unwrap();
        git(&root, &["commit", "-m", "init"]).await.unwrap();
        (dir, root)
    }

    #[tokio::test]
    async fn test_create_worktree() { ... }

    #[tokio::test]
    async fn test_check_merge_no_conflict() { ... }

    #[tokio::test]
    async fn test_check_merge_with_conflict() { ... }

    #[tokio::test]
    async fn test_merge_agent_branch() { ... }

    #[tokio::test]
    async fn test_atomic_write() { ... }
}
```

### 17.2 TypeScript Unit Tests (Vitest)

```typescript
// swarmStore.test.ts
describe("swarmStore", () => {
  test("updateAgentManifest updates nested state without spreading", () => { ... });
  test("updateAgentManifest updates file locks from filesModified", () => { ... });
  test("agent with unknown status does not throw", () => { ... });
  test("markManifestError sets _parseError without clearing other fields", () => { ... });
});

// coordinationService.test.ts (mock invoke)
describe("coordinationService", () => {
  test("onAgentExit triggers merge when deps are resolved", () => { ... });
  test("onAgentExit does not merge when deps are pending", () => { ... });
  test("unblockDependents spawns correct agents", () => { ... });
});
```

### 17.3 Manual QA Checklist

```
Setup:
  □ Install Git, verify `git worktree` is available (git >= 2.5)
  □ Configure at least one API key via Swarm Settings

Core Coordination:
  □ Create swarm with 3 tasks (task-2 depends on task-1)
  □ Agents start: verify 3 worktree directories created at .quantum/worktrees/
  □ Verify each agent's PTY CWD is its worktree
  □ Agent-1 writes manifest → UI updates AgentCard within 200ms
  □ Agent-2 writes manifest → AgentCard-2 updates; AgentCard-1 unchanged
  □ Agent-3 (with dep on task-1) stays in "waiting" status until task-1 merges
  □ Kill an agent → status "failed", locks released, Kill worked within 10s
  □ Agent exits cleanly → merge queue runs → branch deleted → worktree removed
  □ Task-2 starts automatically after task-1 merges

Conflict Handling:
  □ Create 2 agents both editing src/auth.ts
  □ Both complete → merge → ConflictResolver appears for second merge
  □ Resolve conflict → merge completes

Recovery:
  □ Start 2 agents → force-kill IDE process → reopen IDE
  □ Reconcile detects agents as alive, re-attaches watchers
  □ Agents complete → merges succeed

Edge Cases:
  □ Delete .quantum/ while swarm runs → recreated on next state write
  □ Write invalid JSON to a manifest → UI shows "stale" not crash
  □ Open same project in two IDE windows → no state corruption
  □ No git binary → clear user-readable error message
```

---

## 18. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Isolation mechanism** | Git worktrees (not branch checkout) | Branches share one working directory — agents overwrite each other's in-progress files. Worktrees give each agent a physically separate directory. This is a correctness requirement, not a preference. |
| **Git operations** | `tokio::process::Command` for writes; `git2-rs` for reads | `git worktree` and `git merge-tree` are not in libgit2's API. Shelling out to git CLI is correct and used by GitButler, Zed, and others. `git2-rs` for cheap read queries (HEAD, status) avoids subprocess overhead. |
| **File watcher** | `notify-rs` directly with `notify-debouncer-mini` | `tauri-plugin-fs-watch` is a JS-facing wrapper. Our watcher lives in Rust. Direct dependency is simpler and avoids a dependency-of-dependency. Debounce at 150ms eliminates FSEvents double-fires. |
| **Keychain** | `keyring-rs` exclusively | OS-native credential storage. No fallback encrypted file (two backends = two security models + DIY encryption). If keyring unavailable, direct users to env vars. |
| **State shape** | `swarm-state.json` merges config + runtime | Two files (original: `swarm-config.json` + `swarm-state.json`) meant two atomic write targets and two reads on startup. Single file, single write, single read. Config section is user-driven; runtime section is coordination-driven. |
| **Context refresh** | Event-driven (on state changes) | Fixed 5s timer writes identical bytes repeatedly and delays context delivery. Events are cheaper and more accurate. Safety fallback: 60s interval writes if no event fired and agent is still running. |
| **Zustand middleware** | `immer` | Nested state mutations (agent.manifest.filesModified, fileLocks[path]) require deep spreads without immer. Immer is the standard Zustand pattern for complex state, documented in Zustand's README. |
| **Mode unification** | No "free-form" vs "structured" code paths | One code path: worktree + context + watcher. The only difference is whether a DAG drives merge order (auto) or the user does (manual button). Simpler to build, simpler to maintain. |
| **`timeline.jsonl`** | NDJSON instead of JSON array | Appending to a JSON array requires reading + parsing + rewriting the whole file. NDJSON: one `writeln!` per event, no read, no parse. |
| **Manifest caching** | Latest valid manifest stored in `swarm-state.json` under `agent.manifest` | Avoids a second file read when the UI needs the manifest. Already parsed and validated. The file on disk is still the authoritative source; this is a cache layer only. |
| **Heartbeat** | 30s interval, 35s timeout | Balances detection speed vs false positives. 35s gives agents running slow API calls time to respond. 30s check ensures we catch it within one interval after timeout. |
| **Merge strategy** | `--no-ff` | Preserves branch history for audit. Every agent's work appears as a distinct merge commit, traceable to the task. |
| **Context.md symlink for Claude Code** | Copy CLAUDE.md into worktree | Claude Code discovers CLAUDE.md via filesystem traversal from its CWD. CWD is the worktree. The `.config/CLAUDE.md` lives outside the worktree. Copy at worktree creation ensures discovery works. Symlinks can confuse some tools across worktree boundaries. |

---

*End. 4 phases. 24 new files. ~1,750 LOC. Zero new frontend dependencies. Two new Rust crates (`notify`, `notify-debouncer-mini`) replacing one Tauri plugin dependency.*