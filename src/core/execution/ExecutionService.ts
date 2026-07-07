import { detectLanguage } from "./LanguageDetector";
import { resolveRuntime } from "./RuntimeResolver";
import { buildCommand } from "./CommandBuilder";
import { ProcessManager } from "./ProcessManager";
import { TaskQueue } from "./TaskQueue";
import { tauriSpawn } from "@/core/execution/PtyService";
import type { Language, ProcessStatus, RunRequest, Task } from "./types";

export type ExecutionEventCallback = {
  onStdout: (processId: string, text: string) => void;
  onStderr: (processId: string, text: string) => void;
  onExit: (processId: string, code: number | null) => void;
  onStart: (processId: string, language: Language, file: string) => void;
  onError: (processId: string, message: string) => void;
};

type SpawnFn = (
  cmd: string,
  args: string[],
  cwd: string,
) => Promise<{
  process: { id: string; language: Language; file: string; command: string; args: string[]; cwd: string; status: ProcessStatus; startedAt: number; exitCode: number | null };
  kill: () => Promise<void>;
  onStdout: (cb: (data: string) => void) => void;
  onStderr: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
}>;

export class ExecutionService {
  private processManager: ProcessManager;
  private taskQueue = new TaskQueue();
  private callbacks: ExecutionEventCallback | null = null;
  private nextId = 0;

  constructor(spawnFn?: SpawnFn) {
    const fn = spawnFn ?? tauriSpawn;
    this.processManager = new ProcessManager(fn);
    this.taskQueue.handler = (task) => this.executeTask(task);
  }

  setCallbacks(cb: ExecutionEventCallback): void {
    this.callbacks = cb;
  }

  async run(request: RunRequest): Promise<string> {
    const id = `exec-${Date.now()}-${++this.nextId}`;

    this.taskQueue.enqueue({
      id,
      request,
      type: "run",
      timestamp: Date.now(),
    });

    return id;
  }

  async stop(id: string): Promise<void> {
    await this.processManager.stop(id);
  }

  async stopAll(): Promise<void> {
    await this.processManager.stopAll();
  }

  getRegistry() {
    return this.processManager.getRegistry();
  }

  getProcessManager() {
    return this.processManager;
  }

  private async executeTask(task: Task): Promise<void> {
    const { file, cwd } = task.request;
    const lang = task.request.language ?? detectLanguage(file);
    const runtime = resolveRuntime(lang);
    const commands = buildCommand(lang, file);

    // Run all compile steps (all but last) sequentially before the main process
    for (let i = 0; i < commands.length - 1; i++) {
      const { command, args } = commands[i];
      if (!command) continue;
      const spawned = await tauriSpawn(command, args, cwd);
      const exitCode = await new Promise<number | null>((resolve) => {
        spawned.onExit(resolve);
      });
      if (exitCode !== 0) {
        this.callbacks?.onError(task.id, `Compilation failed (exit ${exitCode})`);
        this.callbacks?.onExit(task.id, exitCode);
        return;
      }
    }

    // Last command is the runnable one; fall back to runtime default if empty
    const lastCmd = commands[commands.length - 1];
    const runCmd = lastCmd?.command
      ? lastCmd
      : { command: runtime.command, args: [...runtime.args, file] };

    this.callbacks?.onStart(task.id, lang, file);

    await this.processManager.start(
      task.id,
      lang,
      file,
      runCmd.command,
      runCmd.args,
      cwd,
      (data) => this.callbacks?.onStdout(task.id, data),
      (data) => this.callbacks?.onStderr(task.id, data),
      (code) => this.callbacks?.onExit(task.id, code),
    );
  }
}

export const executionService = new ExecutionService();
