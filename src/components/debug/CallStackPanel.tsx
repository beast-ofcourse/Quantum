import { useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDebugStore } from "@/stores/debugStore";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";
import { ListRestart, ArrowUpFromLine } from "lucide-react";

function CallStackPanelContent() {
  const sessions = useDebugStore((s) => s.sessions);
  const activeSessionId = useDebugStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const callStack = useDebugStore((s) => s.callStack);
  const openFile = useEditorStore((s) => s.openFile);

  const handleFrameClick = useCallback(
    async (frame: (typeof callStack)[number]) => {
      const source = frame.source;
      if (source?.path) {
        await openFile(source.path);
        const editorStore = useEditorStore.getState();
        editorStore.setCursor?.(source.path, frame.line, frame.column);
      }
    },
    [openFile],
  );

  if (!activeSession || (activeSession.status !== "paused" && activeSession.status !== "stepping")) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <ArrowUpFromLine className="size-8 opacity-40" />
        <span>Not paused</span>
      </div>
    );
  }

  if (callStack.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <ListRestart className="size-8 opacity-40" />
        <span>No call stack</span>
      </div>
    );
  }

  return (
    <div className="py-1">
      {callStack.map((frame, index) => {
        const sourcePath = frame.source?.path;
        const sourceName = frame.source?.name ?? "unknown";
        const displayPath = sourcePath
          ? sourcePath.split(/[\\/]/).slice(-3).join("/")
          : sourceName;
        const isActive = index === 0;

        return (
          <button
            key={`${frame.id}-${index}`}
            type="button"
            className={cn(
              "flex w-full flex-col gap-0.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
              isActive && "bg-accent",
            )}
            onClick={() => handleFrameClick(frame)}
          >
            <span
              className={cn(
                "truncate font-medium",
                isActive ? "text-foreground" : "text-foreground/80",
              )}
            >
              {frame.name}
            </span>
            <span className="truncate text-[10px] text-muted-foreground">
              {displayPath}:{frame.line}
              {frame.column > 1 ? `:${frame.column}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CallStackPanel() {
  return (
    <ScrollArea className="h-full">
      <CallStackPanelContent />
    </ScrollArea>
  );
}
