import { useState } from "react";
import { AlertCircle, Plus, Minus, Eye } from "lucide-react";
import { useGitStore } from "@/stores/gitStore";
import { cn } from "@/lib/utils";


interface Props {
  onOpenDiff: (path: string, staged: boolean) => void;
  onOpenFile: (path: string) => void;
}

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  modified: { label: "M", class: "text-orange-500" },
  added: { label: "A", class: "text-green-500" },
  deleted: { label: "D", class: "text-red-500" },
  untracked: { label: "U", class: "text-muted-foreground" },
  conflict: { label: "C", class: "text-red-500" },
  renamed: { label: "R", class: "text-blue-500" },
  copied: { label: "C", class: "text-purple-500" },
} as const;

function FileItem({
  path,
  badge,
  staged,
  onStage,
  onUnstage,
  onOpenDiff,
  onOpenFile,
}: {
  path: string;
  badge: { label: string; class: string };
  staged: boolean;
  onStage: () => void;
  onUnstage: () => void;
  onOpenDiff: () => void;
  onOpenFile: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1 text-xs hover:bg-accent/30 cursor-pointer">
      <span className={cn("w-4 shrink-0 text-[10px] font-mono text-center", badge.class)}>
        {badge.label}
      </span>
      <button
        onClick={onOpenFile}
        className="flex-1 truncate text-left text-foreground/80 hover:text-foreground"
        title={path}
      >
        {path}
      </button>
      <div className="flex shrink-0 gap-0.5">
        {staged ? (
          <button onClick={onUnstage} title="Unstage" className="size-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground">
            <Minus className="size-2.5" />
          </button>
        ) : (
          <button onClick={onStage} title="Stage" className="size-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground">
            <Plus className="size-2.5" />
          </button>
        )}
        <button onClick={onOpenDiff} title="Open Diff" className="size-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground">
          <Eye className="size-2.5" />
        </button>
      </div>
    </div>
  );
}

export function GitChanges({ onOpenDiff, onOpenFile }: Props) {
  const status = useGitStore((s) => s.status);
  const stage = useGitStore((s) => s.stage);
  const unstage = useGitStore((s) => s.unstage);
  const [stagingAll, setStagingAll] = useState(false);
  const [unstagingAll, setUnstagingAll] = useState(false);

  if (!status) return null;

  const hasStaged = status.staged.length > 0;
  const hasUnstaged = status.unstaged.length > 0;
  const hasUntracked = status.untracked.length > 0;
  const hasConflicts = status.conflicted.length > 0;

  const handleStageAll = async () => {
    setStagingAll(true);
    const allUnstaged = [...status.unstaged.map((e) => e.path), ...status.untracked];
    if (allUnstaged.length > 0) await stage(allUnstaged);
    setStagingAll(false);
  };

  const handleUnstageAll = async () => {
    setUnstagingAll(true);
    if (status.staged.length > 0) await unstage(status.staged.map((e) => e.path));
    setUnstagingAll(false);
  };

  return (
    <div className="flex flex-col">
      {hasConflicts && (
        <div>
          <div className="flex items-center gap-2 px-3 py-1 text-sm font-medium text-red-500">
            <AlertCircle className="size-3.5" />
            Merge Conflicts
            <span className="text-xs font-normal text-red-400/70">({status.conflicted.length})</span>
          </div>
          {status.conflicted.map((path) => (
            <FileItem
              key={path}
              path={path}
              badge={STATUS_BADGE.conflict}
              staged={false}
              onStage={() => onOpenDiff(path, false)}
              onUnstage={() => unstage([path])}
              onOpenDiff={() => onOpenDiff(path, false)}
              onOpenFile={() => onOpenFile(path)}
            />
          ))}
        </div>
      )}

      {hasStaged && (
        <div>
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-xs text-muted-foreground">
              Staged <span className="text-[10px]">({status.staged.length})</span>
            </span>
            <button
              onClick={handleUnstageAll}
              disabled={unstagingAll}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Unstage all
            </button>
          </div>
          {status.staged.map((entry) => (
            <FileItem
              key={`staged-${entry.path}`}
              path={entry.path}
              badge={STATUS_BADGE[entry.status] ?? STATUS_BADGE.modified}
              staged
              onStage={() => stage([entry.path])}
              onUnstage={() => unstage([entry.path])}
              onOpenDiff={() => onOpenDiff(entry.path, true)}
              onOpenFile={() => onOpenFile(entry.path)}
            />
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-muted-foreground">
            Changes <span className="text-[10px]">({status.unstaged.length + status.untracked.length})</span>
          </span>
          {hasUntracked && (
            <button
              onClick={handleStageAll}
              disabled={stagingAll}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Stage all
            </button>
          )}
        </div>
        {hasUnstaged && status.unstaged.map((entry) => (
          <FileItem
            key={`unstaged-${entry.path}`}
            path={entry.path}
            badge={STATUS_BADGE[entry.status] ?? STATUS_BADGE.modified}
            staged={false}
            onStage={() => stage([entry.path])}
            onUnstage={() => unstage([entry.path])}
            onOpenDiff={() => onOpenDiff(entry.path, false)}
            onOpenFile={() => onOpenFile(entry.path)}
          />
        ))}
        {hasUntracked && status.untracked.map((path) => (
          <FileItem
            key={`untracked-${path}`}
            path={path}
            badge={STATUS_BADGE.untracked}
            staged={false}
            onStage={() => stage([path])}
            onUnstage={() => unstage([path])}
            onOpenDiff={() => onOpenDiff(path, false)}
            onOpenFile={() => onOpenFile(path)}
          />
        ))}
        {!hasUnstaged && !hasUntracked && (
          <div className="px-3 py-3 text-center text-[10px] text-muted-foreground">
            No changes to stage
          </div>
        )}
      </div>
    </div>
  );
}
