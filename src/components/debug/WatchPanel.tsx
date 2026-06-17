import { useState, useCallback, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebugStore } from "@/stores/debugStore";
import { Plus, X, EyeOff, Loader2 } from "lucide-react";

function WatchPanelContent() {
  const [expression, setExpression] = useState("");
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const watchExpressions = useDebugStore((s) => s.watchExpressions);
  const addWatch = useDebugStore((s) => s.addWatch);
  const removeWatch = useDebugStore((s) => s.removeWatch);
  const updateWatch = useDebugStore((s) => s.updateWatch);
  const clearWatches = useDebugStore((s) => s.clearWatches);
  const activeSessionId = useDebugStore((s) => s.activeSessionId);
  const sessions = useDebugStore((s) => s.sessions);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const isPaused = activeSession?.status === "paused";

  const evaluateAll = useCallback(async () => {
    for (const w of watchExpressions) {
      setEvaluatingId(w.id);
      try {
        const result = await useDebugStore
          .getState()
          .evaluateInRepl(w.expression);
        if (result) {
          updateWatch(w.id, result.result, result.type);
        } else {
          updateWatch(w.id, "(not available)");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateWatch(w.id, "", undefined, undefined, msg);
      }
    }
    setEvaluatingId(null);
  }, [watchExpressions, updateWatch]);

  useEffect(() => {
    if (isPaused && watchExpressions.length > 0) {
      evaluateAll();
    }
  }, [isPaused, watchExpressions.length]);

  const handleAdd = useCallback(() => {
    const trimmed = expression.trim();
    if (!trimmed) return;
    addWatch(trimmed);
    setExpression("");
  }, [expression, addWatch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleAdd();
      }
    },
    [handleAdd],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Input
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add watch expression..."
          className="h-7 text-xs"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleAdd}
          disabled={!expression.trim()}
          title="Add expression"
        >
          <Plus className="size-3" />
        </Button>
      </div>

      {watchExpressions.length > 0 ? (
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Expressions
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={clearWatches}
              className="text-[10px] text-muted-foreground hover:text-destructive"
            >
              Clear All
            </Button>
          </div>
          <ScrollArea className="h-full">
            <div className="pb-2">
              {watchExpressions.map((w) => (
                <div
                  key={w.id}
                  className="group flex items-start gap-1 px-3 py-1 hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] text-muted-foreground">
                      {w.expression}
                    </div>
                    {evaluatingId === w.id ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="size-2.5 animate-spin" />
                        Evaluating...
                      </div>
                    ) : w.error ? (
                      <div className="truncate text-xs text-destructive">
                        {w.error}
                      </div>
                    ) : w.value != null ? (
                      <div className="truncate text-xs text-green-600 dark:text-green-400">
                        {w.value}
                        {w.type && (
                          <span className="ml-1 text-[10px] text-muted-foreground/50">
                            {w.type}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground/50">
                        Not evaluated
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeWatch(w.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100"
                    title="Remove watch"
                  >
                    <X className="size-2.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
          <EyeOff className="size-8 opacity-40" />
          <span>No watch expressions</span>
        </div>
      )}
    </div>
  );
}

export function WatchPanel() {
  return <WatchPanelContent />;
}
