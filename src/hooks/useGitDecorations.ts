import { useMemo } from "react";
import { useGitStore } from "@/stores/gitStore";
import { useFileStore } from "@/stores/fileStore";
import type { GitStatusType } from "@/types/git";

export function useGitDecorations(): Map<string, GitStatusType> {
  const status = useGitStore((s) => s.status);
  const rootPath = useFileStore((s) => s.rootPath);

  return useMemo(() => {
    const decorations = new Map<string, GitStatusType>();
    if (!status || !rootPath) return decorations;

    const root = rootPath.replace(/[\\/]+$/, "");
    const sep = rootPath.includes("\\") ? "\\" : "/";

    const addEntries = (paths: string[], type: GitStatusType) => {
      for (const p of paths) {
        const full = p.startsWith(root) ? p : `${root}${sep}${p}`;
        decorations.set(full, type);
      }
    };

    for (const entry of status.staged) {
      const full = entry.path.startsWith(root) ? entry.path : `${root}${sep}${entry.path}`;
      decorations.set(full, entry.status as GitStatusType);
    }
    for (const entry of status.unstaged) {
      const full = entry.path.startsWith(root) ? entry.path : `${root}${sep}${entry.path}`;
      decorations.set(full, entry.status as GitStatusType);
    }
    addEntries(status.untracked, "untracked");
    addEntries(status.conflicted, "conflict");

    return decorations;
  }, [status, rootPath]);
}
