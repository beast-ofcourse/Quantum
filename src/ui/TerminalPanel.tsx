import { useEffect, useRef, useState, useCallback } from "react";
import { executionService } from "@/core/execution/ExecutionService";

interface ProcessItem {
  id: string;
  file: string;
  command: string;
  status: string;
}

export function ExecutionStatusPanel() {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const refresh = useCallback(() => {
    const all = executionService.getRegistry().getAll();
    setProcesses(
      all.map((p) => ({
        id: p.id,
        file: p.file,
        command: p.command,
        status: p.status,
      })),
    );
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(refresh, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  if (processes.length === 0) return null;

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="mb-1 text-[10px] font-medium text-muted-foreground uppercase">
        Running Processes
      </div>
      <div className="space-y-1">
        {processes.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-xs">
            <span
              className={`size-1.5 rounded-full ${
                p.status === "running"
                  ? "bg-green-400"
                  : p.status === "exited"
                    ? "bg-muted-foreground/40"
                    : "bg-red-400"
              }`}
            />
            <span className="truncate text-muted-foreground">{p.file}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
