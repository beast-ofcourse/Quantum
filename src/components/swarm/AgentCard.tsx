import { memo } from "react";
import { Bot, XCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSwarmStore } from "@/stores/swarmStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/types/swarm";

interface AgentCardProps {
  agentId: string;
}

const statusDot: Record<AgentStatus, string> = {
  running: "bg-emerald-500",
  waiting: "bg-amber-500",
  idle: "bg-gray-400",
  merging: "bg-blue-500",
  done: "bg-gray-500",
  failed: "bg-red-500",
  dead: "bg-red-700",
};

const statusLabel: Record<AgentStatus, string> = {
  running: "Running",
  waiting: "Waiting",
  idle: "Idle",
  merging: "Merging",
  done: "Done",
  failed: "Failed",
  dead: "Dead",
};

export const AgentCard = memo(function AgentCard({ agentId }: AgentCardProps) {
  const agent = useSwarmStore((s) => s.state?.agents[agentId]) as
    | (import("@/types/swarm").AgentInfo & { status: AgentStatus })
    | undefined;
  const updateStatus = useSwarmStore((s) => s.updateAgentStatus);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);

  if (!agent) return null;

  const isKillable = agent.status === "running" || agent.status === "waiting";
  const isMerging = agent.status === "merging";

  const handleKill = () => {
    updateStatus(agentId, "dead");
  };

  const handleViewTerminal = () => {
    if (agent.sessionId) {
      setActiveSession(agent.sessionId);
    }
  };

  const filesList = agent.manifest.filesModified ?? [];
  const thought = agent.manifest.currentThought;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm transition-colors",
        agent.status === "running" && "border-emerald-500/30 bg-emerald-500/5",
        agent.status === "failed" && "border-red-500/30 bg-red-500/5",
        agent.status === "merging" && "border-blue-500/30 bg-blue-500/5",
        agent.status === "waiting" && "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", statusDot[agent.status])} />
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="truncate font-medium">{agent.type}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{statusLabel[agent.status]}</span>
      </div>

      {agent.model && (
        <div className="mb-1 text-[11px] text-muted-foreground">{agent.model}</div>
      )}

      {isMerging && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-blue-400">
          <Loader2 className="size-3 animate-spin" />
          Merging changes
        </div>
      )}

      {thought && (
        <div className="mb-2 line-clamp-2 text-[11px] italic text-muted-foreground">
          {thought}
        </div>
      )}

      {filesList.length > 0 && (
        <details className="mb-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
            Files ({filesList.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {filesList.map((f) => (
              <li key={f} className="truncate text-[10px] text-muted-foreground/70">
                {f}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-2 flex gap-1">
        {agent.sessionId && (
          <Button variant="ghost" size="xs" onClick={handleViewTerminal}>
            <ExternalLink className="size-3" />
            Terminal
          </Button>
        )}
        {isKillable && (
          <Button variant="ghost" size="xs" className="text-red-400 hover:text-red-300" onClick={handleKill}>
            <XCircle className="size-3" />
            Kill
          </Button>
        )}
      </div>
    </div>
  );
});
