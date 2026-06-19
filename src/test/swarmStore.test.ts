import { describe, it, expect, beforeEach } from "vitest";
import { useSwarmStore } from "@/stores/swarmStore";
import type { SwarmState, AgentInfo, TimelineEvent } from "@/types/swarm";

function makeMockState(): SwarmState {
  return {
    version: 1,
    swarmId: "swarm_test",
    name: "Test Swarm",
    createdAt: "2026-01-01T00:00:00.000Z",
    phase: "executing",
    config: {
      defaultAgent: "opencode",
      defaultModel: "deepseek-v4-flash-free",
      quickPresets: [],
      modelOptions: {},
    },
    agents: {
      "agent-1": {
        id: "agent-1",
        type: "opencode",
        model: "deepseek-v4-flash-free",
        taskId: "task-1",
        status: "running",
        pid: 12345,
        sessionId: "term_abc",
        worktreePath: "/tmp/worktrees/agent-1",
        branch: "swarm/agent-1",
        dependsOn: [],
        heartbeatAt: "2026-01-01T00:00:00.000Z",
        exitCode: null,
        manifest: { status: "running", currentThought: "working" },
      },
      "agent-2": {
        id: "agent-2",
        type: "kilocode",
        model: "deepseek-v4-flash-free",
        taskId: "task-2",
        status: "waiting",
        pid: null,
        sessionId: null,
        worktreePath: "/tmp/worktrees/agent-2",
        branch: "swarm/agent-2",
        dependsOn: ["task-1"],
        heartbeatAt: null,
        exitCode: null,
        manifest: { status: "running" },
      },
    },
    tasks: [
      {
        id: "task-1",
        description: "Refactor auth.ts",
        status: "running",
        assignedTo: "agent-1",
        dependsOn: [],
        priority: 1,
      },
      {
        id: "task-2",
        description: "Write tests",
        status: "pending",
        assignedTo: "agent-2",
        dependsOn: ["task-1"],
        priority: 2,
      },
    ],
    fileLocks: {
      "src/auth.ts": { lockedBy: "agent-1", lockedAt: "2026-01-01T00:00:00.000Z" },
    },
    mergeQueue: [
      { agentId: "agent-1", branch: "swarm/agent-1", taskId: "task-1", status: "pending" },
    ],
  };
}

beforeEach(() => {
  useSwarmStore.setState(useSwarmStore.getInitialState());
});

describe("swarmStore", () => {
  it("starts with null state", () => {
    expect(useSwarmStore.getState().state).toBeNull();
    expect(useSwarmStore.getState().timeline).toEqual([]);
    expect(useSwarmStore.getState().isLoading).toBe(false);
  });

  it("setState replaces state", () => {
    const state = makeMockState();
    useSwarmStore.getState().setState(state);
    expect(useSwarmStore.getState().state?.swarmId).toBe("swarm_test");
    expect(useSwarmStore.getState().state?.phase).toBe("executing");
  });

  it("updateAgentManifest updates nested agent manifest", () => {
    useSwarmStore.getState().setState(makeMockState());
    useSwarmStore.getState().updateAgentManifest("agent-1", {
      status: "running",
      currentThought: "Refactoring verifyToken()",
      filesModified: ["src/auth.ts", "src/jwt.ts"],
    });

    const agent = useSwarmStore.getState().state?.agents["agent-1"];
    expect(agent?.manifest.currentThought).toBe("Refactoring verifyToken()");
    expect(agent?.manifest.status).toBe("running");
  });

  it("updateAgentManifest creates file locks from filesModified", () => {
    useSwarmStore.getState().setState(makeMockState());
    useSwarmStore.getState().updateAgentManifest("agent-1", {
      status: "running",
      filesModified: ["src/newfile.ts"],
    });

    const locks = useSwarmStore.getState().state?.fileLocks;
    expect(locks?.["src/newfile.ts"]?.lockedBy).toBe("agent-1");
  });

  it("updateAgentStatus updates agent status", () => {
    useSwarmStore.getState().setState(makeMockState());
    useSwarmStore.getState().updateAgentStatus("agent-1", "done");

    expect(useSwarmStore.getState().state?.agents["agent-1"].status).toBe("done");
  });

  it("markManifestError sets _parseError flag without clearing manifest", () => {
    useSwarmStore.getState().setState(makeMockState());
    useSwarmStore.getState().markManifestError("agent-1");

    const manifest = useSwarmStore.getState().state?.agents["agent-1"].manifest;
    expect(manifest?._parseError).toBe(true);
    expect(manifest?.status).toBe("running");
  });

  it("appendTimelineEvent adds event to timeline", () => {
    const event: TimelineEvent = {
      t: "2026-01-01T00:00:00.000Z",
      agent: "agent-1",
      type: "started",
      detail: "Task started",
    };
    useSwarmStore.getState().appendTimelineEvent(event);
    expect(useSwarmStore.getState().timeline).toHaveLength(1);
    expect(useSwarmStore.getState().timeline[0].type).toBe("started");

    useSwarmStore.getState().appendTimelineEvent({
      ...event,
      type: "completed",
    });
    expect(useSwarmStore.getState().timeline).toHaveLength(2);
  });

  it("updateMergeQueueItem updates merge queue item status", () => {
    useSwarmStore.getState().setState(makeMockState());
    useSwarmStore.getState().updateMergeQueueItem("agent-1", "merging");

    const item = useSwarmStore.getState().state?.mergeQueue[0];
    expect(item?.status).toBe("merging");
  });

  it("updateAgentManifest on unknown agent is no-op", () => {
    useSwarmStore.getState().setState(makeMockState());
    useSwarmStore.getState().updateAgentManifest("agent-unknown", {
      status: "running",
    });

    expect(useSwarmStore.getState().state?.agents["agent-unknown"]).toBeUndefined();
  });

  it("updateAgentStatus on unknown agent is no-op", () => {
    useSwarmStore.getState().setState(makeMockState());
    useSwarmStore.getState().updateAgentStatus("agent-unknown", "done");

    const state = useSwarmStore.getState().state;
    expect(state).not.toBeNull();
    expect(state?.agents["agent-1"].status).toBe("running");
  });
});
