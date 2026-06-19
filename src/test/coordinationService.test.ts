import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSwarmStore } from "@/stores/swarmStore";
import { CoordinationService, buildContextMd } from "@/lib/swarm/coordinationService";
import type { SwarmState } from "@/types/swarm";

vi.mock("@/tauri/swarm", () => ({
  checkMerge: vi.fn(),
  mergeAgent: vi.fn(),
  spawnAgentPty: vi.fn(),
  writeAgentContext: vi.fn(),
}));

function makeState(): SwarmState {
  return {
    version: 1,
    swarmId: "swarm_test",
    name: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    phase: "executing",
    config: { defaultAgent: "opencode", defaultModel: "deepseek-v4-flash-free", quickPresets: [], modelOptions: {} },
    agents: {
      "agent-1": {
        id: "agent-1",
        type: "opencode",
        model: "deepseek-v4-flash-free",
        taskId: "task-1",
        status: "running",
        pid: 123,
        sessionId: "sess-1",
        worktreePath: "/wt/agent-1",
        branch: "swarm/agent-1",
        dependsOn: [],
        heartbeatAt: new Date().toISOString(),
        exitCode: null,
        manifest: { status: "running" },
      },
      "agent-2": {
        id: "agent-2",
        type: "opencode",
        model: "deepseek-v4-flash-free",
        taskId: "task-2",
        status: "waiting",
        pid: null,
        sessionId: null,
        worktreePath: "/wt/agent-2",
        branch: "swarm/agent-2",
        dependsOn: ["task-1"],
        heartbeatAt: null,
        exitCode: null,
        manifest: {},
      },
    },
    tasks: [
      { id: "task-1", description: "Task one", status: "in_progress", assignedTo: "agent-1", dependsOn: [], priority: 1 },
      { id: "task-2", description: "Task two", status: "pending", assignedTo: "agent-2", dependsOn: ["task-1"], priority: 2 },
    ],
    fileLocks: {},
    mergeQueue: [
      { agentId: "agent-1", branch: "swarm/agent-1", taskId: "task-1", status: "pending" },
    ],
  };
}

beforeEach(() => {
  useSwarmStore.setState(useSwarmStore.getInitialState());
  vi.clearAllMocks();
});

describe("buildContextMd", () => {
  it("builds context for an agent with task description", () => {
    const state = makeState();
    const ctx = buildContextMd("agent-1", state);

    expect(ctx).toContain("# Task");
    expect(ctx).toContain("Task one");
    expect(ctx).toContain("# Your Environment");
    expect(ctx).toContain("/wt/agent-1");
    expect(ctx).toContain("# Protocol");
    expect(ctx).toContain("Exit your process when the task is complete");
  });

  it("includes other active agents section when other agents exist", () => {
    const state = makeState();
    const ctx = buildContextMd("agent-1", state);

    expect(ctx).toContain("# Other Active Agents");
    expect(ctx).toContain("agent-2");
  });

  it("omits other agents section when no other agents", () => {
    const state = makeState();
    state.agents = {
      "agent-1": state.agents["agent-1"],
    };
    const ctx = buildContextMd("agent-1", state);
    expect(ctx).not.toContain("# Other Active Agents");
  });

  it("returns empty string for unknown agent", () => {
    const state = makeState();
    const ctx = buildContextMd("agent-unknown", state);
    expect(ctx).toBe("");
  });

  it("includes advisory file locks when present", () => {
    const state = makeState();
    state.fileLocks = {
      "src/auth.ts": { lockedBy: "agent-1", lockedAt: "2026-01-01T00:00:00.000Z" },
    };
    const ctx = buildContextMd("agent-1", state);
    expect(ctx).toContain("# Advisory File Locks");
    expect(ctx).toContain("src/auth.ts");
  });
});

describe("CoordinationService", () => {
  it("buildContextMd returns non-empty string for valid agent", () => {
    const svc = new CoordinationService();
    const state = makeState();
    const ctx = svc.buildContextMd("agent-1", state);
    expect(ctx.length).toBeGreaterThan(100);
    expect(ctx).toContain("agent-1");
  });
});
