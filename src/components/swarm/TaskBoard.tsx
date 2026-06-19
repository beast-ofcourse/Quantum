import { useSwarmStore } from "@/stores/swarmStore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/swarm";

const columnDefs = [
  { key: "pending", label: "Pending", accent: "border-t-amber-500/50" },
  { key: "running", label: "Running", accent: "border-t-emerald-500/50" },
  { key: "done", label: "Done", accent: "border-t-gray-500/50" },
] as const;

function TaskCard({ task }: { task: Task }) {
  const phase = useSwarmStore((s) => s.state?.phase);

  return (
    <div className="rounded-md border border-border bg-background p-2 text-xs">
      <div className="mb-1 line-clamp-2 font-medium">{task.description}</div>
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">{task.status}</Badge>
        {task.assignedTo && (
          <span className="text-[10px] text-muted-foreground">{task.assignedTo}</span>
        )}
        {phase === "conflict" && task.status === "running" && (
          <span className="text-[10px] text-red-400">Conflict</span>
        )}
      </div>
      {task.dependsOn.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {task.dependsOn.map((d) => (
            <span key={d} className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
              {d.slice(0, 8)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskBoard() {
  const tasks = useSwarmStore((s) => s.state?.tasks);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        No tasks created
      </div>
    );
  }

  const grouped: Record<string, Task[]> = { pending: [], running: [], done: [] };
  for (const t of tasks) {
    const key = t.status === "running" ? "running" : t.status === "done" ? "done" : "pending";
    grouped[key].push(t);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {columnDefs.map((col) => (
        <div key={col.key} className={cn("rounded-lg border border-border bg-muted/20", col.accent)}>
          <div className="border-b border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            {col.label}
            <span className="ml-1 text-[10px]">({grouped[col.key].length})</span>
          </div>
          <div className="space-y-1.5 p-2">
            {grouped[col.key].map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
