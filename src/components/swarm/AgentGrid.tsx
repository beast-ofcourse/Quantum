import { useSwarmStore } from "@/stores/swarmStore";
import { AgentCard } from "./AgentCard";

export function AgentGrid() {
  const agents = useSwarmStore((s) => s.state?.agents);

  if (!agents) return null;

  const ids = Object.keys(agents);
  if (ids.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        No agents running
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {ids.map((id) => (
        <AgentCard key={id} agentId={id} />
      ))}
    </div>
  );
}
