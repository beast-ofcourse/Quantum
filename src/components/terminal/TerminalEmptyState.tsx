import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerminalStore } from "@/stores/terminalStore";
import { useUiStore } from "@/stores/uiStore";

export function TerminalEmptyState() {
  const createSession = useTerminalStore((s) => s.createSession);
  const shellsLoaded = useTerminalStore((s) => s.shellsLoaded);
  const setActivePanel = useUiStore((s) => s.setActivePanel);

  const handleClick = async () => {
    try {
      const session = await createSession();
      if (session) {
        setActivePanel("terminal");
      }
    } catch (err) {
      console.error("[TerminalEmptyState] Failed to create session:", err);
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center text-muted-foreground">
      <p className="text-sm">No terminal open</p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={!shellsLoaded}
        className="gap-1.5"
      >
        <Plus className="size-3.5" />
        New Terminal
      </Button>
    </div>
  );
}
