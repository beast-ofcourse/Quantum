import { describe, it, expect } from "vitest";
import {
  getNextTasks,
  detectCycle,
  classifyTasks,
} from "@/lib/swarm/dagEngine";
import type { Task } from "@/types/swarm";

function task(
  id: string,
  status: string,
  dependsOn: string[] = [],
): Task {
  return {
    id,
    description: `Task ${id}`,
    status: status as Task["status"],
    assignedTo: null,
    dependsOn,
    priority: 0,
  };
}

describe("getNextTasks", () => {
  it("basic chain: unblocks task-2 after task-1 completes", () => {
    const tasks = [
      task("task-1", "completed"),
      task("task-2", "blocked", ["task-1"]),
      task("task-3", "blocked", ["task-2"]),
    ];
    const result = getNextTasks(tasks, "task-1");
    expect(result.runnable).toHaveLength(1);
    expect(result.runnable[0].id).toBe("task-2");
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].id).toBe("task-3");
  });

  it("diamond: unblocks both after common dep completes", () => {
    const tasks = [
      task("task-1", "completed"),
      task("task-2", "blocked", ["task-1"]),
      task("task-3", "blocked", ["task-1"]),
      task("task-4", "blocked", ["task-2", "task-3"]),
    ];
    const result = getNextTasks(tasks, "task-1");
    expect(result.runnable).toHaveLength(2);
    const ids = result.runnable.map((t) => t.id).sort();
    expect(ids).toEqual(["task-2", "task-3"]);
  });

  it("parallel: runs independent tasks in any order", () => {
    const tasks = [
      task("task-1", "completed"),
      task("task-2", "pending"),
      task("task-3", "pending"),
    ];
    const result = getNextTasks(tasks, "task-1");
    expect(result.runnable).toHaveLength(0);
  });

  it("does not unblock when dep still blocked", () => {
    const tasks = [
      task("task-1", "completed"),
      task("task-2", "blocked", ["task-1"]),
      task("task-3", "blocked", ["task-2"]),
    ];
    const result = getNextTasks(tasks, "task-1");
    expect(result.runnable).toHaveLength(1);
    expect(result.runnable[0].id).toBe("task-2");
    expect(result.blocked.map((t) => t.id)).toEqual(["task-3"]);
  });

  it("no-op when completed task id not found", () => {
    const tasks = [
      task("task-1", "blocked", ["task-0"]),
    ];
    const result = getNextTasks(tasks, "task-unknown");
    expect(result.runnable).toHaveLength(0);
  });

  it("no-op when all tasks already completed", () => {
    const tasks = [
      task("task-1", "completed"),
    ];
    const result = getNextTasks(tasks, "task-1");
    expect(result.runnable).toHaveLength(0);
  });

  it("handles single task with no deps", () => {
    const tasks = [
      task("task-1", "completed"),
    ];
    const result = getNextTasks(tasks, "task-1");
    expect(result.runnable).toHaveLength(0);
  });
});

describe("classifyTasks", () => {
  it("groups tasks by status", () => {
    const tasks = [
      task("t1", "pending"),
      task("t2", "running"),
      task("t3", "completed"),
      task("t4", "blocked"),
      task("t5", "failed"),
    ];
    const groups = classifyTasks(tasks);
    expect(groups.pending).toHaveLength(1);
    expect(groups.running).toHaveLength(1);
    expect(groups.completed).toHaveLength(1);
    expect(groups.blocked).toHaveLength(1);
    expect(groups.failed).toHaveLength(1);
  });

  it("unknown status defaults to pending", () => {
    const tasks = [
      { ...task("t1", "pending"), status: "unknown" as Task["status"] },
    ];
    const groups = classifyTasks(tasks);
    expect(groups.pending).toHaveLength(1);
  });
});

describe("detectCycle", () => {
  it("no cycle in linear chain", () => {
    const tasks = [
      task("t1", "pending"),
      task("t2", "blocked", ["t1"]),
      task("t3", "blocked", ["t2"]),
    ];
    const result = detectCycle(tasks);
    expect(result.hasCycle).toBe(false);
  });

  it("detects simple 2-node cycle", () => {
    const tasks = [
      task("t1", "pending", ["t2"]),
      task("t2", "blocked", ["t1"]),
    ];
    const result = detectCycle(tasks);
    expect(result.hasCycle).toBe(true);
    expect(result.cycle.length).toBeGreaterThanOrEqual(3);
  });

  it("detects 3-node cycle", () => {
    const tasks = [
      task("t1", "pending", ["t2"]),
      task("t2", "blocked", ["t3"]),
      task("t3", "blocked", ["t1"]),
    ];
    const result = detectCycle(tasks);
    expect(result.hasCycle).toBe(true);
  });

  it("no cycle in diamond", () => {
    const tasks = [
      task("t1", "pending"),
      task("t2", "blocked", ["t1"]),
      task("t3", "blocked", ["t1"]),
      task("t4", "blocked", ["t2", "t3"]),
    ];
    const result = detectCycle(tasks);
    expect(result.hasCycle).toBe(false);
  });

  it("empty list has no cycle", () => {
    const result = detectCycle([]);
    expect(result.hasCycle).toBe(false);
  });

  it("single node has no cycle", () => {
    const result = detectCycle([task("t1", "pending")]);
    expect(result.hasCycle).toBe(false);
  });
});
