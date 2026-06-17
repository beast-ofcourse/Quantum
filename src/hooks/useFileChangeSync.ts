import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEditorStore } from "@/stores/editorStore";
import type { FsChangeEvent } from "@/types/file";

export function useFileChangeSync() {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    (async () => {
      try {
        unlisten = await listen<FsChangeEvent>("fs:change", (event) => {
          const paths = event.payload?.paths ?? [];
          const handle = useEditorStore.getState().handleExternalChange;
          for (const p of paths) handle(p);
        });
        if (cancelled) unlisten?.();
      } catch (err) {
        console.debug("[useFileChangeSync] not in Tauri:", err);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
