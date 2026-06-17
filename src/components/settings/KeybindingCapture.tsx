import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface KeybindingCaptureProps {
  value: string;
  onChange: (combo: string) => void;
  onCancel: () => void;
}

function normalizeKey(key: string): string {
  if (key === "Control" || key === "Meta") return "mod";
  if (key === "Shift") return "shift";
  if (key === "Alt") return "alt";
  if (key === " ") return "space";
  if (key.length === 1) return key.toLowerCase();
  return key;
}

export function KeybindingCapture({ value, onChange, onCancel }: KeybindingCaptureProps) {
  const [recording, setRecording] = useState(true);
  const [display, setDisplay] = useState(value || "Press keys…");
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        onCancel();
        return;
      }

      if (e.key === "Enter" || e.key === "Tab") return;

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("mod");
      if (e.shiftKey && e.key !== "Shift") parts.push("shift");
      if (e.altKey && e.key !== "Alt") parts.push("alt");

      const key = normalizeKey(e.key);
      if (!["mod", "shift", "alt"].includes(key)) {
        parts.push(key);
      }

      if (parts.length > 0) {
        const combo = parts.join("+");
        setDisplay(
          combo
            .replace("mod", navigator.platform.includes("Mac") ? "⌘" : "Ctrl")
            .split("+")
            .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
            .join(" + "),
        );
        setRecording(false);
        onChange(combo);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onChange, onCancel]);

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex h-7 min-w-[100px] items-center justify-center rounded border px-2 text-xs font-mono transition-colors",
        recording
          ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "border-border bg-background text-foreground",
      )}
      onClick={() => {
        setRecording(true);
        setDisplay("Press keys…");
      }}
      onBlur={() => {
        if (recording) {
          setRecording(false);
          onCancel();
        }
      }}
    >
      {display}
    </button>
  );
}
