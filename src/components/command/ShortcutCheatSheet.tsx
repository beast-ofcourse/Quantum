import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Search, Keyboard, RotateCcw, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getHotkeyRegistry } from "@/lib/hotkeys";
import { getAllCommands } from "@/lib/commandRegistry";
import { getPlatformModifier } from "@/lib/platform";
import { useKeybindingStore } from "@/stores/keybindingStore";
import { DEFAULT_KEYBINDINGS } from "@/lib/defaultKeybindings";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShortcutEntry {
  id: string;
  category: string;
  description: string;
  keys: string;
  isOverridden: boolean;
}

type RecordingState =
  | { status: "idle" }
  | { status: "recording"; id: string }
  | { status: "confirming"; id: string; combo: string };

// ---------------------------------------------------------------------------
// Combo helpers
// ---------------------------------------------------------------------------

function formatCombo(combo: string): string {
  if (!combo) return "";
  const mod = getPlatformModifier() === "Cmd" ? "⌘" : "Ctrl";
  return combo
    .replace("mod", mod)
    .split("+")
    .map((k) => {
      if (k === "shift") return "⇧";
      if (k === "alt") return "⌥";
      if (k === "`") return "`";
      if (k === ",") return ",";
      if (k.length === 1) return k.toUpperCase();
      return k.charAt(0).toUpperCase() + k.slice(1);
    })
    .join("");
}

function normalizeCombo(combo: string): string {
  return combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .sort()
    .join("+");
}

function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
    parts.push(key);
  }
  return parts.sort().join("+");
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

function findConflicts(
  commandId: string,
  newCombo: string,
  overrides: Record<string, string>,
): { id: string; description: string }[] {
  const normalized = normalizeCombo(newCombo);
  const conflicts: { id: string; description: string }[] = [];

  for (const [id, def] of Object.entries(DEFAULT_KEYBINDINGS)) {
    if (id === commandId || !def.combo) continue;
    const effective = overrides[id] ?? def.combo;
    if (normalizeCombo(effective) === normalized) {
      conflicts.push({ id, description: def.description });
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ShortcutCheatSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutCheatSheet({ open, onClose }: ShortcutCheatSheetProps) {
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState<RecordingState>({ status: "idle" });
  const [capturedCombo, setCapturedCombo] = useState("");
  const [conflictWarning, setConflictWarning] = useState<{
    id: string;
    combo: string;
    conflicts: { id: string; description: string }[];
  } | null>(null);

  const overrides = useKeybindingStore((s) => s.overrides);
  const setBinding = useKeybindingStore((s) => s.setBinding);
  const resetBinding = useKeybindingStore((s) => s.resetBinding);
  const resetAll = useKeybindingStore((s) => s.resetAll);

  const recInputRef = useRef<HTMLInputElement>(null);

  // Prevent body scrolling while dialog is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus recording input when entering recording mode
  useEffect(() => {
    if (recording.status === "recording" && recInputRef.current) {
      recInputRef.current.focus();
    }
  }, [recording.status]);

  // Build the full shortcut list from all sources
  const shortcuts = useMemo(() => {
    const entries: ShortcutEntry[] = [];
    const seen = new Set<string>();

    // 1) From DEFAULT_KEYBINDINGS (the authoritative source)
    for (const [id, def] of Object.entries(DEFAULT_KEYBINDINGS)) {
      const effective = overrides[id] ?? def.combo;
      entries.push({
        id,
        category: def.category || "Commands",
        description: def.description,
        keys: effective ? formatCombo(effective) : "",
        isOverridden: id in overrides,
      });
      seen.add(id);
    }

    // 2) From hotkey registry (may have extra items not in DEFAULT_KEYBINDINGS)
    getHotkeyRegistry()
      .list()
      .forEach((hotkey) => {
        if (seen.has(hotkey.id)) return;
        seen.add(hotkey.id);
        entries.push({
          id: hotkey.id,
          category: "General",
          description: hotkey.description,
          keys: formatCombo(hotkey.combo),
          isOverridden: false,
        });
      });

    // 3) From command registry (extra commands with keybindings)
    try {
      const commands = getAllCommands();
      for (const cmd of commands) {
        if (!cmd.keybinding || seen.has(cmd.id)) continue;
        seen.add(cmd.id);
        entries.push({
          id: cmd.id,
          category: cmd.category || "Commands",
          description: cmd.label,
          keys: cmd.keybinding,
          isOverridden: false,
        });
      }
    } catch {
      /* command registry may not be ready */
    }

    return entries.sort((a, b) => {
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return catCmp;
      return a.description.localeCompare(b.description);
    });
  }, [overrides]);

  const filtered = useMemo(() => {
    if (!search) return shortcuts;
    const q = search.toLowerCase();
    return shortcuts.filter(
      (s) =>
        s.description.toLowerCase().includes(q) ||
        s.keys.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [search, shortcuts]);

  const grouped = useMemo(() => {
    const map = new Map<string, ShortcutEntry[]>();
    for (const s of filtered) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return map;
  }, [filtered]);

  const overrideCount = useMemo(
    () => Object.keys(overrides).length,
    [overrides],
  );

  // Start recording a new binding
  const startRecording = useCallback((id: string) => {
    setConflictWarning(null);
    setCapturedCombo("");
    setRecording({ status: "recording", id });
  }, []);

  // Cancel recording
  const cancelRecording = useCallback(() => {
    setRecording({ status: "idle" });
    setCapturedCombo("");
  }, []);

  // Handle keydown during recording
  const handleRecKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        cancelRecording();
        return;
      }

      if (e.key === "Enter" && capturedCombo) {
        // Confirm the binding
        const combo = capturedCombo;
        if (recording.status !== "recording") return;
        const cmdId = recording.id;

        // Check conflicts
        const conflicts = findConflicts(cmdId, combo, overrides);
        if (conflicts.length > 0) {
          setConflictWarning({ id: cmdId, combo, conflicts });
          setRecording({ status: "idle" });
          return;
        }

        setBinding(cmdId, combo);
        setRecording({ status: "idle" });
        setCapturedCombo("");
        return;
      }

      if (e.key === "Backspace" && !capturedCombo) {
        cancelRecording();
        return;
      }

      // Capture the combo from the keyboard event
      const nativeEvent = e.nativeEvent;
      const combo = comboFromEvent(nativeEvent);
      if (
        combo &&
        !["mod", "shift", "alt", "mod+shift", "mod+alt", "shift+alt", "mod+shift+alt"].includes(combo)
      ) {
        setCapturedCombo(combo);
      }
    },
    [capturedCombo, recording, overrides, setBinding, cancelRecording],
  );

  // Confirm a conflicted binding
  const confirmConflict = useCallback(() => {
    if (!conflictWarning) return;
    setBinding(conflictWarning.id, conflictWarning.combo);
    setConflictWarning(null);
    setRecording({ status: "idle" });
    setCapturedCombo("");
  }, [conflictWarning, setBinding]);

  // Cancel conflict
  const cancelConflict = useCallback(() => {
    setConflictWarning(null);
  }, []);

  // Reset a specific binding
  const handleReset = useCallback(
    (id: string) => {
      resetBinding(id);
    },
    [resetBinding],
  );

  // Reset all
  const handleResetAll = useCallback(() => {
    if (
      overrideCount === 0 ||
      confirm(`Reset all ${overrideCount} custom keybinding(s) to defaults?`)
    ) {
      resetAll();
    }
  }, [overrideCount, resetAll]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setRecording({ status: "idle" }); setConflictWarning(null); } }}>
      <DialogContent
        className={cn(
          "max-h-[80vh] max-w-xl overflow-hidden",
          "grid grid-rows-[auto_auto_1fr] gap-0 p-0",
        )}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="size-4" />
              Keyboard Shortcuts
            </DialogTitle>
            <div className="flex items-center gap-2">
              {overrideCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {overrideCount} modified
                </span>
              )}
              <Button
                size="xs"
                variant="outline"
                onClick={handleResetAll}
                disabled={overrideCount === 0}
                className="text-[10px] h-6"
              >
                <RotateCcw className="size-2.5 mr-1" />
                Reset All
              </Button>
            </div>
          </div>
          <DialogDescription>
            {shortcuts.length} shortcuts — click a row to remap
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative px-6 pb-3">
          <Search className="absolute left-9 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search shortcuts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search shortcuts"
          />
        </div>

        {/* Shortcut list */}
        <div className="min-h-0 overflow-y-auto px-6 pb-6">
          {/* Conflict warning */}
          {conflictWarning && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <p className="mb-2 font-medium text-amber-600 dark:text-amber-400">
                Shortcut conflict
              </p>
              <p className="mb-2 text-muted-foreground">
                "{formatCombo(conflictWarning.combo)}" is already used by:
              </p>
              <ul className="mb-3 list-inside list-disc space-y-0.5 text-muted-foreground">
                {conflictWarning.conflicts.map((c) => (
                  <li key={c.id}>{c.description}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  size="xs"
                  variant="default"
                  onClick={confirmConflict}
                >
                  <Check className="size-3 mr-1" />
                  Assign anyway
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={cancelConflict}
                >
                  <X className="size-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {grouped.size === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No shortcuts match your search
            </p>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category} className="mb-4 last:mb-0">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </h3>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const isRecording =
                      recording.status === "recording" &&
                      recording.id === item.id;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "group flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                          isRecording
                            ? "bg-accent ring-1 ring-ring"
                            : "hover:bg-muted",
                          item.isOverridden && !isRecording && "bg-amber-500/5",
                        )}
                      >
                        {/* Left: description */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {item.isOverridden && !isRecording && (
                            <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Modified" />
                          )}
                          <span
                            className={cn(
                              "truncate",
                              item.isOverridden && "font-medium",
                            )}
                          >
                            {item.description}
                          </span>
                        </div>

                        {/* Right: keybinding / recorder */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                          {isRecording ? (
                            <div className="flex items-center gap-1">
                              <input
                                ref={recInputRef}
                                type="text"
                                className="w-28 rounded border border-border bg-background px-2 py-0.5 text-[10px] font-mono text-foreground outline-none"
                                value={
                                  capturedCombo
                                    ? formatCombo(capturedCombo)
                                    : ""
                                }
                                placeholder="Press keys..."
                                readOnly
                                onKeyDown={handleRecKeyDown}
                                onBlur={() => {
                                  // Small delay so button clicks work
                                  setTimeout(() => {
                                    if (recording.status === "recording")
                                      cancelRecording();
                                  }, 150);
                                }}
                              />
                              {capturedCombo && (
                                <button
                                  onClick={() => {
                                    if (recording.status !== "recording")
                                      return;
                                    const conflicts = findConflicts(
                                      recording.id,
                                      capturedCombo,
                                      overrides,
                                    );
                                    if (conflicts.length > 0) {
                                      setConflictWarning({
                                        id: recording.id,
                                        combo: capturedCombo,
                                        conflicts,
                                      });
                                      setRecording({ status: "idle" });
                                      return;
                                    }
                                    setBinding(recording.id, capturedCombo);
                                    setRecording({ status: "idle" });
                                    setCapturedCombo("");
                                  }}
                                  className="rounded p-0.5 text-green-500 hover:bg-green-500/10"
                                  title="Confirm"
                                >
                                  <Check className="size-3" />
                                </button>
                              )}
                              <button
                                onClick={cancelRecording}
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                                title="Cancel"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              {item.keys ? (
                                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                                  {item.keys}
                                </kbd>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">
                                  none
                                </span>
                              )}

                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => startRecording(item.id)}
                                  className="rounded px-1 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                  title="Change shortcut"
                                >
                                  ✎
                                </button>
                                {item.isOverridden && (
                                  <button
                                    onClick={() => handleReset(item.id)}
                                    className="rounded px-1 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                    title="Reset to default"
                                  >
                                    <RotateCcw className="size-2.5" />
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
