import { X, ChevronUp, ChevronDown } from "lucide-react";
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
  const bottomMaximized = useUiStore((s) => s.bottomMaximized);
  const toggleBottomMaximized = useUiStore((s) => s.toggleBottomMaximized);

  if (zoneState.panelIds.length === 0) return null;

  const activeDef = zoneState.panelIds.length === 1
    ? getPanel(zoneState.panelIds[0])
    : null;

  const isBottom = zone === "bottom";

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
      <div className="ml-auto flex items-center gap-0.5 shrink-0">
        {isBottom && (
          <button
            onClick={toggleBottomMaximized}
            className="size-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            title={bottomMaximized ? "Restore Panel Size" : "Maximize Panel Size"}
          >
            {bottomMaximized ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronUp className="size-3.5" />
            )}
          </button>
        )}
        <button
          onClick={() => {
            setZoneVisibility(zone, false);
            // Reset maximized state when closing bottom panel
            if (isBottom && bottomMaximized) {
              toggleBottomMaximized();
            }
          }}
          className="size-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent"
          title={`Close ${zone} panel`}
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
