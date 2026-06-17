import { useState, useCallback, useMemo, useEffect } from "react";
import { X, Palette } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeService } from "@/lib/themeService";
import { useUiStore } from "@/stores/uiStore";
import { ColorGroup, type ColorGroupDef } from "./ColorGroup";
import { ThemeEditorToolbar } from "./ThemeEditorToolbar";
import { ThemePreview } from "./ThemePreview";

const COLOR_GROUPS: ColorGroupDef[] = [
  {
    id: "editor",
    label: "Editor",
    keys: [
      "editor.background", "editor.foreground",
      "editor.lineHighlightBackground", "editor.selectionBackground",
      "editor.selectionForeground", "editor.wordHighlight",
      "editor.wordHighlightStrong", "editor.findMatch",
      "editor.findMatchHighlight", "editor.rangeHighlight",
      "editorCursor.foreground", "editor.invisibles",
      "editorLineNumber.foreground", "editorLineNumber.activeForeground",
      "editorIndentGuide.background1", "editorIndentGuide.activeBackground1",
      "editorWidget.background", "editorWidget.border",
      "editorSuggestWidget.background", "editorSuggestWidget.border",
      "editorSuggestWidget.selectedBackground",
    ],
  },
  {
    id: "sidebar",
    label: "Sidebar",
    keys: [
      "sidebar.background", "sidebar.foreground", "sidebar.border",
      "sidebar.sectionHeaderBackground", "sidebar.sectionHeaderForeground",
    ],
  },
  {
    id: "terminal",
    label: "Terminal",
    keys: [
      "terminal.background", "terminal.foreground", "terminal.cursor",
      "terminal.cursorAccent", "terminal.selectionBackground",
      "terminal.ansiBlack", "terminal.ansiRed", "terminal.ansiGreen",
      "terminal.ansiYellow", "terminal.ansiBlue", "terminal.ansiMagenta",
      "terminal.ansiCyan", "terminal.ansiWhite",
      "terminal.ansiBrightBlack", "terminal.ansiBrightRed",
      "terminal.ansiBrightGreen", "terminal.ansiBrightYellow",
      "terminal.ansiBrightBlue", "terminal.ansiBrightMagenta",
      "terminal.ansiBrightCyan", "terminal.ansiBrightWhite",
    ],
  },
  {
    id: "tabs",
    label: "Tabs",
    keys: [
      "tab.activeBackground", "tab.activeForeground",
      "tab.inactiveBackground", "tab.inactiveForeground",
      "tab.border", "tab.hoverBackground",
    ],
  },
  {
    id: "activityBar",
    label: "Activity Bar",
    keys: [
      "activity.background", "activity.foreground", "activity.border",
      "activity.badgeBackground", "activity.badgeForeground",
      "activity.inactiveForeground",
    ],
  },
  {
    id: "statusBar",
    label: "Status Bar",
    keys: [
      "status.background", "status.foreground", "status.border",
      "status.warningBackground", "status.warningForeground",
      "status.errorBackground", "status.errorForeground",
      "status.itemHoverBackground",
    ],
  },
  {
    id: "titleBar",
    label: "Title Bar",
    keys: [
      "title.background", "title.foreground", "title.border",
    ],
  },
  {
    id: "input",
    label: "Input",
    keys: [
      "input.background", "input.foreground", "input.border",
      "input.placeholderForeground",
      "input.optionBackground", "input.optionForeground",
    ],
  },
  {
    id: "list",
    label: "List / Tree",
    keys: [
      "list.background", "list.foreground",
      "list.hoverBackground", "list.hoverForeground",
      "list.activeBackground", "list.activeForeground",
      "list.focusBackground", "list.focusForeground",
      "list.errorForeground", "list.warningForeground",
    ],
  },
  {
    id: "button",
    label: "Button",
    keys: [
      "button.background", "button.foreground", "button.hoverBackground",
      "button.border",
      "button.secondaryBackground", "button.secondaryForeground",
      "button.secondaryHoverBackground",
    ],
  },
  {
    id: "scrollbar",
    label: "Scrollbar",
    keys: [
      "scrollbar.sliderBackground", "scrollbar.sliderHoverBackground",
      "scrollbar.sliderActiveBackground", "scrollbar.border",
    ],
  },
];

interface ThemeEditorProps {
  open: boolean;
  onClose: () => void;
}

export function ThemeEditor({ open, onClose }: ThemeEditorProps) {
  const currentThemeName = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [themeName, setThemeName] = useState("");
  const [colors, setColors] = useState<Record<string, string>>({});
  const [originalColors, setOriginalColors] = useState<Record<string, string>>({});
  const [confirmingClose, setConfirmingClose] = useState(false);

  useEffect(() => {
    if (!open) return;
    const def = ThemeService.getTheme(currentThemeName);
    if (def) {
      const baseColors: Record<string, string> = {};
      for (const [k, v] of Object.entries(def.colors)) {
        if (v) baseColors[k] = v;
      }
      setColors(baseColors);
      setOriginalColors(baseColors);
      setThemeName(def.name);
    } else {
      setColors({});
      setOriginalColors({});
      setThemeName("");
    }
    setConfirmingClose(false);
  }, [open, currentThemeName]);

  const dirty = useMemo(
    () => JSON.stringify(colors) !== JSON.stringify(originalColors),
    [colors, originalColors],
  );

  const handleColorChange = useCallback(
    (key: string, value: string) => {
      setColors((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleStartFrom = useCallback(() => {
    const all = ThemeService.getAllThemes();
    const name = window.prompt(
      "Start from theme:\n" + all.map((t) => `  ${t.name}`).join("\n"),
      "dark",
    );
    if (!name) return;
    const def = ThemeService.getTheme(name.trim());
    if (def) {
      const baseColors: Record<string, string> = {};
      for (const [k, v] of Object.entries(def.colors)) {
        if (v) baseColors[k] = v;
      }
      setColors(baseColors);
      setOriginalColors(baseColors);
      setThemeName(def.name);
    }
  }, []);

  const handleSave = useCallback(async () => {
    let saveName = themeName;
    const isBuiltin = ThemeService.isBuiltin(themeName);
    if (isBuiltin) {
      saveName = window.prompt("Save theme as:", themeName + "-custom") ?? "";
      if (!saveName) return;
    }

    const def = ThemeService.getTheme(themeName);
    const newDef = {
      name: saveName,
      type: (def?.type ?? "dark") as "dark" | "light",
      colors,
      tokenColors: def?.tokenColors ?? [],
      terminal: def?.terminal ?? {},
    };

    ThemeService.registerTheme(newDef);

    try {
      const { isTauri } = await import("@/lib/platform");
      if (isTauri()) {
        const { appDataDir } = await import("@tauri-apps/api/path");
        const { writeTextFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");
        const baseDir = await appDataDir();
        const themesDir = `${baseDir}.quantum/themes`;
        if (!(await exists(themesDir))) {
          await mkdir(themesDir, { recursive: true });
        }
        await writeTextFile(`${themesDir}/${saveName}.json`, JSON.stringify(newDef, null, 2));
      } else {
        const saved = JSON.parse(localStorage.getItem("quantum-custom-themes") ?? "{}");
        saved[saveName] = newDef;
        localStorage.setItem("quantum-custom-themes", JSON.stringify(saved));
      }
    } catch {
      // Fallback: in-memory only
    }

    setThemeName(saveName);
    setOriginalColors({ ...colors });
    setTheme(saveName);
  }, [themeName, colors, setTheme]);

  const handleExport = useCallback(() => {
    const def = ThemeService.getTheme(themeName);
    const json = JSON.stringify(
      {
        name: themeName,
        type: def?.type ?? "dark",
        colors,
        tokenColors: def?.tokenColors ?? [],
        terminal: def?.terminal ?? {},
      },
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${themeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [themeName, colors]);

  const handleReset = useCallback(() => {
    if (window.confirm("Reset all colors to the base theme?")) {
      setColors({ ...originalColors });
    }
  }, [originalColors]);

  const handleClose = useCallback(() => {
    if (dirty && !confirmingClose) {
      setConfirmingClose(true);
      return;
    }
    setConfirmingClose(false);
    onClose();
  }, [dirty, confirmingClose, onClose]);

  const handleConfirmDiscard = useCallback(() => {
    setConfirmingClose(false);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="flex w-full max-w-4xl flex-col rounded-lg border border-border bg-popover shadow-2xl max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <Palette className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Theme Editor</h2>
            {dirty && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                Unsaved
              </span>
            )}
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="relative border-b border-border px-4 py-2">
          <label className="block text-xs text-muted-foreground mb-0.5">Theme Name</label>
          <Input
            value={themeName}
            onChange={(e) => {
              setThemeName(e.target.value);
            }}
            className="h-8 text-xs"
            placeholder="My Custom Theme"
          />
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-48 shrink-0 border-r border-border overflow-y-auto">
            <ScrollArea className="h-full">
              {COLOR_GROUPS.map((group) => (
                <ColorGroup
                  key={group.id}
                  group={group}
                  colors={colors}
                  onChange={handleColorChange}
                />
              ))}
            </ScrollArea>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="mb-2 text-xs font-medium text-foreground">Live Preview</h3>
                  <ThemePreview colors={colors} />
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-medium text-foreground">All Colors</h3>
                  {COLOR_GROUPS.map((group) => (
                    <div key={group.id} className="mb-3">
                      <h4 className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        {group.label}
                      </h4>
                      <div className="space-y-0.5">
                        {group.keys.map((key) => (
                          <div key={key} className="flex items-center justify-between gap-2 py-0.5">
                            <span className="text-[11px] text-muted-foreground truncate">{key}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <input
                                type="text"
                                value={colors[key] ?? ""}
                                onChange={(e) => handleColorChange(key, e.target.value)}
                                className="h-5 w-20 rounded border border-border bg-background px-1 text-[10px] font-mono text-foreground"
                                placeholder="—"
                              />
                              <input
                                type="color"
                                value={colors[key] ? (colors[key].length === 9 ? colors[key].slice(0, 7) : colors[key]) : "#000000"}
                                onChange={(e) => handleColorChange(key, e.target.value)}
                                className="size-4 cursor-pointer rounded border border-border p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        <ThemeEditorToolbar
          themeName={themeName}
          onStartFrom={handleStartFrom}
          onSave={handleSave}
          onExport={handleExport}
          onReset={handleReset}
          dirty={dirty}
        />
      </div>

      {confirmingClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onPointerDown={() => setConfirmingClose(false)}>
          <div className="rounded-lg border border-border bg-popover p-6 shadow-xl max-w-sm">
            <h3 className="mb-2 text-sm font-semibold">Unsaved Changes</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              You have unsaved changes. Do you want to save before closing?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="xs" onClick={() => setConfirmingClose(false)}>
                Cancel
              </Button>
              <Button variant="ghost" size="xs" onClick={handleConfirmDiscard}>
                Discard
              </Button>
              <Button variant="default" size="xs" onClick={() => {
                handleSave();
                setConfirmingClose(false);
                onClose();
              }}>
                Save & Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
