import { readFile } from "@/tauri/fs";

export interface LoadedModule {
  activate: (api: unknown) => void | Promise<void> | (() => void);
  deactivate?: () => void;
}

export async function loadExtensionEntry(mainPath: string): Promise<LoadedModule | null> {
  try {
    const content = await readFile(mainPath);
    const blob = new Blob([content], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    try {
      const mod = await import(url);
      const result: LoadedModule = {
        activate: mod.activate ?? (() => {}),
        deactivate: mod.deactivate,
      };
      return result;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error(`[ext:loader] failed to load ${mainPath}:`, err);
    return null;
  }
}
