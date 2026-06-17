import { MessageBuffer, encodeMessage } from "./jsonrpc";
import type { JsonRpcMessage } from "./types";
import type { Command } from "@tauri-apps/plugin-shell";

interface TransportCallbacks {
  onMessage: (msg: JsonRpcMessage) => void;
  onExit: (code: number | null) => void;
}

export class LspTransport {
  private command: Command<string> | null = null;
  private child: { write: (data: string) => Promise<void>; kill: () => Promise<void> } | null = null;
  private buffer = new MessageBuffer();
  private callbacks: TransportCallbacks | null = null;
  private killed = false;

  async spawn(binaryPath: string, args: string[]): Promise<void> {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const cmd = Command.create(binaryPath, args);
    this.command = cmd;

    cmd.stdout.on("data", (line: string) => {
      const msgs = this.buffer.push(line);
      for (const msg of msgs) {
        this.callbacks?.onMessage(msg);
      }
    });

    cmd.stderr.on("data", () => {});

    cmd.on("close", (data: { code: number | null }) => {
      if (!this.killed) {
        this.callbacks?.onExit(data.code);
      }
    });

    this.child = await cmd.spawn();
  }

  send(msg: JsonRpcMessage): void {
    if (!this.child) return;
    const data = encodeMessage(msg);
    this.child.write(data);
  }

  kill(): void {
    this.killed = true;
    if (this.command) {
      this.command.stdout.removeAllListeners();
      this.command.stderr.removeAllListeners();
      this.command.removeAllListeners();
    }
    this.child?.kill().catch(() => {});
    this.command = null;
    this.child = null;
  }

  on(cb: TransportCallbacks): void {
    this.callbacks = cb;
  }
}
