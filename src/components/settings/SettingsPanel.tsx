import { useState, useMemo } from "react";
import { Search, X, RotateCcw, Keyboard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { ThemeService } from "@/lib/themeService";
import { fuzzyFilter } from "@/lib/fuzzySearch";
import { KeybindingSettings } from "./KeybindingSettings";


interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

interface SettingField {
  key: string;
  label: string;
  description: string;
  category: string;
  section: "general" | "editor" | "terminal" | "search";
}

const FIELDS: SettingField[] = [
  { key: "theme", label: "Theme", description: "Switch between built-in color themes", category: "General", section: "general" },
  { key: "autoSave", label: "Auto Save", description: "Automatically save files on blur", category: "General", section: "general" },
  { key: "autoSaveDelay", label: "Auto Save Delay (ms)", description: "Delay before auto-saving", category: "General", section: "general" },
  { key: "fontSize", label: "Font Size", description: "Editor font size in pixels", category: "Editor", section: "editor" },
  { key: "fontFamily", label: "Font Family", description: "Editor font family", category: "Editor", section: "editor" },
  { key: "tabSize", label: "Tab Size", description: "Number of spaces per tab", category: "Editor", section: "editor" },
  { key: "wordWrap", label: "Word Wrap", description: "Control when lines should wrap", category: "Editor", section: "editor" },
  { key: "minimap", label: "Minimap", description: "Show code minimap", category: "Editor", section: "editor" },
  { key: "minimapScale", label: "Minimap Scale", description: "Minimap zoom scale", category: "Editor", section: "editor" },
  { key: "formatOnSave", label: "Format on Save", description: "Auto-format code when saving", category: "Editor", section: "editor" },
  { key: "breadcrumbs", label: "Breadcrumbs", description: "Show file breadcrumb navigation", category: "Editor", section: "editor" },
  { key: "inlayHints", label: "Inlay Hints", description: "Show type annotations inline", category: "Editor", section: "editor" },
  { key: "lineNumbers", label: "Line Numbers", description: "Control line number display", category: "Editor", section: "editor" },
  { key: "fontSize", label: "Terminal Font Size", description: "Terminal font size in pixels", category: "Terminal", section: "terminal" },
  { key: "fontFamily", label: "Terminal Font", description: "Terminal font family", category: "Terminal", section: "terminal" },
];

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<"general" | "shortcuts">("general");
  const [search, setSearch] = useState("");
  const settings = useSettingsStore();
  const setTheme = useUiStore((s) => s.setTheme);

  const filtered = useMemo(
    () => fuzzyFilter(FIELDS, search, (f) => `${f.category} ${f.label} ${f.description}`),
    [search],
  );

  const renderControl = (field: SettingField) => {
    const section = settings[field.section] as Record<string, unknown>;
    const value = section[field.key];

    switch (field.key) {
      case "theme":
        return (
          <select
            value={useUiStore.getState().theme}
            onChange={(e) => setTheme(e.target.value)}
            className="h-7 rounded border border-border bg-background px-2 text-xs"
          >
            {ThemeService.getAllThemes().map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        );
      case "autoSave":
        return (
          <input
            type="checkbox"
            checked={settings.general.autoSave}
            onChange={(e) => settings.update("general", { autoSave: e.target.checked })}
            className="size-3.5"
          />
        );
      case "autoSaveDelay":
        return (
          <input
            type="number"
            value={settings.general.autoSaveDelay}
            onChange={(e) => settings.update("general", { autoSaveDelay: Number(e.target.value) })}
            className="h-7 w-20 rounded border border-border bg-background px-2 text-xs"
            min={100}
            step={100}
          />
        );
      case "minimap":
      case "formatOnSave":
      case "breadcrumbs":
      case "inlayHints":
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => settings.update(field.section, { [field.key]: e.target.checked })}
            className="size-3.5"
          />
        );
      case "wordWrap":
        return (
          <select
            value={String(value)}
            onChange={(e) => settings.update("editor", { wordWrap: e.target.value as "off" | "on" | "wordWrapColumn" | "bounded" })}
            className="h-7 rounded border border-border bg-background px-2 text-xs"
          >
            <option value="off">Off</option>
            <option value="on">On</option>
            <option value="wordWrapColumn">Word Wrap Column</option>
            <option value="bounded">Bounded</option>
          </select>
        );
      case "lineNumbers":
        return (
          <select
            value={String(value)}
            onChange={(e) => settings.update("editor", { lineNumbers: e.target.value as "on" | "off" | "relative" })}
            className="h-7 rounded border border-border bg-background px-2 text-xs"
          >
            <option value="on">On</option>
            <option value="off">Off</option>
            <option value="relative">Relative</option>
          </select>
        );
      case "minimapScale":
        return (
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.25}
            value={Number(value)}
            onChange={(e) => settings.update("editor", { minimapScale: Number(e.target.value) })}
            className="h-7 w-20"
          />
        );
      case "fontSize":
      case "tabSize":
        return (
          <input
            type="number"
            value={Number(value)}
            onChange={(e) => settings.update(field.section, { [field.key]: Number(e.target.value) })}
            className="h-7 w-16 rounded border border-border bg-background px-2 text-xs"
            min={8}
            max={48}
          />
        );
      case "fontFamily":
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => settings.update(field.section, { [field.key]: e.target.value })}
            className="h-7 w-40 rounded border border-border bg-background px-2 text-xs"
          />
        );
      default:
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => settings.update(field.section, { [field.key]: e.target.value })}
            className="h-7 w-24 rounded border border-border bg-background px-2 text-xs"
          />
        );
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-2xl flex-col rounded-lg border border-border bg-popover shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-semibold">Settings</h2>
          <div className="flex items-center gap-2">
            {tab === "general" && (
              <Button variant="ghost" size="xs" onClick={() => settings.reset()}>
                <RotateCcw className="mr-1 size-3" />
                Reset
              </Button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-border">
          <button
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "general"
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab("general")}
          >
            General
          </button>
          <button
            className={cn(
              "flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "shortcuts"
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab("shortcuts")}
          >
            <Keyboard className="size-3.5" />
            Keyboard Shortcuts
          </button>
        </div>

        {tab === "shortcuts" ? (
          <KeybindingSettings />
        ) : (
          <>
            <div className="relative border-b border-border px-4 py-2">
              <Search className="pointer-events-none absolute left-6 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search settings…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <ScrollArea className="max-h-96">
              <div className="space-y-0 px-4 py-2">
                {filtered.map((field) => (
                  <div
                    key={field.key + field.section}
                    className="flex items-center justify-between gap-4 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{field.label}</p>
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    </div>
                    <div className="shrink-0">{renderControl(field)}</div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No settings match your search.
                  </p>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
}
