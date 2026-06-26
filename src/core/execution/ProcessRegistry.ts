import type { ExecutionProcess, ProcessStatus } from "./types";

export class ProcessRegistry {
  private processes = new Map<string, ExecutionProcess>();
  private listeners = new Set<() => void>();

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  register(proc: ExecutionProcess): void {
    this.processes.set(proc.id, proc);
    this.notify();
  }

  update(id: string, partial: Partial<ExecutionProcess>): void {
    const p = this.processes.get(id);
    if (p) {
      Object.assign(p, partial);
      this.notify();
    }
  }

  get(id: string): ExecutionProcess | undefined {
    return this.processes.get(id);
  }

  remove(id: string): void {
    this.processes.delete(id);
    this.notify();
  }

  getAll(): ExecutionProcess[] {
    return Array.from(this.processes.values());
  }

  getByStatus(status: ProcessStatus): ExecutionProcess[] {
    return this.getAll().filter((p) => p.status === status);
  }

  hasRunning(): boolean {
    return this.getAll().some((p) => p.status === "running");
  }

  clear(): void {
    this.processes.clear();
    this.notify();
  }
}
