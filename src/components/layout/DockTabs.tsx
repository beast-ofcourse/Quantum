import { X } from "lucide-react";
import type { DockZone } from "@/types/panelRegistry";
import { getPanel } from "@/lib/panelRegistry";
import { useUiStore } from "@/stores/uiStore";
import { detachPanel } from "@/lib/multiWindowService";
import { DockTab } from "./DockTab";

interface DockTabsProps {
  zone: DockZone;
}

export function DockTabs({ zone }: DockTabsProps) {
  const zoneState = useUiStore((s) => s.zones[zone]);
  const setActivePanel = useUiStore((s) => s.setActivePanelInZone);
  const movePanel = useUiStore((s) => s.movePanel);
  const setZoneVisibility = useUiStore((s) => s.setZoneVisibility);

  if (zoneState.panelIds.length === 0) return null;

  const activeDef = zoneState.panelIds.length === 1
    ? getPanel(zoneState.panelIds[0])
    : null;

  return (
    <div
      className="flex h-7 shrink-0 items-center px-2"
    >
      {zoneState.panelIds.length <= 1 && activeDef ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <activeDef.icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">
            {activeDef.title}
          </span>
        </div>
      ) : (
        <div
          role="tablist"
          className="flex items-center overflow-x-auto flex-1 min-w-0 gap-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {zoneState.panelIds.map((id) => {
            const def = getPanel(id);
            if (!def) return null;
            return (
              <DockTab
                key={id}
                panelId={id}
                title={def.title}
                icon={def.icon}
                isActive={id === zoneState.activePanelId}
                zone={zone}
                onSelect={(pid) => setActivePanel(zone, pid)}
                onMove={(pid, target) => movePanel(pid, zone, target)}
                onDetach={(pid) => void detachPanel(pid, zone)}
              />
            );
          })}
        </div>
      )}
      <button
        onClick={() => setZoneVisibility(zone, false)}
        className="ml-auto size-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
        title={`Close ${zone} panel`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
