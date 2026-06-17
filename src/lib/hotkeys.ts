export type HotkeyHandler = (event: KeyboardEvent) => void;

export interface HotkeyBinding {
  id: string;
  combo: string;
  description: string;
  handler: HotkeyHandler;
  preventDefault?: boolean;
  allowInInputs?: boolean;
}

export type HotkeyMap = Record<string, HotkeyBinding>;

const normalizeCombo = (combo: string) =>
  combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .sort()
    .join("+");

const eventToCombo = (event: KeyboardEvent): string => {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("mod");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    parts.push(key);
  }
  return parts.sort().join("+");
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
};

export class HotkeyRegistry {
  private bindings = new Map<string, HotkeyBinding>();
  private listener: ((event: KeyboardEvent) => void) | null = null;

  register(binding: HotkeyBinding): () => void {
    const key = normalizeCombo(binding.combo);
    this.bindings.set(key, { ...binding, combo: key });
    return () => {
      if (this.bindings.get(key)?.id === binding.id) {
        this.bindings.delete(key);
      }
    };
  }

  registerMany(bindings: HotkeyBinding[]): () => void {
    const unregisters = bindings.map((b) => this.register(b));
    return () => unregisters.forEach((fn) => fn());
  }

  attach(target: Window | HTMLElement = window) {
    if (this.listener) this.detach();
    this.listener = (event) => this.handle(event);
    target.addEventListener("keydown", this.listener as EventListener);
  }

  detach() {
    if (!this.listener) return;
    window.removeEventListener("keydown", this.listener as EventListener);
    this.listener = null;
  }

  list(): HotkeyBinding[] {
    return Array.from(this.bindings.values());
  }

  private handle(event: KeyboardEvent) {
    const combo = eventToCombo(event);
    const binding = this.bindings.get(combo);
    if (!binding) return;
    if (!binding.allowInInputs && isEditableTarget(event.target)) return;
    if (binding.preventDefault !== false) event.preventDefault();
    binding.handler(event);
  }
}

let registryInstance: HotkeyRegistry | null = null;

export const getHotkeyRegistry = (): HotkeyRegistry => {
  if (!registryInstance) {
    registryInstance = new HotkeyRegistry();
    registryInstance.attach();
  }
  return registryInstance;
};
