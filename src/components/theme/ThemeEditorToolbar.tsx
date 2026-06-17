import { Button } from "@/components/ui/button";
import { Save, Download, RotateCcw, Plus } from "lucide-react";

interface ThemeEditorToolbarProps {
  themeName: string;
  onStartFrom: () => void;
  onSave: () => void;
  onExport: () => void;
  onReset: () => void;
  dirty: boolean;
}

const BUILTIN_NAMES = ["dark", "light", "catppuccin-mocha"];

export function ThemeEditorToolbar({
  themeName,
  onStartFrom,
  onSave,
  onExport,
  onReset,
  dirty,
}: ThemeEditorToolbarProps) {
  const isNew = !BUILTIN_NAMES.includes(themeName);

  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="xs" onClick={onStartFrom}>
          <Plus className="mr-1 size-3" />
          Start from…
        </Button>
        {dirty && (
          <span className="text-[11px] text-amber-500 font-medium">
            Unsaved changes
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="xs" onClick={onReset}>
          <RotateCcw className="mr-1 size-3" />
          Reset All
        </Button>
        <Button variant="ghost" size="xs" onClick={onExport}>
          <Download className="mr-1 size-3" />
          Export
        </Button>
        <Button variant="default" size="xs" onClick={onSave} disabled={!dirty && isNew}>
          <Save className="mr-1 size-3" />
          Save {isNew ? "as…" : ""}
        </Button>
      </div>
    </div>
  );
}
