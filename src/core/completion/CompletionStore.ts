import type { RankedItem } from "./types";

export class CompletionStore {
  private items: RankedItem[] = [];
  private sessionId = "";

  /** Start a new session with a unique ID. */
  beginSession(): string {
    this.sessionId = `session-${Date.now()}`;
    this.items = [];
    return this.sessionId;
  }

  /** Add items from a provider (called between merge and sort). */
  setItems(items: RankedItem[]): void {
    this.items = items;
  }

  getItems(): RankedItem[] {
    return this.items;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  clear(): void {
    this.items = [];
    this.sessionId = "";
  }
}
