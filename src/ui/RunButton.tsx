import { useCallback, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";
import { executionService } from "@/core/execution/ExecutionService";

export function RunButton() {
  const [running, setRunning] = useState(false);
  const activeTab = useEditorStore((s) => s.getActiveTab());
  const rootPath = useFileStore((s) => s.rootPath);

  const handleRun = useCallback(async () => {
    if (!activeTab || !rootPath) return;
    setRunning(true);
    try {
      await executionService.run({
        file: activeTab.path,
        cwd: rootPath,
      });
    } finally {
      setRunning(false);
    }
  }, [activeTab, rootPath]);

  if (!activeTab) return null;

  return (
    <button
      onClick={handleRun}
      disabled={running}
      className="flex size-6 items-center justify-center rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      title="Run Active File"
    >
      {running ? "..." : "▶"}
    </button>
  );
}
