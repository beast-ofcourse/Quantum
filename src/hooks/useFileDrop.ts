import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useFileStore } from "@/stores/fileStore";
import { stat } from "@/tauri";

/**
 * Listens for OS-level drag-and-drop events on the Tauri window.
 *
 * - Drop a folder → opens it as the workspace root (existing folder is
 *   replaced; the dropped folder always wins).
 * - Drop one or more files → opens them in the editor. If they live outside
 *   the current workspace, the common parent becomes the new workspace root.
 */
export function useFileDrop() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.type !== "drop") return;
          void handleDroppedPaths(payload.paths);
        });
        if (cancelled) unlisten?.();
      } catch (err) {
        console.debug("[useFileDrop] not in Tauri:", err);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}

async function handleDroppedPaths(paths: string[]) {
  if (paths.length === 0) return;

  const { openFolder, openFiles } = useFileStore.getState();

  const folders: string[] = [];
  const files: string[] = [];
  for (const path of paths) {
    try {
      const meta = await stat(path);
      if (meta.isDir) folders.push(path);
      else files.push(path);
    } catch {
      // ignore
    }
  }

  if (folders.length > 0) {
    await openFolder(folders[0]);
    return;
  }

  if (files.length > 0) {
    await openFiles(files);
  }
}
