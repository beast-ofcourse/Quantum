import { useState, useCallback, useEffect } from "react";

interface ColorFieldProps {
  label: string;
  colorKey: string;
  value: string;
  onChange: (key: string, value: string) => void;
}

export function ColorField({ label, colorKey, value, onChange }: ColorFieldProps) {
  const [hex, setHex] = useState(value || "#000000");

  useEffect(() => {
    setHex(value || "#000000");
  }, [value]);

  const handleHexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setHex(v);
      if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) {
        onChange(colorKey, v);
      }
    },
    [colorKey, onChange],
  );

  const handleColorPicker = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setHex(v);
      onChange(colorKey, v);
    },
    [colorKey, onChange],
  );

  const displayValue = value || hex;

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <label className="min-w-0 flex-1 text-xs text-muted-foreground truncate" title={label}>
        {label}
      </label>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="text"
          value={displayValue}
          onChange={handleHexChange}
          className="h-6 w-20 rounded border border-border bg-background px-1.5 text-[11px] font-mono text-foreground"
          placeholder="#000000"
        />
        <input
          type="color"
          value={displayValue.length === 9 ? displayValue.slice(0, 7) : displayValue}
          onChange={handleColorPicker}
          className="size-6 cursor-pointer rounded border border-border p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded"
        />
      </div>
    </div>
  );
}
