import { useCallback, useState, useSyncExternalStore } from "react";
import { executionService } from "@/core/execution/ExecutionService";

export function StopButton() {
  const [stopping, setStopping] = useState(false);
  const registry = executionService.getRegistry();

  const running = useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.hasRunning(),
  );

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await executionService.stopAll();
    } finally {
      setStopping(false);
    }
  }, []);

  if (!running) return null;

  return (
    <button
      onClick={handleStop}
      disabled={stopping}
      className="flex size-6 items-center justify-center rounded text-xs text-red-400 hover:bg-muted hover:text-red-300 disabled:opacity-40"
      title="Stop All"
    >
      ■
    </button>
  );
}
