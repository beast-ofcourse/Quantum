import type { AgentManifest, AgentStatus, SwarmState, TimelineEvent } from "@/types/swarm";
import * as swarmApi from "@/tauri/swarm";
import { useSwarmStore } from "@/stores/swarmStore";
import { useTerminalStore } from "@/stores/terminalStore";

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

  onManifestChanged(agentId: string, manifest: AgentManifest): void {
    const store = useSwarmStore.getState();
    store.updateAgentManifest(agentId, manifest);

    const state = store.state;
    if (state?.agents[agentId]?.status === "running") {
      void this.refreshOtherAgents(agentId, state);
    }
  }

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

    if (exitCode !== 0) return;

    await this.processMerge(agentId);
  }

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

  async refreshContext(agentId: string): Promise<void> {
    const store = useSwarmStore.getState();
    if (!store.state) return;

    const content = this.buildContextMd(agentId, store.state);
    await swarmApi.writeAgentContext(this.projectRoot, agentId, content);
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

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      void this.checkHeartbeat();
    }, 30_000);
  }

  private async checkHeartbeat(): Promise<void> {
    const store = useSwarmStore.getState();
    if (!store.state) return;

    const now = Date.now();
    for (const [id, agent] of Object.entries(store.state.agents)) {
      if (agent.status !== "running") continue;
      if (!agent.heartbeatAt) continue;

      const heartbeatTime = new Date(agent.heartbeatAt).getTime();
      if (now - heartbeatTime > 35_000) {
        store.appendTimelineEvent({
          t: new Date().toISOString(),
          agent: id,
          type: "heartbeat_stale",
          detail: "No manifest update in 35s",
        });

        await this.refreshContext(id);
      }
    }
  }

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
