import { DapMessageBuffer, encodeDapMessage } from "./protocol";
import type { DapMessage } from "./protocol";

interface TransportCallbacks {
  onMessage: (msg: DapMessage) => void;
  onExit: (code: number | null) => void;
  onError: (err: Error) => void;
}

export class DapTransport {
  private command: CommandRef | null = null;
  private child: ChildProcess | null = null;
  private buffer = new DapMessageBuffer();
  private callbacks: TransportCallbacks | null = null;
  private killed = false;

  async start(adapterPath: string, adapterArgs: string[]): Promise<void> {
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create(adapterPath, adapterArgs);
      this.command = { command: cmd as any };

      cmd.stdout.on("data", (line: string) => {
        const msgs = this.buffer.push(line);
        for (const msg of msgs) {
          this.callbacks?.onMessage(msg);
        }
      });

      cmd.stderr.on("data", (_line: string) => {
        /* stderr may contain debug adapter logs */
      });

      cmd.on("close", (data: { code: number | null }) => {
        if (!this.killed) {
          this.callbacks?.onExit(data.code);
        }
      });

      cmd.on("error", (err: string) => {
        this.callbacks?.onError(new Error(err));
      });

      this.child = await cmd.spawn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks?.onError(error);
      throw error;
    }
  }

  send(msg: DapMessage): void {
    if (!this.child) return;
    const data = encodeDapMessage(msg);
    this.child.write(data).catch((err: Error) => {
      this.callbacks?.onError(err);
    });
  }

  kill(): void {
    this.killed = true;
    if (this.command) {
      const cmd = this.command.command;
      cmd.stdout.removeAllListeners();
      cmd.stderr.removeAllListeners();
      cmd.removeAllListeners();
    }
    if (this.child) {
      this.child.kill().catch(() => {});
    }
    this.command = null;
    this.child = null;
  }

  on(cb: TransportCallbacks): void {
    this.callbacks = cb;
  }

  get isRunning(): boolean {
    return this.child !== null && !this.killed;
  }
}

interface CommandRef {
  command: {
    stdout: { on: (event: string, cb: (data: string) => void) => void; removeAllListeners: () => void };
    stderr: { on: (event: string, cb: (data: string) => void) => void; removeAllListeners: () => void };
    on: (event: string, cb: (data: unknown) => void) => void;
    removeAllListeners: () => void;
  };
}

interface ChildProcess {
  write: (data: string) => Promise<void>;
  kill: () => Promise<void>;
}
