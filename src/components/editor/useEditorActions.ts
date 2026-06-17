import { useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";

export function useEditorActions() {
  const openFile = useEditorStore((s) => s.openFile);
  const openFromExplorer = useCallback(
    async (path: string) => {
      try {
        await openFile(path);
      } catch (err) {
        console.error("[editor] open failed:", err);
      }
    },
    [openFile],
  );
  return { openFromExplorer };
}
