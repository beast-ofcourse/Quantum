export type TerminalEventType = "data" | "exit" | "error" | "start";

export interface TerminalEventPayload {
  type: TerminalEventType;
  processId: string;
  data?: string;
  exitCode?: number | null;
  error?: string;
}

type TerminalListener = (event: TerminalEventPayload) => void;

export class TerminalEmitter {
  private listeners = new Set<TerminalListener>();

  on(listener: TerminalListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: TerminalEventPayload): void {
    for (const l of this.listeners) l(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}
