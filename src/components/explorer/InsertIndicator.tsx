import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

interface InsertIndicatorProps {
  parentPath: string;
  index: number | null;
}

export function InsertIndicator({ parentPath, index }: InsertIndicatorProps) {
  const id = index !== null
    ? `ins::${parentPath}::${index}`
    : `ins::${parentPath}::end`;
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative flex items-center py-[1px]",
      )}
    >
      <div
        className={cn(
          "h-0 w-full transition-all duration-150",
          isOver && "h-[3px] rounded-full bg-blue-500",
        )}
      />
    </div>
  );
}
