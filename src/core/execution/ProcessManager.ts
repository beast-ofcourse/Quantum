import { ProcessRegistry } from "./ProcessRegistry";
import type { ExecutionProcess, Language } from "./types";

interface SpawnResult {
  process: ExecutionProcess;
  kill: () => Promise<void>;
  onStdout: (cb: (data: string) => void) => void;
  onStderr: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
}

type SpawnFn = (cmd: string, args: string[], cwd: string) => Promise<SpawnResult>;

export class ProcessManager {
  private registry = new ProcessRegistry();
  private spawnFn: SpawnFn;
  private running = new Map<string, SpawnResult>();

  constructor(spawnFn: SpawnFn) {
    this.spawnFn = spawnFn;
  }

  async start(
    id: string,
    language: Language,
    file: string,
    command: string,
    args: string[],
    cwd: string,
    onStdout: (data: string) => void,
    onStderr: (data: string) => void,
    onExit: (code: number | null) => void,
  ): Promise<void> {
    const proc: ExecutionProcess = {
      id,
      language,
      file,
      command,
      args,
      cwd,
      status: "running",
      startedAt: Date.now(),
      exitCode: null,
    };
    this.registry.register(proc);

    try {
      const spawned = await this.spawnFn(command, args, cwd);

      spawned.onStdout((data) => {
        onStdout(data);
      });
      spawned.onStderr((data) => {
        onStderr(data);
      });
      spawned.onExit((code) => {
        this.registry.update(id, { status: "exited", exitCode: code });
        this.running.delete(id);
        onExit(code);
      });

      this.running.set(id, spawned);
    } catch (err) {
      this.registry.update(id, {
        status: "error",
        exitCode: -1,
      });
      this.running.delete(id);
      onExit(-1);
    }
  }

  async stop(id: string): Promise<void> {
    const spawned = this.running.get(id);
    if (spawned) {
      await spawned.kill();
      this.running.delete(id);
    }
    this.registry.update(id, { status: "stopped" });
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.running.keys());
    await Promise.all(ids.map((id) => this.stop(id)));
  }

  getRegistry(): ProcessRegistry {
    return this.registry;
  }

  hasRunning(): boolean {
    return this.registry.hasRunning();
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }
}
