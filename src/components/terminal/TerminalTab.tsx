import { memo } from "react";
import { X, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useTerminalStore } from "@/stores/terminalStore";
import { useSwarmStore } from "@/stores/swarmStore";
import { cn } from "@/lib/utils";
import type { TerminalSession } from "@/types/terminal";
import type { AgentStatus } from "@/types/swarm";

const agentStatusDot: Record<AgentStatus, string> = {
  running: "bg-emerald-500",
  waiting: "bg-amber-500",
  idle: "bg-gray-400",
  merging: "bg-blue-500",
  done: "bg-gray-500",
  failed: "bg-red-500",
  dead: "bg-red-700",
};

interface TerminalTabProps {
  session: TerminalSession;
  isActive: boolean;
}

export const TerminalTab = memo(function TerminalTab({ session, isActive }: TerminalTabProps) {
  const setActive = useTerminalStore((s) => s.setActiveSession);
  const close = useTerminalStore((s) => s.closeSession);
  const agent = useSwarmStore((s) =>
    session.agentId ? s.state?.agents[session.agentId] : undefined,
  );

  const onClick = () => setActive(session.id);
  const onAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      void close(session.id);
    }
  };
  const onCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void close(session.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="tab"
          aria-selected={isActive}
          onClick={onClick}
          onAuxClick={onAuxClick}
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault();
          }}
          className={cn(
            "group relative flex h-full w-[140px] shrink-0 cursor-pointer items-center gap-2 border-r border-border px-3 text-sm",
            isActive
              ? "bg-background text-foreground"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {isActive && (
            <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary" />
          )}
          {agent ? (
            <span className={cn("size-2 shrink-0 rounded-full", agentStatusDot[agent.status])} />
          ) : (
            <Bot className="size-3 shrink-0 text-muted-foreground" />
          )}
          <span className="flex-1 truncate">
            {agent ? `${agent.type}: ${session.title ?? session.shellLabel}` : (session.title ?? session.shellLabel)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close terminal"
            className={cn(
              "shrink-0",
              isActive
                ? "opacity-70 hover:opacity-100"
                : "opacity-0 group-hover:opacity-70 hover:opacity-100",
            )}
            onClick={onCloseClick}
          >
            <X className="size-3" />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem onSelect={() => void close(session.id)}>
          Close
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
