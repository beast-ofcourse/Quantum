import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useSettingsStore } from "@/stores/settingsStore";

export function useAutoSave(tabId: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirty = useEditorStore((s) => {
    const tab = s.openTabs.find((t) => t.id === tabId);
    return tab?.isDirty ?? false;
  });
  const saveFile = useEditorStore((s) => s.saveFile);
  const autoSave = useSettingsStore((s) => s.general.autoSave);
  const autoSaveDelay = useSettingsStore((s) => s.general.autoSaveDelay);

  useEffect(() => {
    if (!autoSave || !isDirty) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        await saveFile(tabId);
      } catch (err) {
        console.warn("[autoSave] failed:", tabId, err);
      }
    }, autoSaveDelay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tabId, isDirty, autoSave, autoSaveDelay, saveFile]);
}
