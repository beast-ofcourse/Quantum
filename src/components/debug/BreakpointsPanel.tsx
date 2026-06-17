import { useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useDebugStore } from "@/stores/debugStore";
import { cn } from "@/lib/utils";
import {
  X,
  Ban,
  Circle,
  CircleCheck,
} from "lucide-react";

function BreakpointsPanelContent() {
  const breakpoints = useDebugStore((s) => s.breakpoints);
  const toggleBreakpoint = useDebugStore((s) => s.toggleBreakpoint);
  const removeBreakpoint = useDebugStore((s) => s.removeBreakpoint);
  const clearAllBreakpoints = useDebugStore((s) => s.clearAllBreakpoints);
  const exceptionBreakpoints = useDebugStore((s) => s.exceptionBreakpoints);
  const setExceptionBreakpoints = useDebugStore((s) => s.setExceptionBreakpoints);
  const availableExceptionFilters = useDebugStore((s) => s.availableExceptionFilters);

  const hasBreakpoints = breakpoints.size > 0;
  const hasExceptionFilters = availableExceptionFilters.length > 0;

  const handleToggleException = useCallback(
    (filter: string) => {
      const current = exceptionBreakpoints;
      const next = current.includes(filter)
        ? current.filter((f) => f !== filter)
        : [...current, filter];
      setExceptionBreakpoints(next);
    },
    [exceptionBreakpoints, setExceptionBreakpoints],
  );

  return (
    <div className="py-1 text-xs">
      {hasExceptionFilters && (
        <div className="px-2 pb-1">
          <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Exception Breakpoints
          </div>
          {availableExceptionFilters.map((filter) => (
            <label
              key={filter}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent/50"
            >
              <input
                type="checkbox"
                checked={exceptionBreakpoints.includes(filter)}
                onChange={() => handleToggleException(filter)}
                className="size-3 rounded border-border accent-primary"
              />
              <span className="text-foreground/80">{filter}</span>
            </label>
          ))}
          <Separator className="my-2" />
        </div>
      )}

      {hasBreakpoints ? (
        <div>
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Breakpoints
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={clearAllBreakpoints}
              className="text-[10px] text-muted-foreground hover:text-destructive"
            >
              Clear All
            </Button>
          </div>
          {Array.from(breakpoints.entries()).map(([filePath, bps]) => {
            const displayPath = filePath.split(/[\\/]/).slice(-3).join("/");
            return (
              <div key={filePath} className="mb-1">
                <div className="truncate px-3 py-0.5 text-[10px] font-medium text-muted-foreground/70">
                  {displayPath}
                </div>
                {bps.map((bp) => (
                  <div
                    key={`${filePath}-${bp.line}`}
                    className={cn(
                      "group flex items-center gap-1 px-3 py-1 hover:bg-accent/50",
                      !bp.enabled && "opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleBreakpoint(filePath, bp.line)}
                      className="flex items-center gap-1 text-left"
                      title={bp.enabled ? "Disable breakpoint" : "Enable breakpoint"}
                    >
                      {bp.verified ? (
                        <CircleCheck className="size-3 text-blue-500" />
                      ) : (
                        <Circle className="size-3 text-muted-foreground" />
                      )}
                    </button>
                    <span className="min-w-[2ch] font-mono text-muted-foreground">
                      {bp.line}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-4 px-1 text-[9px] font-mono",
                        bp.verified
                          ? "border-blue-500/30 text-blue-500"
                          : "border-muted-foreground/30 text-muted-foreground",
                      )}
                    >
                      {bp.verified ? "verified" : "unverified"}
                    </Badge>
                    {bp.message && (
                      <span className="truncate text-[10px] text-yellow-500">
                        {bp.message}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeBreakpoint(filePath, bp.line)}
                      className="ml-auto shrink-0 opacity-0 group-hover:opacity-100"
                      title="Remove breakpoint"
                    >
                      <X className="size-2.5" />
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Ban className="size-8 opacity-40" />
          <span>No breakpoints set</span>
          <span className="text-[10px]">
            Click the gutter in the editor to add
          </span>
        </div>
      )}
    </div>
  );
}

export function BreakpointsPanel() {
  return (
    <ScrollArea className="h-full">
      <BreakpointsPanelContent />
    </ScrollArea>
  );
}
