import { invoke } from "@tauri-apps/api/core";
import type { FileEntry, ReadDirResult } from "@/types/file";

export interface ReadDirectoryArgs {
  path: string;
  maxDepth?: number;
  includeHidden?: boolean;
}

export async function readDirectory({
  path,
  maxDepth = 10,
  includeHidden = false,
}: ReadDirectoryArgs): Promise<ReadDirResult> {
  return invoke<ReadDirResult>("read_directory", {
    path,
    maxDepth,
    includeHidden,
  });
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  await invoke("write_file", { path, content });
}

export async function createFile(path: string): Promise<void> {
  await invoke("create_file", { path });
}

export async function createDirectory(path: string): Promise<void> {
  await invoke("create_directory", { path });
}

export async function renameEntry(oldPath: string, newPath: string): Promise<void> {
  await invoke("rename_entry", { oldPath, newPath });
}

export async function deleteEntry(path: string): Promise<void> {
  await invoke("delete_entry", { path });
}

export async function resolveHome(): Promise<string> {
  return invoke<string>("resolve_home");
}

export async function stat(path: string): Promise<FileEntry> {
  return invoke<FileEntry>("stat", { path });
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export async function revealInExplorer(path: string): Promise<void> {
  await invoke("reveal_in_explorer", { path });
}

export async function listFiles(root: string, maxDepth?: number): Promise<[string[], boolean]> {
  return invoke<[string[], boolean]>("list_files", { root, maxDepth });
}

export async function watchDirectory(path: string): Promise<void> {
  await invoke("watch_directory", { path });
}

export async function unwatchDirectory(path: string): Promise<void> {
  await invoke("unwatch_directory", { path });
}

export async function unwatchAll(): Promise<void> {
  await invoke("unwatch_all");
}
