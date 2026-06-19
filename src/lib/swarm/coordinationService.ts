import type { AgentManifest, AgentStatus, SwarmState } from "@/types/swarm";
import * as swarmApi from "@/tauri/swarm";
import { useSwarmStore } from "@/stores/swarmStore";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_STALE_MS = 35_000;

const VALID_STATUSES: readonly AgentStatus[] = [
  "idle", "running", "waiting", "merging", "done", "failed", "dead",
];

export class CoordinationService {
  private projectRoot = "";
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  init(projectRoot: string): void {
    this.projectRoot = projectRoot;
    this.startHeartbeat();
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ── 4.6.1 + 4.6.2 — Manifest handling ───────────────

  onManifestChanged(agentId: string, manifest: AgentManifest): void {
    const store = useSwarmStore.getState();
    const coercedManifest: AgentManifest = {
      ...manifest,
      status: this.coerceStatus(manifest.status),
    };
    store.updateAgentManifest(agentId, coercedManifest);

    const state = store.state;
    if (state?.agents[agentId]?.status === "running") {
      void this.refreshOtherAgents(agentId, state);
    }
  }

  private coerceStatus(status: string): string {
    if (VALID_STATUSES.includes(status as AgentStatus)) {
      return status;
    }
    return "running";
  }

  // ── 4.2.2 — Agent exit handling ─────────────────────

  async onAgentExit(agentId: string, exitCode: number): Promise<void> {
    const store = useSwarmStore.getState();
    const newStatus: AgentStatus = exitCode === 0 ? "done" : "failed";
    store.updateAgentStatus(agentId, newStatus);

    store.appendTimelineEvent({
      t: new Date().toISOString(),
      agent: agentId,
      type: exitCode === 0 ? "completed" : "failed",
      detail: `Exit code: ${exitCode}`,
    });

    // Release file locks
    if (store.state) {
      const locks = { ...store.state.fileLocks };
      for (const [file, lock] of Object.entries(locks)) {
        if (lock.lockedBy === agentId) {
          delete locks[file];
        }
      }
      store.setState({
        ...store.state,
        fileLocks: locks,
      });
    }

    if (exitCode !== 0) return;

    await this.processMerge(agentId);
  }

  // ── 4.4.1 — Merge processing ────────────────────────

  private async processMerge(agentId: string): Promise<void> {
    const store = useSwarmStore.getState();
    try {
      const check = await swarmApi.checkMerge(this.projectRoot, agentId);

      if (check.hasConflict) {
        store.updateAgentStatus(agentId, "merging");
        store.appendTimelineEvent({
          t: new Date().toISOString(),
          agent: agentId,
          type: "conflict",
          detail: `Conflict in: ${check.conflictFiles.join(", ")}`,
        });
        if (store.state) {
          store.setState({
            ...store.state,
            phase: "conflict",
          });
        }
        return;
      }

      store.updateAgentStatus(agentId, "merging");
      store.updateMergeQueueItem(agentId, "merging");

      await swarmApi.mergeAgent(this.projectRoot, agentId);

      store.updateAgentStatus(agentId, "done");
      store.updateMergeQueueItem(agentId, "merged");

      store.appendTimelineEvent({
        t: new Date().toISOString(),
        agent: agentId,
        type: "merged",
        detail: "Branch merged into main",
      });

      this.markTaskCompleted(agentId);
      await this.unblockDependents(agentId);
    } catch (err) {
      console.error(`[coordination] merge failed for ${agentId}:`, err);
      store.updateAgentStatus(agentId, "failed");
    }
  }

  private markTaskCompleted(agentId: string): void {
    const store = useSwarmStore.getState();
    if (!store.state) return;
    const agent = store.state.agents[agentId];
    if (!agent) return;
    store.setState({
      ...store.state,
      tasks: store.state.tasks.map((t) =>
        t.id === agent.taskId ? { ...t, status: "completed" } : t,
      ),
    });
  }

  // ── 4.5.2 — Dependency unblocking ───────────────────

  private async unblockDependents(completedAgentId: string): Promise<void> {
    const store = useSwarmStore.getState();
    if (!store.state) return;

    const completedAgent = store.state.agents[completedAgentId];
    const completedTask = store.state.tasks.find(
      (t) => t.id === completedAgent?.taskId,
    );
    if (!completedTask) return;

    const unblocked = store.state.tasks.filter((task) => {
      if (task.status !== "pending") return false;
      if (!task.dependsOn.includes(completedTask.id)) return false;
      return task.dependsOn.every((depId) => {
        const dep = store.state!.tasks.find((t) => t.id === depId);
        return dep?.status === "completed";
      });
    });

    for (const task of unblocked) {
      if (task.assignedTo) {
        try {
          await swarmApi.spawnAgentPty(this.projectRoot, task.assignedTo);
          store.updateAgentStatus(task.assignedTo, "running");
          store.appendTimelineEvent({
            t: new Date().toISOString(),
            agent: task.assignedTo,
            type: "started",
            detail: task.description,
          });
        } catch (err) {
          console.error(
            `[coordination] failed to spawn ${task.assignedTo}:`,
            err,
          );
        }
      }
    }
  }

  // ── 4.2.3 — Context refresh ─────────────────────────

  async refreshContext(agentId: string): Promise<void> {
    const store = useSwarmStore.getState();
    if (!store.state) return;

    const content = this.buildContextMd(agentId, store.state);
    try {
      await swarmApi.writeAgentContext(this.projectRoot, agentId, content);
    } catch (err) {
      // 4.3.3 — .quantum/ may have been deleted, try to recreate
      try {
        await swarmApi.recreateQuantumDir(this.projectRoot);
        await swarmApi.writeAgentContext(this.projectRoot, agentId, content);
      } catch {
        console.error("[coordination] context write failed after retry:", err);
      }
    }
  }

  private async refreshOtherAgents(
    changedAgentId: string,
    state: SwarmState,
  ): Promise<void> {
    for (const [id, agent] of Object.entries(state.agents)) {
      if (id !== changedAgentId && agent.status === "running") {
        await this.refreshContext(id);
      }
    }
  }

  // ── 4.2 — Heartbeat ─────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      void this.checkHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async checkHeartbeat(): Promise<void> {
    const store = useSwarmStore.getState();
    if (!store.state) return;

    const now = Date.now();

    for (const [id, agent] of Object.entries(store.state.agents)) {
      if (agent.status !== "running") continue;

      if (!agent.heartbeatAt) {
        // 4.2.3 — No heartbeat yet — write context.md as safety catch
        await this.refreshContext(id);
        continue;
      }

      const heartbeatTime = new Date(agent.heartbeatAt).getTime();
      const age = now - heartbeatTime;

      if (age > HEARTBEAT_STALE_MS) {
        // 4.2.4 — Log heartbeat event
        store.appendTimelineEvent({
          t: new Date().toISOString(),
          agent: id,
          type: "heartbeat_stale",
          detail: `No manifest update in ${Math.round(age / 1000)}s`,
        });

        // 4.2.1 — Check if PID is actually alive
        if (agent.pid && agent.pid > 0) {
          try {
            const alive = await swarmApi.isPidAlive(agent.pid);
            if (!alive) {
              // 4.2.2 — PID dead — mark agent dead, release locks
              this.handleDeadAgent(store, id);
              continue;
            }
          } catch {
            console.warn(`[coordination] PID check failed for ${id}`);
          }
        }

        // 4.2.3 — PID alive but stale — write context.md as safety catch
        await this.refreshContext(id);
      }
    }
  }

  private handleDeadAgent(
    store: ReturnType<typeof useSwarmStore.getState>,
    agentId: string,
  ): void {
    store.updateAgentStatus(agentId, "dead");

    if (store.state) {
      const locks = { ...store.state.fileLocks };
      for (const [file, lock] of Object.entries(locks)) {
        if (lock.lockedBy === agentId) {
          delete locks[file];
        }
      }
      store.setState({
        ...store.state,
        fileLocks: locks,
      });
    }

    store.appendTimelineEvent({
      t: new Date().toISOString(),
      agent: agentId,
      type: "agent_died",
      detail: "Process dead — locks released",
    });
  }

  // ── 4.6.4 — Context builder ─────────────────────────

  buildContextMd(agentId: string, state: SwarmState): string {
    const agent = state.agents[agentId];
    if (!agent) return "";

    const task = state.tasks.find((t) => t.id === agent.taskId);
    const otherAgents = Object.values(state.agents).filter(
      (a) => a.id !== agentId,
    );

    const agentTable = otherAgents
      .map(
        (a) =>
          `| ${a.id} | ${task?.description ?? "N/A"} | ${a.status} | ${(a.manifest?.filesModified ?? []).join(", ")} |`,
      )
      .join("\n");

    const lockTable = Object.entries(state.fileLocks)
      .map(([file, lock]) => `| ${file} | ${lock.lockedBy} | ${lock.lockedAt} |`)
      .join("\n");

    return [
      `# Task`,
      task?.description ?? "No task assigned",
      "",
      "# Your Environment",
      `- Worktree: ${agent.worktreePath} (this is your working directory)`,
      `- Branch:   ${agent.branch} (already checked out)`,
      `- Agent ID: ${agent.id}`,
      `- Model:    ${agent.model}`,
      "",
      otherAgents.length > 0
        ? [
            "# Other Active Agents",
            "| Agent | Task | Status | Files |",
            "|---|---|---|---|",
            agentTable,
          ].join("\n")
        : "",
      Object.keys(state.fileLocks).length > 0
        ? [
            "",
            "# Advisory File Locks",
            "| File | Held By | Since |",
            "|---|---|---|",
            lockTable,
          ].join("\n")
        : "",
      "",
      "# Protocol",
      "1. Work freely in this directory — all files are yours (git isolated worktree).",
      "2. Do NOT run `git checkout` or `git worktree` commands.",
      "3. Write status periodically to: " +
        `../../agents/${agent.id}/manifest.json`,
      `   Format: {"status":"running","currentThought":"...","filesModified":["src/auth.ts"]}`,
      "4. Exit your process when the task is complete.",
    ]
      .filter(Boolean)
      .join("\n");
  }
}

export const coordinationService = new CoordinationService();

export function buildContextMd(agentId: string, state: SwarmState): string {
  return coordinationService.buildContextMd(agentId, state);
}
