import { useHotkey } from "@/hooks/useHotkey";
import { useUiStore } from "@/stores/uiStore";
import { openAndCreateTerminalSession } from "@/lib/terminal-helpers";

export function useTerminalHotkeys() {
  const toggleZone = useUiStore((s) => s.toggleZone);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const bottomVisible = useUiStore((s) => s.zones.bottom.isVisible);

  useHotkey({
    combo: "mod+`",
    description: "Toggle terminal panel",
    handler: () => {
      toggleZone("bottom");
      if (!bottomVisible) setActivePanel("terminal");
    },
  });

  useHotkey({
    combo: "mod+shift+`",
    description: "New terminal session",
    handler: () => {
      void openAndCreateTerminalSession();
    },
  });
}
