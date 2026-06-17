import { useCallback } from "react";
import { useFileStore } from "@/stores/fileStore";
import { confirm, revealInExplorer } from "@/tauri";

export function useExplorerActions() {
  const createFile = useFileStore((s) => s.createFile);
  const createFolder = useFileStore((s) => s.createFolder);
  const rename = useFileStore((s) => s.rename);
  const remove = useFileStore((s) => s.remove);

  const handleNewFile = useCallback(
    async (parent: string, name: string) => {
      const path = await createFile(parent, name);
      return path;
    },
    [createFile],
  );

  const handleNewFolder = useCallback(
    async (parent: string, name: string) => {
      const path = await createFolder(parent, name);
      return path;
    },
    [createFolder],
  );

  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      await rename(oldPath, newName);
    },
    [rename],
  );

  const handleDelete = useCallback(
    async (path: string, isDir: boolean, name: string) => {
      const ok = await confirm(
        `Delete ${isDir ? "folder" : "file"} "${name}"? This cannot be undone.`,
        { title: "Delete", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" },
      );
      if (!ok) return;
      await remove(path);
    },
    [remove],
  );

  const handleReveal = useCallback(async (path: string) => {
    try {
      await revealInExplorer(path);
    } catch (err) {
      console.error("Reveal failed:", err);
    }
  }, []);

  return {
    handleNewFile,
    handleNewFolder,
    handleRename,
    handleDelete,
    handleReveal,
  };
}
