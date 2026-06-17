import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { ColorField } from "./ColorField";

export interface ColorGroupDef {
  id: string;
  label: string;
  keys: string[];
}

interface ColorGroupProps {
  group: ColorGroupDef;
  colors: Record<string, string>;
  onChange: (key: string, value: string) => void;
  defaultOpen?: boolean;
}

export function ColorGroup({ group, colors, onChange, defaultOpen }: ColorGroupProps) {
  const [open, setOpen] = useState(defaultOpen ?? group.id === "editor");

  const labelParts = group.label.split("/");

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/50"
      >
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <span>{labelParts[0]}</span>
        {labelParts[1] && (
          <span className="text-muted-foreground">/{labelParts[1]}</span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-2">
          {group.keys.map((key) => (
            <ColorField
              key={key}
              label={key.split(".").pop() ?? key}
              colorKey={key}
              value={colors[key] ?? ""}
              onChange={onChange}
            />
          ))}
          {group.keys.length === 0 && (
            <p className="py-2 text-[11px] text-muted-foreground">No colors in this group.</p>
          )}
        </div>
      )}
    </div>
  );
}
