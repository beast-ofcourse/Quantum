import { Bot, Activity, Lock, Settings2 } from "lucide-react";
import { useSwarmStore } from "@/stores/swarmStore";
import { AgentGrid } from "./AgentGrid";
import { TaskBoard } from "./TaskBoard";
import { ActivityLog } from "./ActivityLog";
import { FileLocksPanel } from "./FileLocksPanel";
import { NewTaskDialog } from "./NewTaskDialog";
import { ConflictResolver } from "./ConflictResolver";
import { SwarmSettingsDialog } from "./SwarmSettingsDialog";
import { cn } from "@/lib/utils";

const phaseLabels: Record<string, string> = {
  planning: "Planning",
  executing: "Executing",
  merging: "Merging",
  conflict: "Conflict",
  done: "Done",
};

const phaseColors: Record<string, string> = {
  planning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  executing: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  merging: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  conflict: "bg-red-500/10 text-red-400 border-red-500/30",
  done: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

export function SwarmPanel() {
  const swarmState = useSwarmStore((s) => s.state);
  const phase = swarmState?.phase;
  const isLoading = useSwarmStore((s) => s.isLoading);
  const error = useSwarmStore((s) => s.error);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading swarm state...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-red-400">
        {error}
      </div>
    );
  }

  if (!swarmState) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <Bot className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No swarm active</p>
        <p className="text-xs text-muted-foreground/60">
          Create a task to start a new swarm session
        </p>
        <div className="flex gap-2">
          <NewTaskDialog />
          <SwarmSettingsDialog>
            <Settings2 className="size-3.5" />
            Settings
          </SwarmSettingsDialog>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bot className="size-4" />
        <span className="text-sm font-medium">{swarmState.name}</span>
        {phase && (
          <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[10px]", phaseColors[phase])}>
            {phaseLabels[phase] ?? phase}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Tasks</span>
          <NewTaskDialog size="xs" />
        </div>
        <TaskBoard />

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="size-3" />
            Activity
          </div>
          <ActivityLog />
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3" />
            File Locks
          </div>
          <FileLocksPanel />
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot className="size-3" />
            Agents
          </div>
          <AgentGrid />
        </div>
      </div>

      {phase === "conflict" && <ConflictResolver />}
    </div>
  );
}
