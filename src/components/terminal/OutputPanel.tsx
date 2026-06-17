import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";

interface LogEntry {
  id: number;
  text: string;
  level: "info" | "warn" | "error";
  timestamp: number;
}

let logId = 0;
const logs: LogEntry[] = [];
const listeners = new Set<() => void>();

export function pushLog(text: string, level: LogEntry["level"] = "info") {
  logs.push({ id: ++logId, text, level, timestamp: Date.now() });
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  for (const l of listeners) l();
}

export function clearLogs() {
  logs.length = 0;
  for (const l of listeners) l();
}

export function OutputPanel() {
  const [, setTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const update = () => { if (mountedRef.current) setTick((t) => t + 1); };
    listeners.add(update);
    return () => {
      mountedRef.current = false;
      listeners.delete(update);
    };
  }, []);

  // Intercept console methods
  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = (...args: unknown[]) => { pushLog(args.map((a) => String(a)).join(" "), "info"); origLog(...args); };
    console.warn = (...args: unknown[]) => { pushLog(args.map((a) => String(a)).join(" "), "warn"); origWarn(...args); };
    console.error = (...args: unknown[]) => { pushLog(args.map((a) => String(a)).join(" "), "error"); origError(...args); };
    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground">
        <span>Application Output</span>
        <button
          onClick={clearLogs}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Clear output"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            No output yet
          </div>
        ) : (
          <div className="space-y-0.5 px-3 pb-2 font-mono text-xs">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className={
                  entry.level === "error"
                    ? "text-destructive"
                    : entry.level === "warn"
                      ? "text-yellow-500"
                      : "text-foreground/80"
                }
              >
                {entry.text}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
