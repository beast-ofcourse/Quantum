import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Bug } from "lucide-react";

interface DebugMessage {
  id: number;
  source: string;
  text: string;
  level: "debug" | "info" | "warn" | "error";
  timestamp: number;
}

let msgId = 0;
const messages: DebugMessage[] = [];
const listeners = new Set<() => void>();

export function pushDebugMessage(source: string, text: string, level: DebugMessage["level"] = "debug") {
  messages.push({ id: ++msgId, source, text, level, timestamp: Date.now() });
  if (messages.length > 500) messages.splice(0, messages.length - 500);
  for (const l of listeners) l();
}

export function clearDebugMessages() {
  messages.length = 0;
  for (const l of listeners) l();
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-muted-foreground/60",
  info: "text-foreground/80",
  warn: "text-yellow-500",
  error: "text-destructive",
};

export function DebugConsolePanel() {
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Bug className="size-3" />
          Debug Console
        </span>
        <button
          onClick={clearDebugMessages}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Clear debug console"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            No debug messages
          </div>
        ) : (
          <div className="space-y-0.5 px-3 pb-2 font-mono text-xs">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/40">
                  [{msg.source}]
                </span>
                <span className={LEVEL_COLORS[msg.level] || "text-foreground/80"}>
                  {msg.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
