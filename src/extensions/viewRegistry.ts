import { Disposable, disposableFrom } from "./types";

export interface ExtensionViewRegistration {
  id: string;
  extensionId: string;
  title: string;
  icon?: string;
}

type ViewEntry = {
  id: string;
  extensionId: string;
  title: string;
  icon?: string;
  render: () => HTMLElement;
  onDispose?: () => void;
};

type Listener = (views: ViewEntry[]) => void;

class ExtensionViewRegistry {
  private views = new Map<string, ViewEntry>();
  private listeners = new Set<Listener>();

  register(entry: ViewEntry): Disposable {
    this.views.set(entry.id, entry);
    this.notify();
    return disposableFrom(() => {
      entry.onDispose?.();
      this.views.delete(entry.id);
      this.notify();
    });
  }

  getAll(): ViewEntry[] {
    return Array.from(this.views.values());
  }

  get(id: string): ViewEntry | undefined {
    return this.views.get(id);
  }

  onChanged(cb: Listener): Disposable {
    this.listeners.add(cb);
    cb(this.getAll());
    return disposableFrom(() => this.listeners.delete(cb));
  }

  private notify() {
    const all = this.getAll();
    this.listeners.forEach((l) => {
      try { l(all); } catch { /* noop */ }
    });
  }
}

export const extensionViewRegistry = new ExtensionViewRegistry();
