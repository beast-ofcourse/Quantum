import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

interface DirDropTargetProps {
  path: string;
  children: ReactNode;
}

export function DirDropTarget({ path, children }: DirDropTargetProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dir::${path}`,
    data: { path },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-sm transition-colors",
        isOver && "bg-accent/40",
      )}
    >
      {children}
    </div>
  );
}
