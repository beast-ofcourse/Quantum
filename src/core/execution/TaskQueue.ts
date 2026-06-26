import type { Task } from "./types";

export class TaskQueue {
  private queue: Task[] = [];
  private processing = false;

  enqueue(task: Task): void {
    // dedupe — if same file already queued, replace
    const existing = this.queue.findIndex((t) => t.request.file === task.request.file && t.type === task.type);
    if (existing >= 0) {
      this.queue[existing] = task;
      return;
    }
    this.queue.push(task);
    void this.process();
  }

  clear(file?: string): void {
    if (file) {
      this.queue = this.queue.filter((t) => t.request.file !== file);
    } else {
      this.queue = [];
    }
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await this.handler(task);
    }

    this.processing = false;
  }

  handler: (task: Task) => Promise<void> = async () => {};

  get length(): number {
    return this.queue.length;
  }
}
