import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RenameInputProps {
  initialValue: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  autoCreate?: "file" | "folder";
  style?: React.CSSProperties;
  className?: string;
}

export function RenameInput({
  initialValue,
  placeholder,
  onSubmit,
  onCancel,
  autoCreate,
  style,
  className,
}: RenameInputProps) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.focus();
    if (autoCreate) {
      ref.current.select();
    } else {
      const dot = ref.current.value.lastIndexOf(".");
      if (dot > 0) ref.current.setSelectionRange(0, dot);
      else ref.current.select();
    }
  }, [autoCreate]);

  return (
    <Input
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSubmit(value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSubmit(value.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "h-5 rounded-sm border-0 bg-background px-1 text-xs shadow-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      style={style}
    />
  );
}
