import { useRef, useEffect } from "react";
import { useSwarmStore } from "@/stores/swarmStore";

const typeColors: Record<string, string> = {
  spawned: "text-emerald-400",
  manifest: "text-blue-400",
  merge_start: "text-amber-400",
  merge_ok: "text-emerald-400",
  merge_conflict: "text-red-400",
  agent_exit: "text-gray-400",
  error: "text-red-400",
};

const typeLabels: Record<string, string> = {
  spawned: "Spawned",
  manifest: "Manifest",
  merge_start: "Merge",
  merge_ok: "Merged",
  merge_conflict: "Conflict",
  agent_exit: "Exited",
  error: "Error",
};

export function ActivityLog() {
  const timeline = useSwarmStore((s) => s.timeline);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  useEffect(() => {
    if (autoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timeline.length]);

  const onScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    autoScroll.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  };

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        No activity yet
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-[11px]"
    >
      {timeline.map((ev, i) => {
        const time = ev.t ? new Date(ev.t).toLocaleTimeString() : "";
        return (
          <div key={i} className="flex items-start gap-1.5 px-1">
            <span className="shrink-0 text-[10px] text-muted-foreground/50">{time}</span>
            <span className={typeColors[ev.type] ?? "text-muted-foreground"}>
              [{typeLabels[ev.type] ?? ev.type}]
            </span>
            <span className="text-muted-foreground">{ev.agent}</span>
            {ev.detail && (
              <span className="truncate text-muted-foreground/70">{ev.detail}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
