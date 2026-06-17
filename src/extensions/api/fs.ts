import * as tauriFs from "@/tauri/fs";

export function createFsAPI() {
  return {
    async readFile(path: string): Promise<string> {
      return tauriFs.readFile(path);
    },
    async writeFile(path: string, content: string): Promise<void> {
      await tauriFs.writeFile(path, content);
    },
    async listDir(path: string): Promise<string[]> {
      const result = await tauriFs.readDirectory({ path, maxDepth: 1, includeHidden: false });
      return result.entries.map((e) => e.name);
    },
    async exists(path: string): Promise<boolean> {
      return tauriFs.pathExists(path);
    },
  };
}

export type FsAPI = ReturnType<typeof createFsAPI>;
