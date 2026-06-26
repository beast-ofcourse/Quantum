import { TerminalEmitter, type TerminalEventPayload } from "./TerminalEvents";

export class TerminalAdapter {
  private emitter = new TerminalEmitter();
  private processId: string | null = null;

  connect(processId: string): void {
    this.processId = processId;
  }

  disconnect(): void {
    this.processId = null;
  }

  write(data: string): void {
    if (!this.processId) return;
    this.emitter.emit({
      type: "data",
      processId: this.processId,
      data,
    });
  }

  writeError(data: string): void {
    if (!this.processId) return;
    this.emitter.emit({
      type: "data",
      processId: this.processId,
      data: `\x1b[31m${data}\x1b[0m`,
    });
  }

  notifyExit(processId: string, exitCode: number | null): void {
    this.emitter.emit({ type: "exit", processId, exitCode });
  }

  notifyStart(processId: string): void {
    this.emitter.emit({ type: "start", processId });
  }

  notifyError(processId: string, error: string): void {
    this.emitter.emit({ type: "error", processId, error });
  }

  onEvent(listener: (event: TerminalEventPayload) => void): () => void {
    return this.emitter.on(listener);
  }
}
