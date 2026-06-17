import { useState, useMemo, useCallback } from "react";
import { Search, RotateCcw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKeybindingStore } from "@/stores/keybindingStore";
import { DEFAULT_KEYBINDINGS } from "@/lib/defaultKeybindings";
import { getPlatformModifier } from "@/lib/platform";
import { fuzzyFilter } from "@/lib/fuzzySearch";
import { KeybindingCapture } from "./KeybindingCapture";

function formatComboDisplay(combo: string): string {
  if (!combo) return "";
  const mod = getPlatformModifier() === "Cmd" ? "⌘" : "Ctrl";
  return combo
    .replace("mod", mod)
    .split("+")
    .map((k) => {
      if (k === "shift") return "Shift";
      if (k === "alt") return "Alt";
      if (k === " ") return "Space";
      if (k === "`") return "`";
      if (k === ",") return ",";
      return k.charAt(0).toUpperCase() + k.slice(1);
    })
    .join(" + ");
}

interface KeybindingEntry {
  commandId: string;
  label: string;
  description: string;
  category: string;
  defaultCombo: string;
  currentCombo: string;
}

export function KeybindingSettings() {
  const [search, setSearch] = useState("");
  const [capturingId, setCapturingId] = useState<string | null>(null);

  const overrides = useKeybindingStore((s) => s.overrides);
  const setBinding = useKeybindingStore((s) => s.setBinding);
  const resetBinding = useKeybindingStore((s) => s.resetBinding);
  const resetAll = useKeybindingStore((s) => s.resetAll);

  const entries: KeybindingEntry[] = useMemo(
    () =>
      Object.entries(DEFAULT_KEYBINDINGS).map(([commandId, def]) => ({
        commandId,
        label: def.description,
        description: def.description,
        category: def.category,
        defaultCombo: def.combo,
        currentCombo: overrides[commandId] ?? def.combo,
      })),
    [overrides],
  );

  const filtered = useMemo(
    () => fuzzyFilter(entries, search, (e) => `${e.category} ${e.label}`),
    [search],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, KeybindingEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.category) ?? [];
      list.push(e);
      map.set(e.category, list);
    }
    return map;
  }, [filtered]);

  const hasCustom = Object.keys(overrides).length > 0;

  const handleCapture = useCallback(
    (combo: string) => {
      if (capturingId) {
        setBinding(capturingId, combo);
        setCapturingId(null);
      }
    },
    [capturingId, setBinding],
  );

  const handleCancelCapture = useCallback(() => {
    setCapturingId(null);
  }, []);

  const handleResetAll = useCallback(() => {
    resetAll();
  }, [resetAll]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
        {hasCustom && (
          <Button variant="ghost" size="xs" onClick={handleResetAll}>
            <RotateCcw className="mr-1 size-3" />
            Reset All
          </Button>
        )}
      </div>
      <div className="relative border-b border-border px-4 py-2">
        <Search className="pointer-events-none absolute left-6 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shortcuts…"
          className="h-8 pl-7 text-xs"
        />
      </div>
      <ScrollArea className="max-h-96">
        <div className="px-4 py-2">
          {grouped.size === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No shortcuts match your search.
            </p>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category} className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </h3>
                {items.map((item) => {
                  const isCapturing = capturingId === item.commandId;
                  const isCustom = item.commandId in overrides;
                  return (
                    <div
                      key={item.commandId}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{item.label}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCapturing ? (
                          <KeybindingCapture
                            value={item.currentCombo}
                            onChange={handleCapture}
                            onCancel={handleCancelCapture}
                          />
                        ) : (
                          <button
                            type="button"
                            className="inline-flex h-7 min-w-[100px] items-center justify-center rounded border border-border bg-background px-2 text-xs font-mono text-foreground transition-colors hover:border-accent-foreground/50"
                            onClick={() => setCapturingId(item.commandId)}
                          >
                            {item.currentCombo
                              ? formatComboDisplay(item.currentCombo)
                              : <span className="text-muted-foreground/50 italic">—</span>}
                          </button>
                        )}
                        {isCustom && (
                          <button
                            type="button"
                            className="flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground"
                            title="Reset to default"
                            onClick={() => resetBinding(item.commandId)}
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
