import { useRef, useEffect } from "react";
import { useHotkey } from "@/hooks/useHotkey";
import { useZenStore } from "@/stores/zenStore";

export function useZenHotkeys() {
  const isZen = useZenStore((s) => s.isZen);
  const toggleZen = useZenStore((s) => s.toggleZen);
  const exitZen = useZenStore((s) => s.exitZen);

  // ▼ Toggle Zen mode: Ctrl+Shift+Z
  // (Ctrl+Shift+Z is redo in some editors, but Monaco handles its own redo internally)
  useHotkey({
    combo: "mod+shift+z",
    commandId: "view.toggleZenMode",
    description: "Toggle Zen Mode",
    handler: () => toggleZen(),
  });

  // ▼ Double-Escape to exit Zen mode
  // Track last Escape timestamp; if two presses within 400ms, exit.
  // Only active when in Zen mode.
  const lastEscRef = useRef(0);
  const escTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!isZen) {
      lastEscRef.current = 0;
      return;
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const now = Date.now();
      if (now - lastEscRef.current < 400) {
        e.preventDefault();
        exitZen();
        lastEscRef.current = 0;
        if (escTimerRef.current) clearTimeout(escTimerRef.current);
      } else {
        lastEscRef.current = now;
        escTimerRef.current = setTimeout(() => {
          lastEscRef.current = 0;
        }, 400);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
      if (escTimerRef.current) clearTimeout(escTimerRef.current);
    };
  }, [isZen, exitZen]);
}
