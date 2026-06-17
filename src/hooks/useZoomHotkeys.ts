import { useHotkey } from "@/hooks/useHotkey";
import { useSettingsStore } from "@/stores/settingsStore";

export function useZoomHotkeys() {
  const zoom = useSettingsStore((s) => s.zoom);

  useHotkey({
    combo: "mod+=",
    description: "Zoom in",
    handler: () => zoom("in"),
    preventDefault: true,
  });
  useHotkey({
    combo: "mod+-",
    description: "Zoom out",
    handler: () => zoom("out"),
    preventDefault: true,
  });
  useHotkey({
    combo: "mod+0",
    description: "Reset zoom",
    handler: () => zoom("reset"),
    preventDefault: true,
  });
}
