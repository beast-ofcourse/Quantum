import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/stores/uiStore";

type SidebarPosition = "left" | "right";
type PanelAlignment = "left" | "center" | "right" | "justify";

const ALIGN_LABELS: Record<PanelAlignment, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
  justify: "Justify",
};

export function LayoutCustomizationMenu({
  children,
  open,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const sidebarPosition = useUiStore((s) => s.sidebarPosition);
  const panelAlignment = useUiStore((s) => s.panelAlignment);
  const menuBarVisible = useUiStore((s) => s.menuBarVisible);
  const activityBarVisible = useUiStore((s) => s.activityBarVisible);
  const statusBarVisible = useUiStore((s) => s.statusBarVisible);
  const setSidebarPosition = useUiStore((s) => s.setSidebarPosition);
  const setPanelAlignment = useUiStore((s) => s.setPanelAlignment);
  const setMenuBarVisible = useUiStore((s) => s.setMenuBarVisible);
  const setActivityBarVisible = useUiStore((s) => s.setActivityBarVisible);
  const setStatusBarVisible = useUiStore((s) => s.setStatusBarVisible);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" sideOffset={4} align="start">
        {/* Visibility */}
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          VISIBILITY
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={menuBarVisible}
          onCheckedChange={() => setMenuBarVisible(!menuBarVisible)}
        >
          Menu Bar
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={activityBarVisible}
          onCheckedChange={() => setActivityBarVisible(!activityBarVisible)}
        >
          Activity Bar
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={statusBarVisible}
          onCheckedChange={() => setStatusBarVisible(!statusBarVisible)}
        >
          Status Bar
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        {/* Sidebar Position */}
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          SIDEBAR POSITION
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sidebarPosition}
          onValueChange={(v) => setSidebarPosition(v as SidebarPosition)}
        >
          <DropdownMenuRadioItem value="left">Left</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        {/* Panel Alignment */}
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          PANEL ALIGNMENT
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={panelAlignment}
          onValueChange={(v) => setPanelAlignment(v as PanelAlignment)}
        >
          {(["left", "center", "right", "justify"] as PanelAlignment[]).map(
            (align) => (
              <DropdownMenuRadioItem key={align} value={align}>
                {ALIGN_LABELS[align]}
              </DropdownMenuRadioItem>
            ),
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
