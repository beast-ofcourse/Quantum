import type { Task, TaskStatus } from "@/types/swarm";

export interface DagResult {
  runnable: Task[];
  blocked: Task[];
}

export interface CycleResult {
  hasCycle: boolean;
  cycle: string[];
}

function buildAdjacencyList(tasks: Task[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    if (!adj.has(t.id)) adj.set(t.id, []);
    for (const dep of t.dependsOn) {
      const neighbors = adj.get(dep) ?? [];
      neighbors.push(t.id);
      adj.set(dep, neighbors);
    }
  }
  return adj;
}

function findReverseDeps(
  tasks: Task[],
  completedTaskId: string,
): Task[] {
  const store = new Map<string, Task>();
  for (const t of tasks) store.set(t.id, t);

  const completed = store.get(completedTaskId);
  if (!completed) return [];

  const unblocked: Task[] = [];

  for (const t of tasks) {
    if (t.status !== "blocked") continue;
    if (!t.dependsOn.includes(completedTaskId)) continue;
    const allDepsMet = t.dependsOn.every((depId) => {
      const dep = store.get(depId);
      return dep && dep.status === "completed";
    });
    if (allDepsMet) unblocked.push(t);
  }

  return unblocked;
}

export function getNextTasks(tasks: Task[], completedTaskId: string): DagResult {
  const newlyRunnable = findReverseDeps(tasks, completedTaskId);

  const blocked: Task[] = [];
  const runnable: Task[] = [];

  for (const t of newlyRunnable) {
    runnable.push(t);
  }

  for (const t of tasks) {
    if (t.status === "blocked" && !newlyRunnable.some((r) => r.id === t.id)) {
      blocked.push(t);
    }
  }

  return { runnable, blocked };
}

export function classifyTasks(tasks: Task[]): {
  pending: Task[];
  running: Task[];
  completed: Task[];
  failed: Task[];
  blocked: Task[];
} {
  const groups = {
    pending: [] as Task[],
    running: [] as Task[],
    completed: [] as Task[],
    failed: [] as Task[],
    blocked: [] as Task[],
  };

  for (const t of tasks) {
    const key = t.status as TaskStatus;
    if (key in groups) {
      groups[key].push(t);
    } else {
      groups.pending.push(t);
    }
  }

  return groups;
}

export function detectCycle(tasks: Task[]): CycleResult {
  const adj = buildAdjacencyList(tasks);
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string, path: string[]): string[] | null {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adj.get(node) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        const result = dfs(next, path);
        if (result) return result;
      } else if (recStack.has(next)) {
        const cycle = path.slice(path.indexOf(next));
        cycle.push(next);
        return cycle;
      }
    }

    recStack.delete(node);
    path.pop();
    return null;
  }

  for (const t of tasks) {
    if (!visited.has(t.id)) {
      const cycle = dfs(t.id, []);
      if (cycle) {
        return { hasCycle: true, cycle };
      }
    }
  }

  return { hasCycle: false, cycle: [] };
}
