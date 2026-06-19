import { Lock } from "lucide-react";
import { useSwarmStore } from "@/stores/swarmStore";

export function FileLocksPanel() {
  const fileLocks = useSwarmStore((s) => s.state?.fileLocks);

  const entries = fileLocks ? Object.entries(fileLocks) : [];

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        No file locks
      </div>
    );
  }

  return (
    <div className="space-y-0.5 text-xs">
      {entries.map(([file, lock]) => (
        <div
          key={file}
          className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
        >
          <Lock className="size-3 shrink-0 text-amber-400" />
          <span className="flex-1 truncate">{file}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {lock.lockedBy}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground/50">
            {new Date(lock.lockedAt).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}
