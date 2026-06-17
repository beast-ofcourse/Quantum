import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { confirm as confirmDialog } from "@/tauri";
import type { Tab } from "@/types/editor";

async function confirmDiscard(tab: Tab): Promise<boolean> {
  return confirmDialog(
    `Discard unsaved changes to "${tab.name}"?`,
    {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    },
  );
}

export function useEditorHotkeys() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const { openTabs, activeTabId, saveFile, closeTab, cycleTab } =
        useEditorStore.getState();
      const active = openTabs.find((t) => t.id === activeTabId);

      if (key === "s" && !e.shiftKey && !e.altKey && active) {
        e.preventDefault();
        await saveFile(active.id);
        return;
      }
      if (key === "w" && active && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (active.isDirty) {
          const ok = await confirmDiscard(active);
          if (!ok) return;
          await closeTab(active.id, { force: true });
        } else {
          await closeTab(active.id);
        }
        return;
      }
      if (key === "tab" && !e.altKey) {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
