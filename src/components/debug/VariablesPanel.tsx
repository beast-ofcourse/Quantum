import { useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebugStore } from "@/stores/debugStore";
import { cn } from "@/lib/utils";
import type { Variable, Scope } from "@/types/debug";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Code2,
} from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  string: "text-green-600 dark:text-green-400",
  number: "text-blue-600 dark:text-blue-400",
  boolean: "text-orange-600 dark:text-orange-400",
  undefined: "text-gray-400 dark:text-gray-600",
  object: "text-purple-600 dark:text-purple-400",
  function: "text-yellow-600 dark:text-yellow-400",
  symbol: "text-pink-600 dark:text-pink-400",
  bigint: "text-cyan-600 dark:text-cyan-400",
};

function getTypeColor(type?: string): string {
  if (!type) return "text-foreground";
  const t = type.toLowerCase();
  return TYPE_COLORS[t] ?? "text-foreground";
}

function formatValue(variable: Variable): string {
  if (variable.variablesReference > 0) {
    if (variable.namedVariables != null || variable.indexedVariables != null) {
      const named = variable.namedVariables ?? 0;
      const indexed = variable.indexedVariables ?? 0;
      const total = named + indexed;
      if (variable.type?.toLowerCase() === "array" || (indexed > 0 && named === 0)) {
        return `Array(${indexed})`;
      }
      if (named > 0 && indexed > 0) {
        return `{…} (${named} items)`;
      }
      return total > 0 ? `{…} (${total} items)` : `{…}`;
    }
    return variable.type ? `{…}` : variable.value;
  }
  return variable.value;
}

function VariableRow({
  variable,
  depth,
}: {
  variable: Variable;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const childVariables = useDebugStore(
    (s) => s.variables[variable.variablesReference],
  );
  const hasChildren = variable.variablesReference > 0;

  const handleToggle = useCallback(() => {
    if (!hasChildren) return;
    if (!expanded) {
      if (!childVariables) {
        setLoading(true);
        useDebugStore.getState()
          .loadVariables(variable.variablesReference)
          .finally(() => setLoading(false));
      }
    }
    setExpanded((v) => !v);
  }, [hasChildren, expanded, childVariables, variable.variablesReference]);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent/50"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={handleToggle}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="inline-block w-3 shrink-0" />
        )}
        <span className="shrink-0 text-foreground">{variable.name}</span>
        <span className="text-muted-foreground">:</span>
        <span className={cn("shrink-0", getTypeColor(variable.type))}>
          {loading ? (
            <Loader2 className="inline size-3 animate-spin" />
          ) : (
            formatValue(variable)
          )}
        </span>
        {variable.type && !loading && (
          <span className="truncate text-[10px] text-muted-foreground/50">
            {variable.type}
          </span>
        )}
      </button>
      {expanded && hasChildren && childVariables && (
        <div>
          {childVariables.length === 0 ? (
            <div
              className="py-0.5 text-[10px] text-muted-foreground/50"
              style={{ paddingLeft: `${24 + depth * 14}px` }}
            >
              No properties
            </div>
          ) : (
            childVariables.map((child) => (
              <VariableRow
                key={child.name}
                variable={child}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ScopeSection({ scope }: { scope: Scope }) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const variables = useDebugStore(
    (s) => s.variables[scope.variablesReference],
  );

  const handleToggle = useCallback(() => {
    if (!expanded && !variables) {
      setLoading(true);
      useDebugStore.getState()
        .loadVariables(scope.variablesReference)
        .finally(() => setLoading(false));
    }
    setExpanded((v) => !v);
  }, [expanded, variables, scope.variablesReference]);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-medium text-muted-foreground hover:bg-accent/50"
        onClick={handleToggle}
      >
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {scope.name}
        {scope.expensive && (
          <span className="text-[10px] text-yellow-500">(expensive)</span>
        )}
      </button>
      {expanded && (
        <div>
          {loading ? (
            <div className="space-y-1 px-4 py-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : variables ? (
            variables.length === 0 ? (
              <div className="px-4 py-1 text-[10px] text-muted-foreground/50">
                No variables
              </div>
            ) : (
              variables.map((v) => (
                <VariableRow
                  key={v.name}
                  variable={v}
                  depth={0}
                />
              ))
            )
          ) : (
            <button
              type="button"
              className="w-full px-4 py-1 text-left text-[10px] text-muted-foreground/50 hover:text-foreground"
              onClick={handleToggle}
            >
              Click to load
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VariablesPanelContent() {
  const sessions = useDebugStore((s) => s.sessions);
  const activeSessionId = useDebugStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const scopes = useDebugStore((s) => s.scopes);

  if (!activeSession || (activeSession.status !== "paused" && activeSession.status !== "stepping")) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <Code2 className="size-8 opacity-40" />
        <span>Not paused</span>
      </div>
    );
  }

  if (scopes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <Code2 className="size-8 opacity-40" />
        <span>No variables available</span>
      </div>
    );
  }

  return (
    <div className="py-1">
      {scopes.map((scope) => (
        <ScopeSection key={scope.name + scope.variablesReference} scope={scope} />
      ))}
    </div>
  );
}

export function VariablesPanel() {
  return (
    <ScrollArea className="h-full">
      <VariablesPanelContent />
    </ScrollArea>
  );
}
