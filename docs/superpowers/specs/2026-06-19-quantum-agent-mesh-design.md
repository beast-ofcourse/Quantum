# Quantum Agent Mesh — Design Spec

**Date:** 2026-06-19
**Status:** Draft
**Feature:** Multi-agent coordination system with Graphify-powered context sharing

---

## Overview

Quantum Agent Mesh turns the integrated terminal into a **first-class multi-agent hub**. Users run any CLI AI agent (Claude Code, OpenCode, Codex, KiloCode, Cline, etc.) in dedicated terminal tabs. The IDE provides real-time coordination: task tracking, file conflict prevention, cross-agent awareness, and persistent project memory via Graphify.

---

## Core Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        QUANTUM IDE                                │
│                                                                  │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐ │
│  │   Agent Hub Panel    │   │         Editor Area              │ │
│  │  ┌─────────────────┐│   │  ┌──────┐ ┌──────┐ ┌──────┐    │ │
│  │  │ Tab 1: Auth refab││   │  │auth◆│ │pay.ts│ │READM│    │ │
│  │  │ Tab 2: Payment t ││   │  │(lock)│ │      │ │     │    │ │
│  │  │ Tab 3: README upd││   │  └──────┘ └──────┘ └──────┘    │ │
│  │  └─────────────────┘│   └──────────────────────────────────┘ │
│  └─────────────────────┘                                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Terminal Area                                             │   │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────┐  │   │
│  │  │ Tab 1: Auth ⚡   │ │ Tab 2: Payment   │ │ Tab 3:   │  │   │
│  │  │ [opencode...]    │ │ [claude code...] │ │ [codex..]│  │   │
│  │  └──────────────────┘ └──────────────────┘ └──────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Internal: Coordination Service ←→ Graphify Engine               │
└──────────────────────────────────────────────────────────────────┘
```

---

## The Quantum Agent Protocol

Each terminal session gets a dedicated directory under `.quantum/agents/<session-id>/`:

```
.quantum/agents/
├── agent-abc123/
│   ├── context.md         # WRITTEN BY IDE: other agents, locked files, project state
│   ├── manifest.json      # WRITTEN BY AGENT: task, status, files, thinking
│   └── graph-patch.json   # WRITTEN BY AGENT: new knowledge graph nodes/edges
├── agent-def456/
│   ├── context.md
│   ├── manifest.json
│   └── graph-patch.json
└── ...
```

### context.md (IDE writes)

```markdown
# Agent Context — agent-abc123

## Other Agents
- agent-def456: "Add payment tests" — editing pay.test.ts, pay.ts
- agent-ghi789: "Update README" — done

## Locked Files
- pay.ts → agent-def456 (write-lock)
- auth.ts, auth.test.ts → free

## Project Graph
Run `graphify query "..."` to ask questions about the codebase.
Last graph update: 2026-06-19T10:30:00Z
```

### manifest.json (Agent writes)

```json
{
  "agentId": "agent-abc123",
  "task": "Refactor auth module to use JWT",
  "status": "running",
  "filesRead": ["src/auth/auth.ts", "src/auth/types.ts"],
  "filesWritten": ["src/auth/auth.ts"],
  "currentThinking": "Replacing bcrypt with argon2, need to update tests",
  "lockedFiles": ["src/auth/auth.ts"],
  "lastUpdated": "2026-06-19T10:35:00Z"
}
```

### graph-patch.json (Agent writes)

```json
{
  "nodes": [
    {"id": "auth:jwt", "label": "JWT Auth", "type": "concept"},
    {"id": "src/auth/auth.ts", "label": "auth.ts", "type": "file"}
  ],
  "edges": [
    {"from": "src/auth/auth.ts", "to": "auth:jwt", "label": "implements"},
    {"from": "auth:jwt", "to": "auth:bcrypt-old", "label": "replaces"}
  ]
}
```

### Environment Variable

Every terminal gets `QUANTUM_AGENT_CONTEXT=.quantum/agents/agent-abc123/` injected into the PTY environment. Agents configured via AGENTS.md / CLAUDE.md / .opencode.json read this path to participate.

---

## Agent Detection & Configuration

### Auto-detection

When terminal output matches known agent patterns, Quantum marks the tab:

| Agent     | Detection Pattern                       |
|-----------|----------------------------------------|
| OpenCode  | `opencode` or logo in output           |
| Claude Code | `Claude Code` or `claude` in prompt |
| Codex     | `codex` or `@codex` in output          |
| KiloCode  | `kilocode` match                       |
| Cline     | `cline` match                          |
| Aider     | `aider` match                          |

Detected agents get a **badge icon** on the terminal tab.

### Agent Config Injection

For agents that support config files, Quantum auto-generates the appropriate config in `.quantum/agents/.config/`:

- **OpenCode:** `.quantum/agents/.config/opencode.md` with QUANTUM_AGENT_CONTEXT instructions
- **Claude Code:** `.quantum/agents/.config/CLAUDE.md` with protocol instructions
- **Codex:** `.quantum/agents/.config/.codexconfig` with protocol instructions

---

## Components

### Zustand Store: `agentStore.ts`

```typescript
interface AgentManifest {
  agentId: string;
  task: string;
  status: 'running' | 'idle' | 'done' | 'error';
  filesRead: string[];
  filesWritten: string[];
  currentThinking?: string;
  lockedFiles: string[];
  lastUpdated: string;
}

interface AgentSession {
  id: string;
  terminalId: string;
  manifest: AgentManifest;
  type: AgentType | 'unknown';
  createdAt: string;
  label?: string; // user-assigned label
}
```

**State:** `agents: AgentSession[]`, `fileLocks: Map<string, string>` (filepath → agentId), `timeline: TimelineEntry[]`

**Actions:** `registerAgent`, `updateManifest`, `lockFile`, `unlockFile`, `assignTask`, `clearAgent`

### Agent Hub Panel

**Location:** Activity bar → new Agent icon (between Git and Extensions)

**Components:**
- `AgentHubPanel.tsx` — main panel container
- `AgentCard.tsx` — per-agent card with task, status, files, thinking
- `FileLockBadge.tsx` — shows lock icon on locked files in explorer
- `AgentTimeline.tsx` — chronological event log across all agents
- `TaskAssigner.tsx` — input to label a terminal with a task

**States:**
- **Empty:** "No agents running. Open a terminal and start your favorite AI agent."
- **List:** Cards for each active agent, sorted by activity
- **Conflict:** Red highlight + warning toast when 2 agents touch same file
- **Done:** Green checkmark, dimmed card

### File Lock Manager

**Module:** `src/lib/agent/fileLockManager.ts`

- Maintains `Map<string, string>` of filepath → agentId
- Watches `manifest.json` files for `lockedFiles` updates
- Emits events:
  - `file:locked` — lock icon appears in explorer + editor tab
  - `file:conflict` — two agents locking same file → terminal warning + toast + editor highlight
- **Editor integration:** Monaco editor margin decorator shows lock icon + agent name on locked file lines

### Coordination Service

**Module:** `src/lib/agent/coordinationService.ts`

- Watches `.quantum/agents/` directory for changes via Tauri `plugin-fs` watch
- Polls `manifest.json` files every 1s for active agents (or uses fs watch events)
- Reads `graph-patch.json` and merges into the in-memory Graphify graph via `src/lib/graphify/bridge.ts`
- Writes `context.md` for each agent every 5s (or on any state change)
- Handles agent lifecycle: register on first manifest.json, cleanup on terminal close

### Graphify Bridge

**Module:** `src/lib/graphify/bridge.ts`

- Loads `graphify-out/graph.json` on IDE startup
- Provides `query(query: string): GraphResult` — runs graph traversal queries
- Provides `path(from: string, to: string): Edge[]` — finds paths between nodes
- Provides `explain(node: string): string` — summarizes a node
- `applyPatch(patch: GraphPatch)` — merges agent graph-patch into live graph
- `exportGraph()` — writes updated graph back to `graphify-out/graph.json`
- Token savings: agents query graph instead of reading raw files → ~71x fewer tokens

### Activity Timeline

**Module:** `src/stores/timelineStore.ts`

```
[10:30] Tab 1 (OpenCode) started task: "Refactor auth"
[10:31] Tab 1 read src/auth/auth.ts
[10:32] Tab 1 wrote src/auth/auth.ts
[10:32] Tab 1 locked src/auth/auth.ts
[10:33] Tab 2 (Claude Code) started task: "Add payment tests"
[10:34] Tab 2 tried to read auth.ts → ⚠️ Locked by Tab 1
[10:35] Tab 1 unlocked src/auth/auth.ts
[10:35] Tab 1 graph-patch merged (3 new nodes, 2 new edges)
```

Timeline persisted to `.quantum/timeline.json` for cross-session reference.

---

## User Flows

### Flow 1: Start Multi-Agent Session

1. User opens 3 terminals via `Ctrl+Shift+` `` ` ``
2. Each terminal labeled via Agent Hub: "Auth refactor", "Payment tests", "README"
3. Labels written to `.quantum/agents/<id>/context.md` for agent awareness
4. User starts OpenCode in Tab 1, Claude Code in Tab 2, Codex in Tab 3
5. Each agent is auto-detected → badge appears on tab
6. Agent Hub shows 3 cards with tasks, status, files

### Flow 2: Conflict Prevention

1. Tab 1 (Auth refactor) writes `manifest.json` with `lockedFiles: ["src/auth/auth.ts"]`
2. IDE adds lock icon to `src/auth/auth.ts` in explorer + editor tab
3. Tab 2 tries to `cat src/auth/auth.ts` → no block (read is fine)
4. Tab 2's agent reads context.md → knows Tab 1 has the file
5. If Tab 2 tries to edit → file lock warning in terminal + toast notification
6. When Tab 1 finishes, lock released → Tab 2 gets notification

### Flow 3: Graphify Context Query

1. Tab 2 starts its task
2. Before writing code, agent queries Graphify: `graphify query "How does auth currently work?"`
3. Graph returns structured answer: "Auth uses bcrypt in auth.ts, depends on userStore, exports login/logout/register"
4. Agent writes code, updates graph-patch with new nodes
5. Tab 3 can then query: `graphify query "What changed in auth system?"` → sees Tab 1's changes

### Flow 4: Cross-Session Memory

1. User closes IDE, comes back tomorrow
2. Graphify graph is persisted in `graphify-out/`
3. `.quantum/timeline.json` shows yesterday's session
4. User starts new agent → agent queries graph → "Yesterday Tab 1 refactored auth to JWT"
5. Agent picks up where yesterday's session left off

---

## Edge Cases

| Case | Handling |
|------|----------|
| Agent doesn't write manifest.json | IDE falls back to fs watch + git event detection |
| Terminal closed abruptly | Cleanup on terminal unmount; stale agents shown as "disconnected" |
| Two agents lock same file | Warning in both terminals, red highlight in editor, user must resolve |
| Graphify not installed | Graceful degradation — coordination works without graph |
| .quantum/agents/ directory deleted | Recreated on next agent registration |
| Agent idles for 30+ min | Marked as "stale" in Agent Hub, context.md notes inactivity |
| Large graph (100k+ nodes) | Graphify bridge caches queries, debounces writes |
| No AI agent running in terminal | Terminal tab shows no badge, Agent Hub ignores it |

---

## Implementation Plan

### Phase 1: Foundation (Days 1-3)
1. Create `agentStore.ts` with Zustand — session tracking, manifests, file locks
2. Create `fileLockManager.ts` — lock/unlock, conflict detection, events
3. Create `AgentHubPanel.tsx` — sidebar panel with agent cards (hardcoded data first)
4. Wire terminal lifecycle to agent registration (terminal open → agent created)

### Phase 2: Agent Protocol (Days 4-6)
1. Create `coordinationService.ts` — watches `.quantum/agents/`, reads manifests
2. Create `context.md` writer — informs agents about each other
3. Implement `QUANTUM_AGENT_CONTEXT` env var injection into PTY
4. Create auto-generated config files (AGENTS.md, CLAUDE.md, etc.)
5. Agent auto-detection from terminal output

### Phase 3: Editor Integration (Days 7-9)
1. File lock decorators in Monaco editor margin
2. Lock icons in file explorer tree
3. Conflict toast notifications
4. Editor auto-reveal on agent file write (optional setting)
5. Task label editing in Agent Hub

### Phase 4: Graphify Integration (Days 10-12)
1. Create `src/lib/graphify/bridge.ts` — load, query, patch, export
2. Wire `graph-patch.json` reading into bridge
3. Agent startup context loading from graph
4. Timeline persistence to `.quantum/timeline.json`
5. Graph visualization mini-panel in Agent Hub

### Phase 5: Polish (Days 13-15)
1. Activity Timeline component
2. Agent Hub empty/loading/error states
3. Keyboard shortcuts for Agent Hub (`Ctrl+Shift+A`)
4. Performance tuning — debounce manifest polling, batch updates
5. Testing — unit tests for all stores, integration test for protocol

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/stores/agentStore.ts` | Agent session state |
| `src/stores/timelineStore.ts` | Activity timeline |
| `src/lib/agent/fileLockManager.ts` | File conflict detection |
| `src/lib/agent/coordinationService.ts` | Agent protocol service |
| `src/lib/agent/agentDetector.ts` | Agent type detection |
| `src/lib/agent/configInjector.ts` | Auto-generate agent configs |
| `src/lib/graphify/bridge.ts` | Graphify query/patch/export |
| `src/lib/graphify/types.ts` | Graphify type definitions |
| `src/components/agent/AgentHubPanel.tsx` | Sidebar panel |
| `src/components/agent/AgentCard.tsx` | Per-agent card |
| `src/components/agent/AgentTimeline.tsx` | Timeline view |
| `src/components/agent/TaskAssigner.tsx` | Task label input |
| `src/components/agent/FileLockBadge.tsx` | Lock decorator |
| `src/components/layout/ActivityBar.tsx` | **(MODIFY)** Add Agent icon |

## Files to Modify

| File | Change |
|------|--------|
| `src/stores/terminalStore.ts` | Add `agentId` to terminal sessions |
| `src/components/layout/ActivityBar.tsx` | Add Agent Hub icon |
| `src/components/terminal/Terminal.tsx` | Pass `QUANTUM_AGENT_CONTEXT` env var |
| `src/tauri/pty.ts` | Accept extra env vars for spawn |
| `src-tauri/src/commands/pty.rs` | Forward extra env vars to PTY |
