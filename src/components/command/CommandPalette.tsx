import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fuzzyFilter } from "@/lib/fuzzySearch";
import { getAllCommands } from "@/lib/commandRegistry";
import { useKeybindingStore } from "@/stores/keybindingStore";
import { getPlatformModifier } from "@/lib/platform";
import type { CommandDefinition } from "@/types/commands";

function formatKeybindingDisplay(combo: string): string {
  if (!combo) return "";
  const mod = getPlatformModifier() === "Cmd" ? "⌘" : "Ctrl";
  return combo
    .replace("mod", mod)
    .split("+")
    .map((k) => {
      if (k === "shift") return "Shift";
      if (k === "alt") return "Alt";
      if (k === "`") return "`";
      return k.charAt(0).toUpperCase() + k.slice(1);
    })
    .join("+");
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const overrides = useKeybindingStore((s) => s.overrides);

  const allCommands = useMemo(() => getAllCommands(), []);

  const enriched = useMemo(
    () =>
      allCommands.map((cmd) => {
        const override = overrides[cmd.id];
        const effective = override
          ? formatKeybindingDisplay(override)
          : cmd.keybinding;
        return {
          ...cmd,
          keybinding: effective || undefined,
        };
      }),
    [allCommands, overrides],
  );

  const filtered = useMemo(() => {
    if (!query) {
      return enriched
        .filter((c) => c.keybinding)
        .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
    }
    return fuzzyFilter(enriched, query, (c) => `${c.category} ${c.label}`);
  }, [query, enriched]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const execute = useCallback(
    (cmd: CommandDefinition) => {
      cmd.action();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        if (filtered.length === 0) return;
        e.preventDefault();
        setActiveIdx((p) => Math.min(p + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((p) => Math.max(p - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[activeIdx]) {
        e.preventDefault();
        execute(filtered[activeIdx]);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, activeIdx, execute, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-popover shadow-2xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Type a command…"
            className="h-10 border-0 bg-transparent pl-9 pr-8 text-sm shadow-none focus-visible:ring-0"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="border-t border-border" />
        <ScrollArea className="max-h-72">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No matching commands
            </p>
          ) : (
            <div className="py-1">
              {filtered.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={() => execute(cmd)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm hover:bg-muted",
                    activeIdx === i && "bg-muted",
                  )}
                >
                  <span className="flex-1 truncate">{cmd.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground/60">
                    {cmd.category}
                  </span>
                  {cmd.keybinding && (
                    <kbd className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {cmd.keybinding}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
