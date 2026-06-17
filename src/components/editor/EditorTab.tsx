import { memo, useRef } from "react";
import { X, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types/editor";

interface EditorTabProps {
  tab: Tab;
  isActive: boolean;
  onClose: (id: string, opts?: { force?: boolean }) => void;
  onCloseOthers: (id: string, opts?: { force?: boolean }) => void;
  onCloseAll: (opts?: { force?: boolean }) => void;
  onCloseToTheRight: (id: string) => void;
}

export const EditorTab = memo(function EditorTab({
  tab,
  isActive,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseToTheRight,
}: EditorTabProps) {
  const setActive = useEditorStore((s) => s.setActiveTab);
  const togglePin = useEditorStore((s) => s.togglePin);
  const save = useEditorStore((s) => s.saveFile);
  const rootPath = useFileStore((s) => s.rootPath);
  const addToast = useToastStore((s) => s.addToast);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  // Sync isDragging to ref so onClick can read it even before re-render
  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDragging;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  const onClick = () => {
    if (isDraggingRef.current) return; // Suppress click after drag
    setActive(tab.id);
  };
  const onAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      void onClose(tab.id);
    }
  };
  const onCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void onClose(tab.id);
  };

  const onPinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePin(tab.id);
  };

  const onCopyRelativePath = () => {
    if (!rootPath) return;
    const normalizedPath = tab.path.replace(/\\/g, "/");
    const normalizedRoot = rootPath.replace(/\\/g, "/");
    const relative = normalizedPath.replace(normalizedRoot, "").replace(/^\//, "");
    if (!relative) {
      addToast("info", "Copied file name: " + tab.name);
      navigator.clipboard.writeText(tab.name).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(relative).then(() => {
      addToast("info", `Copied: ${relative}`);
    }).catch(() => {
      addToast("warn", "Clipboard access denied (try again with user gesture)");
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          aria-selected={isActive}
          onClick={onClick}
          onAuxClick={onAuxClick}
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault();
          }}
          {...attributes}
          {...listeners}
          className={cn(
            "group relative flex h-full min-w-[60px] max-w-[160px] shrink cursor-pointer items-center gap-1 px-2 text-sm border-b-2",
            isActive
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <button
            type="button"
            aria-label={tab.pinned ? "Unpin tab" : "Pin tab"}
            title={tab.pinned ? "Unpin tab" : "Pin tab"}
            onClick={onPinToggle}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded hover:bg-accent",
              tab.pinned
                ? "text-foreground"
                : "opacity-0 group-hover:opacity-60 text-muted-foreground",
            )}
          >
            <Pin className={cn("size-3", tab.pinned && "fill-foreground")} />
          </button>
          <span className={cn("flex-1 truncate", tab.pinned && "italic")}>{tab.name}</span>
          {tab.isDirty ? (
            <button
              type="button"
              aria-label="Save file"
              title="Save (Ctrl+S)"
              onClick={(e) => {
                e.stopPropagation();
                void save(tab.id);
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-primary hover:bg-accent"
            >
              <span className="size-1.5 rounded-full bg-primary" />
            </button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close tab"
            className={cn(
              "shrink-0",
              isActive
                ? "opacity-70 hover:opacity-100"
                : "opacity-0 group-hover:opacity-70 hover:opacity-100",
            )}
            onClick={onCloseClick}
          >
            <X className="size-3" />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => void save(tab.id)}>
          Save
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+S</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => togglePin(tab.id)}>
          {tab.pinned ? "Unpin tab" : "Pin tab"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void onClose(tab.id)}>
          Close
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+W</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void onCloseOthers(tab.id)}>
          Close Others
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseToTheRight(tab.id)}>
          Close to the Right
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void onCloseAll()}>
          Close All
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onCopyRelativePath}>
          Copy Relative Path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
