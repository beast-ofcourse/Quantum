import type { DockZone } from "@/types/panelRegistry";
import { useUiStore } from "@/stores/uiStore";
import { DockTabs } from "./DockTabs";
import { PanelRenderer } from "./PanelRenderer";

interface DockProps {
  zone: DockZone;
}

export function Dock({ zone }: DockProps) {
  const zoneState = useUiStore((s) => s.zones[zone]);

  if (
    !zoneState.isVisible ||
    zoneState.panelIds.length === 0 ||
    !zoneState.activePanelId
  ) {
    return null;
  }

  return (
    <div className="flex min-h-0 w-full flex-col overflow-hidden bg-muted/20">
      <DockTabs zone={zone} />
      <div className="flex-1 overflow-hidden">
        <PanelRenderer panelId={zoneState.activePanelId} />
      </div>
    </div>
  );
}
