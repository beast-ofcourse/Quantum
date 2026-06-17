import { useEffect, useState, useCallback } from "react";
import {
  DndContext, closestCenter, DragEndEvent,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GripVertical, ArrowLeft, Play, SkipForward, RotateCcw, Check, AlertTriangle,
  Loader2, MessageSquare, ExternalLink,
} from "lucide-react";
import { useGitStore } from "@/stores/gitStore";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";
import type { RebaseTodo, RebaseStatus } from "@/types/git";

const ACTIONS = ["pick", "squash", "fixup", "reword", "drop", "edit"] as const;

function SortableTodoItem({
  todo, disabled, onChangeAction,
}: {
  todo: RebaseTodo;
  disabled: boolean;
  onChangeAction: (index: number, action: RebaseTodo["action"]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `todo-${todo.index}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-todo-index={todo.index}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded text-xs border-b last:border-b-0",
        todo.action === "drop" && "opacity-40 line-through",
        isDragging && "shadow-lg bg-accent border border-border",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        disabled={disabled}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <select
        value={todo.action}
        onChange={(e) => onChangeAction(todo.index, e.target.value as RebaseTodo["action"])}
        disabled={disabled}
        className={cn(
          "px-1 py-0.5 rounded text-xs bg-transparent border border-border/50",
          "focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer",
          todo.action === "pick" && "text-green-500",
          todo.action === "squash" && "text-amber-500",
          todo.action === "fixup" && "text-orange-500",
          todo.action === "reword" && "text-blue-500",
          todo.action === "drop" && "text-red-500",
          todo.action === "edit" && "text-purple-500",
        )}
      >
        {ACTIONS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <span className="font-mono text-[10px] text-muted-foreground w-[56px] truncate">{todo.hash.slice(0, 7)}</span>
      {todo.action === "reword" && <MessageSquare className="w-3 h-3 text-blue-500 shrink-0" />}
      <span className="truncate flex-1">{todo.message}</span>
    </div>
  );
}

function ConflictView({ status, onContinue, onSkip, onAbort }: {
  status: RebaseStatus;
  onContinue: () => void;
  onSkip: () => void;
  onAbort: () => void;
}) {
  const conflictedFiles = useGitStore((s) => s.status?.conflicted ?? []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-red-500">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm font-medium">Merge Conflict</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Conflict occurred while applying commit. Resolve conflicts in the editor, then continue.
      </p>
      {status.currentHash && (
        <div className="text-xs">
          <span className="text-muted-foreground">Commit: </span>
          <span className="font-mono">{status.currentHash.slice(0, 7)}</span>
          <span className="ml-2">{status.currentMessage}</span>
        </div>
      )}
      {conflictedFiles.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Conflicted files:</span>
          {conflictedFiles.map((f) => (
            <div key={f} className="flex items-center gap-2 text-xs text-foreground/80">
              <span className="truncate flex-1">{f}</span>
              <Button
                variant="ghost"
                size="xs"
                className="h-5 gap-1 text-[10px]"
                onClick={() => {
                  useEditorStore.getState().openFile(f);
                }}
              >
                <ExternalLink className="w-2.5 h-2.5" />
                Open
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={onContinue}>Continue</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSkip}>Skip</Button>
        <Button size="sm" variant="destructive" className="h-7 text-xs ml-auto" onClick={onAbort}>Abort</Button>
      </div>
    </div>
  );
}

function DoneView({ todos }: { todos: RebaseTodo[] }) {
  const applied = todos.filter((t) => t.action !== "drop").length;
  const dropped = todos.filter((t) => t.action === "drop").length;
  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-2">
      <Check className="w-8 h-8 text-green-500" />
      <span className="text-sm font-medium">Rebase Complete</span>
      <span className="text-xs text-muted-foreground">
        {applied} commit{applied !== 1 ? "s" : ""} applied, {dropped} dropped
      </span>
    </div>
  );
}

export function RebaseEditor({ target, open, onOpenChange }: {
  target?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    rebaseTodos, rebaseStep, rebaseStatus,
    fetchRebaseTodos, startRebase, continueRebase, skipRebase, abortRebase, detectRebase,
  } = useGitStore();
  const error = useGitStore((s) => s.error);
  const [targetBranch, setTargetBranch] = useState(target || "");
  const [rewordMessage, setRewordMessage] = useState<string | null>(null);
  const [conflictStartTime, setConflictStartTime] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (open) {
      detectRebase();
    }
  }, [open, detectRebase]);

  useEffect(() => {
    if (rebaseStep === "reword" && rebaseStatus?.currentMessage) {
      setRewordMessage(rebaseStatus.currentMessage);
    }
  }, [rebaseStep, rebaseStatus]);

  useEffect(() => {
    if (rebaseStep === "conflict" && !conflictStartTime) {
      setConflictStartTime(Date.now());
    } else if (rebaseStep !== "conflict") {
      setConflictStartTime(null);
    }
  }, [rebaseStep, conflictStartTime]);

  useEffect(() => {
    if (rebaseStep !== "running") return;
    const interval = setInterval(() => {
      detectRebase();
    }, 2000);
    return () => clearInterval(interval);
  }, [rebaseStep, detectRebase]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rebaseTodos.findIndex((t) => `todo-${t.index}` === active.id);
    const newIndex = rebaseTodos.findIndex((t) => `todo-${t.index}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rebaseTodos, oldIndex, newIndex).map((t, i) => ({
      ...t, index: i,
    }));
    useGitStore.setState({ rebaseTodos: reordered });
  }, [rebaseTodos]);

  const isFirstCommit = (index: number) => index === 0;

  const handleActionChange = useCallback((index: number, action: RebaseTodo["action"]) => {
    if (isFirstCommit(index) && (action === "squash" || action === "fixup")) {
      return;
    }
    const updated = rebaseTodos.map((t) => (t.index === index ? { ...t, action } : t));
    useGitStore.setState({ rebaseTodos: updated });
  }, [rebaseTodos]);

  const handleStartRebase = useCallback(async () => {
    if (!targetBranch.trim()) return;
    const allDropped = rebaseTodos.every((t) => t.action === "drop");
    if (allDropped) {
      if (!confirm("All commits are set to 'drop'. This will result in an empty rebase (fast-forward). Continue?")) {
        return;
      }
    }
    await startRebase(targetBranch.trim(), rebaseTodos);
  }, [targetBranch, rebaseTodos, startRebase]);

  const handleAbort = useCallback(async () => {
    await abortRebase();
    onOpenChange(false);
  }, [abortRebase, onOpenChange]);

  const handleClose = useCallback(() => {
    if (rebaseStep === "running" || rebaseStep === "conflict") return;
    onOpenChange(false);
  }, [rebaseStep, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {rebaseStep !== "idle" && rebaseStep !== "generate-todo" && (
              <button
                onClick={() => useGitStore.setState({ rebaseStep: "editing" })}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <span>Interactive Rebase</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {rebaseStep === "editing" && "Reorder, squash, reword, or drop commits below"}
            {rebaseStep === "running" && "Applying commits..."}
            {rebaseStep === "conflict" && "Resolve conflicts to continue"}
            {rebaseStep === "reword" && "Edit commit message"}
            {rebaseStep === "done" && "Rebase completed"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {rebaseStep === "generate-todo" && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {rebaseStep === "idle" && (
            <div className="flex flex-col gap-3 py-2">
              <label className="text-xs text-muted-foreground">Rebase onto</label>
              <input
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                placeholder="main, branch-name, or commit-hash"
                className="px-2 py-1.5 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && targetBranch.trim()) {
                    fetchRebaseTodos(targetBranch.trim());
                  }
                }}
              />
              <Button
                size="sm"
                className="h-7 text-xs self-end"
                disabled={!targetBranch.trim()}
                onClick={() => fetchRebaseTodos(targetBranch.trim())}
              >
                <Play className="w-3 h-3 mr-1" />
                Generate Todo
              </Button>
            </div>
          )}

          {rebaseStep === "editing" && (
            <div className="flex flex-col h-full">
              {rebaseTodos.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  No commits to rebase
                </div>
              ) : (
                <ScrollArea className="flex-1 max-h-[50vh]">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={rebaseTodos.map((t) => `todo-${t.index}`)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-0">
                        {rebaseTodos.map((todo) => (
                          <SortableTodoItem
                            key={todo.index}
                            todo={todo}
                            disabled={false}
                            onChangeAction={handleActionChange}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </ScrollArea>
              )}
              {error && <div className="text-xs text-red-500 px-2 py-1">{error}</div>}
              <div className="flex items-center justify-between p-2 border-t mt-auto">
                <label className="text-xs text-muted-foreground">
                  {rebaseTodos.filter((t) => t.action === "drop").length} dropped
                </label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAbort}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={rebaseTodos.length === 0}
                    onClick={handleStartRebase}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Start Rebase
                  </Button>
                </div>
              </div>
            </div>
          )}

          {rebaseStep === "running" && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
              {rebaseStatus && rebaseStatus.total > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{rebaseStatus.current} / {rebaseStatus.total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(rebaseStatus.current / rebaseStatus.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {error && <div className="text-xs text-red-500 text-center">{error}</div>}
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleAbort}>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Abort
                </Button>
              </div>
            </div>
          )}

          {rebaseStep === "conflict" && rebaseStatus && (
            <div className="space-y-2">
              {conflictStartTime && Date.now() - conflictStartTime > 300000 && (
                <div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Conflict has been unresolved for over 5 minutes. Consider aborting and trying again.</span>
                </div>
              )}
              <ConflictView
                status={rebaseStatus}
                onContinue={() => continueRebase()}
                onSkip={() => skipRebase()}
                onAbort={handleAbort}
              />
            </div>
          )}

          {rebaseStep === "reword" && (
            <div className="space-y-3 py-2">
              <textarea
                value={rewordMessage || ""}
                onChange={(e) => setRewordMessage(e.target.value)}
                className="w-full h-32 px-3 py-2 text-xs rounded border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <div className="flex justify-between">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAbort}>
                  Abort
                </Button>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => continueRebase(rewordMessage || undefined)}
                  >
                    <SkipForward className="w-3 h-3 mr-1" />
                    Skip Reword
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => continueRebase(rewordMessage || undefined)}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {rebaseStep === "todoEdit" && rebaseStatus && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-amber-500">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">Rebase Paused</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Rebase encountered an issue. You can edit the remaining todo and continue.
              </p>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleAbort}>
                  Abort
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => skipRebase()}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => continueRebase()}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {rebaseStep === "done" && <DoneView todos={rebaseTodos} />}
        </div>

        {rebaseStep === "done" && (
          <div className="flex justify-end p-2 border-t">
            <Button size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
