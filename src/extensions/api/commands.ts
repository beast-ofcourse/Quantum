import { Disposable, disposableFrom } from "../types";
import { registerCommandProvider, invalidateCache } from "@/lib/commandRegistry";
import type { CommandDefinition } from "@/types/commands";

export function createCommandsAPI() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const paletteUnregisters = new Map<string, () => void>();

  return {
    register(id: string, handler: (...args: unknown[]) => unknown): Disposable {
      if (handlers.has(id)) {
        console.warn(`[ext:api] command "${id}" already registered, overwriting`);
      }
      handlers.set(id, handler);

      const unreg = registerCommandProvider(() => {
        const cmd: CommandDefinition = {
          id,
          label: id,
          category: "Extension",
          action: () => {
            handler();
          },
        };
        return [cmd];
      });
      paletteUnregisters.set(id, unreg);
      invalidateCache();

      return disposableFrom(() => {
        handlers.delete(id);
        paletteUnregisters.get(id)?.();
        paletteUnregisters.delete(id);
        invalidateCache();
      });
    },

    async execute(id: string, ...args: unknown[]): Promise<unknown> {
      const handler = handlers.get(id);
      if (!handler) {
        console.warn(`[ext:api] command "${id}" not found`);
        return;
      }
      try {
        return await handler(...args);
      } catch (err) {
        console.error(`[ext:api] command "${id}" failed:`, err);
      }
    },
  };
}

export type CommandsAPI = ReturnType<typeof createCommandsAPI>;
