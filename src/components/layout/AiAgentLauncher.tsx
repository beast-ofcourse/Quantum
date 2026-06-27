import { Bot, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAiAgentStore } from "@/stores/aiAgentStore";
import { useFileStore } from "@/stores/fileStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { useUiStore } from "@/stores/uiStore";

export function AiAgentLauncher() {
  const agents = useAiAgentStore((s) => s.agents);

  const handleSelect = async (command: string) => {
    const ui = useUiStore.getState();
    const store = useTerminalStore.getState();
    const file = useFileStore.getState();
    const rootPath = file.rootPath ?? undefined;

    if (!ui.zones.bottom.isVisible) {
      ui.setZoneVisibility("bottom", true);
    }
    ui.setActivePanel("terminal");

    const id = await store.createSession(undefined, rootPath);
    if (!id) return;

    // Write the agent command after a brief delay to let the shell initialize
    // The shell buffers stdin so this is generally safe even without delay
    setTimeout(() => {
      store.writeStdin(id, `${command}\r`);
    }, 200);
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Launch AI Agent"
              className="relative size-10 rounded-none text-muted-foreground hover:text-foreground"
            >
              <Bot className="size-5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">AI Agents</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>AI Agents</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {agents.length === 0 ? (
          <DropdownMenuItem disabled>No agents configured</DropdownMenuItem>
        ) : (
          agents.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              onSelect={() => void handleSelect(agent.command)}
              className="flex items-center gap-3"
            >
              <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col">
                <span>{agent.name}</span>
                {agent.description && (
                  <span className="text-xs text-muted-foreground">
                    {agent.description}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
