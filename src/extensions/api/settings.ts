import { Disposable, disposableFrom } from "../types";
import type { AppSettings } from "@/types/settings";
import { useSettingsStore } from "@/stores/settingsStore";

type Callback = (key: string, value: unknown) => void;

export function createSettingsAPI() {
  const listeners = new Set<Callback>();

  return {
    get(key: string): unknown {
      const parts = key.split(".");
      const state = useSettingsStore.getState();
      let val: unknown = state;
      for (const part of parts) {
        val = (val as Record<string, unknown>)[part];
        if (val === undefined) return undefined;
      }
      return val;
    },

    set(key: string, value: unknown): void {
      const parts = key.split(".");
      if (parts.length === 2) {
        useSettingsStore.getState().update(parts[0] as keyof AppSettings, {
          [parts[1]]: value,
        });
      } else {
        console.warn(`[ext:api] settings.set: key "${key}" must be section.name`);
        return;
      }
      listeners.forEach((cb) => {
        try { cb(key, value); } catch { /* noop */ }
      });
    },

    onChanged(cb: Callback): Disposable {
      listeners.add(cb);
      return disposableFrom(() => listeners.delete(cb));
    },
  };
}

export type SettingsAPI = ReturnType<typeof createSettingsAPI>;
