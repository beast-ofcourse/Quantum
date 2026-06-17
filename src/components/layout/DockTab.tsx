import type { DockZone, PanelId } from "@/types/panelRegistry";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

interface DockTabProps {
  panelId: PanelId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  zone: DockZone;
  onSelect: (id: PanelId) => void;
  onMove: (id: PanelId, target: DockZone) => void;
  onDetach: (id: PanelId) => void;
}

export function DockTab({ panelId, title, icon: Icon, isActive, zone, onSelect, onMove, onDetach }: DockTabProps) {
  const zones: DockZone[] = ["left", "right", "bottom"];
  const otherZones = zones.filter((z) => z !== zone);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          role="tab"
          aria-selected={isActive}
          onClick={() => onSelect(panelId)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 text-xs",
            isActive
              ? "text-foreground font-medium border-b border-primary"
              : "text-muted-foreground hover:text-foreground border-b border-transparent",
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate max-w-[120px]">{title}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {otherZones.map((z) => (
          <ContextMenuItem key={z} onSelect={() => onMove(panelId, z)}>
            Move to {z.charAt(0).toUpperCase() + z.slice(1)}
          </ContextMenuItem>
        ))}
        <ContextMenuItem onSelect={() => onDetach(panelId)}>
          Open in New Window
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
