import { memo, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type ResizerOrientation = "horizontal" | "vertical";

interface ResizerProps {
  orientation: ResizerOrientation;
  onResize: (delta: number) => void;
  className?: string;
  ariaLabel: string;
  invert?: boolean;
}

export const Resizer = memo(function Resizer({
  orientation,
  onResize,
  className,
  ariaLabel,
  invert = false,
}: ResizerProps) {
  const draggingRef = useRef(false);
  const lastPosRef = useRef(0);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const start = orientation === "vertical" ? event.clientX : event.clientY;
      draggingRef.current = true;
      lastPosRef.current = start;
      document.body.style.cursor =
        orientation === "vertical" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [orientation],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const current =
        orientation === "vertical" ? event.clientX : event.clientY;
      const delta = current - lastPosRef.current;
      lastPosRef.current = current;
      const signed = invert ? -delta : delta;
      onResizeRef.current(signed);
    },
    [orientation, invert],
  );

  const stopDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore — pointer may already be released
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      className={cn(
        "group/resizer relative shrink-0 touch-none",
        orientation === "vertical"
          ? "w-px cursor-col-resize bg-border hover:bg-primary/50"
          : "h-px cursor-row-resize bg-border hover:bg-primary/50",
        "after:absolute after:z-10",
        orientation === "vertical"
          ? "after:inset-y-0 after:-left-[3px] after:w-[7px]"
          : "after:inset-x-0 after:-top-[3px] after:h-[7px]",
        className,
      )}
    />
  );
});
