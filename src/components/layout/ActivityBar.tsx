import { useEffect, useMemo, useState, useCallback } from "react";
import { Puzzle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/uiStore";
import { getActivityBarPanels } from "@/lib/panelRegistry";
import { extensionViewRegistry } from "@/extensions/viewRegistry";
import { focusDetachedPanel } from "@/lib/multiWindowService";
import { LayoutCustomizationMenu } from "@/components/layout/LayoutCustomizationMenu";
import { AiAgentLauncher } from "@/components/layout/AiAgentLauncher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";
import type { PanelDefinition } from "@/types/panelRegistry";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  puzzle: Puzzle,
};

export function ActivityBar() {
  const zones = useUiStore((s) => s.zones);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const detachedWindows = useUiStore((s) => s.detachedWindows);

  const [extViews, setExtViews] = useState(() => extensionViewRegistry.getAll());

  useEffect(() => {
    const d = extensionViewRegistry.onChanged((views) => {
      setExtViews([...views]);
    });
    return () => d.dispose();
  }, []);

  const items = useMemo<PanelDefinition[]>(() => {
    const builtin = getActivityBarPanels();
    const extItems: PanelDefinition[] = extViews.map((v) => ({
      id: v.id,
      title: v.title,
      icon: v.icon && ICON_MAP[v.icon.toLowerCase()]
        ? ICON_MAP[v.icon.toLowerCase()]
        : Puzzle,
      component: () => null,
      defaultZone: "left",
      showInActivityBar: true,
    }));
    return [...builtin, ...extItems];
  }, [extViews]);

  const isPanelActive = (id: string) => {
    if (detachedWindows[id]) return true;
    for (const zone of ["left", "right", "bottom"] as const) {
      const dock = zones[zone];
      if (dock.isVisible && dock.activePanelId === id) return true;
    }
    return false;
  };

  const handleClick = useCallback(async (id: string) => {
    if (detachedWindows[id]) {
      await focusDetachedPanel(id);
    } else {
      togglePanel(id);
    }
  }, [detachedWindows, togglePanel]);

  return (
    <nav
      aria-label="Activity bar"
      className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border/50 py-2"
    >
      {items.map(({ id, title, icon: Icon }) => {
        const active = isPanelActive(id);
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={title}
                aria-pressed={active}
                data-active={active}
                onClick={() => handleClick(id)}
                className={cn(
                  "relative size-10 rounded-none text-muted-foreground hover:text-foreground",
                  "before:absolute before:left-0 before:top-[6px] before:h-[calc(100%-12px)] before:w-[3px] before:rounded-r-full before:bg-primary before:opacity-0 before:transition-opacity",
                  active &&
                    "text-foreground before:opacity-100",
                )}
              >
                <Icon className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{title}</TooltipContent>
          </Tooltip>
        );
      })}

      <AiAgentLauncher />

      <ThemeToggle className="size-10 rounded-none text-muted-foreground hover:text-foreground" />

      {/* Spacer pushes gear to bottom */}
      <div className="flex-1" />

      <LayoutCustomizationMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Layout and visibility settings"
              className="relative size-10 rounded-none text-muted-foreground hover:text-foreground"
            >
              <Settings className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Layout Settings</TooltipContent>
        </Tooltip>
      </LayoutCustomizationMenu>
    </nav>
  );
}
