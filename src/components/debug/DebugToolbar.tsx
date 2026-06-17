import { useDebugStore } from "@/stores/debugStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, CornerDownRight, ArrowDownToLine, ArrowUpToLine, RotateCcw, Square, Pause } from "lucide-react";

export function DebugToolbar() {
  const sessions = useDebugStore((s) => s.sessions);
  const activeSessionId = useDebugStore((s) => s.activeSessionId);
  const status = useDebugStore((s) => {
    const active = s.sessions.find((ses) => ses.id === s.activeSessionId);
    return active?.status ?? "inactive";
  });
  const activeSession = useDebugStore((s) => s.sessions.find((ses) => ses.id === s.activeSessionId));

  const cont = useDebugStore((s) => s.continue);
  const stepOvr = useDebugStore((s) => s.stepOver);
  const stepIn = useDebugStore((s) => s.stepInto);
  const stepOut = useDebugStore((s) => s.stepOut);
  const pause = useDebugStore((s) => s.pause);
  const stopSession = useDebugStore((s) => s.stopSession);

  if (sessions.length === 0) return null;

  const isPaused = status === "paused";
  const isRunning = status === "running";
  const isStepping = status === "stepping";
  const isTerminated = status === "terminated" || status === "stopped";
  const canStep = isPaused;

  const handleStop = () => {
    if (activeSessionId) {
      void stopSession(activeSessionId);
    }
  };

  const handleRestart = () => {
    if (activeSessionId) {
      void stopSession(activeSessionId).then(() => {
        if (activeSession) {
          useDebugStore.getState().startSession(activeSession.config);
        }
      });
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-md border bg-background/95 px-2 py-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Badge
        variant={isPaused ? "default" : isRunning ? "secondary" : "outline"}
        className="mr-1 text-[10px] font-mono uppercase"
      >
        {isTerminated ? "STOPPED" : isStepping ? "STEPPING" : isPaused ? "PAUSED" : isRunning ? "RUNNING" : status}
      </Badge>

      {activeSession && (
        <span className="mr-2 max-w-[120px] truncate text-[11px] text-muted-foreground">
          {activeSession.name}
        </span>
      )}

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={cont}
        disabled={!isPaused}
        title="Continue (F5)"
        aria-label="Continue"
      >
        <Play className="size-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={pause}
        disabled={!isRunning}
        title="Pause (F6)"
        aria-label="Pause"
      >
        <Pause className="size-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={stepOvr}
        disabled={!canStep}
        title="Step Over (F10)"
        aria-label="Step Over"
      >
        <CornerDownRight className="size-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={stepIn}
        disabled={!canStep}
        title="Step Into (F11)"
        aria-label="Step Into"
      >
        <ArrowDownToLine className="size-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={stepOut}
        disabled={!canStep}
        title="Step Out (Shift+F11)"
        aria-label="Step Out"
      >
        <ArrowUpToLine className="size-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleRestart}
        disabled={!isTerminated && !isPaused}
        title="Restart"
        aria-label="Restart"
      >
        <RotateCcw className="size-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleStop}
        disabled={isTerminated}
        title="Stop (Shift+F5)"
        aria-label="Stop"
      >
        <Square className="size-3.5" />
      </Button>
    </div>
  );
}
