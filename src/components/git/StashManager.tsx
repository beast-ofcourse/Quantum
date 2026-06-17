import { useState, useEffect } from "react";
import {
  Archive, Plus, Trash2, Eye, Play, Loader2, FileUp, CheckCircle2, AlertTriangle, GitPullRequest,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useGitStore } from "@/stores/gitStore";
import type { GitStash, DiffHunk, GitFileEntry } from "@/types/git";

function StashDiffDialog({
  open,
  onClose,
  stash,
}: {
  open: boolean;
  onClose: () => void;
  stash: GitStash | null;
}) {
  const stashViewDiff = useGitStore((s) => s.stashViewDiff);
  const stashViewLoading = useGitStore((s) => s.stashViewLoading);
  const stashShow = useGitStore((s) => s.stashShow);
  const clearStashView = useGitStore((s) => s.clearStashView);

  useEffect(() => {
    if (open && stash) {
      stashShow(stash.index);
    }
    if (!open) {
      clearStashView();
    }
  }, [open, stash, stashShow, clearStashView]);

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggleCollapse = (idx: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const headerLabel = (hunk: DiffHunk) =>
    hunk.sectionHeader
      ? `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ ${hunk.sectionHeader}`
      : `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">
            stash@{stash?.index}: {stash?.message || stash?.branch}
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-muted-foreground">
            {stash?.hash.slice(0, 12)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0">
          {stashViewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : stashViewDiff && stashViewDiff.length > 0 ? (
            <div className="font-mono text-xs">
              {stashViewDiff.map((hunk) => (
                <div key={hunk.index} className="border-b border-border/40">
                  <button
                    onClick={() => toggleCollapse(hunk.index)}
                    className="flex items-center gap-1 w-full bg-muted/30 px-3 py-1 text-left text-[11px] text-blue-400/70 hover:bg-muted/50"
                  >
                    {collapsed.has(hunk.index) ? "▶" : "▼"}
                    <span className="ml-1">{headerLabel(hunk)}</span>
                  </button>
                  {!collapsed.has(hunk.index) && (
                    <div className="px-3 py-1">
                      {hunk.lines.map((line, idx) => (
                        <div
                          key={idx}
                          className={`flex leading-5 ${
                            line.type === "added"
                              ? "bg-green-500/10 text-green-400/90"
                              : line.type === "removed"
                              ? "bg-red-500/10 text-red-400/90"
                              : "text-foreground/70"
                          }`}
                        >
                          <span className="w-[48px] shrink-0 text-right text-foreground/40 select-none">
                            {line.oldLineNumber !== null ? String(line.oldLineNumber) : ""}
                          </span>
                          <span className="w-[48px] shrink-0 text-right text-foreground/40 select-none border-r border-border/40 mr-2 pr-2">
                            {line.newLineNumber !== null ? String(line.newLineNumber) : ""}
                          </span>
                          <span className="flex-1 whitespace-pre-wrap">{line.content}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No changes in stash
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StashApplyResultDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const stashApplyResult = useGitStore((s) => s.stashApplyResult);

  if (!stashApplyResult) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stashApplyResult.hasConflict ? (
              <><AlertTriangle className="size-4 text-red-400" /> Apply Conflicts</>
            ) : (
              <><CheckCircle2 className="size-4 text-green-400" /> Apply Successful</>
            )}
          </DialogTitle>
          <DialogDescription>
            {stashApplyResult.hasConflict
              ? `Conflicts in ${stashApplyResult.conflictedFiles.length} file(s). Resolve them before continuing.`
              : "Stash applied cleanly without conflicts."}
          </DialogDescription>
        </DialogHeader>
        {stashApplyResult.hasConflict && stashApplyResult.conflictedFiles.length > 0 && (
          <ScrollArea className="max-h-32">
            <div className="space-y-1">
              {stashApplyResult.conflictedFiles.map((f) => (
                <div key={f} className="text-xs font-mono text-red-400/80 px-2 py-1 bg-red-500/5 rounded">
                  {f}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        <DialogFooter>
          <Button size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartialStashDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const status = useGitStore((s) => s.status);
  const stashPartial = useGitStore((s) => s.stashPartial);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stashing, setStashing] = useState(false);
  const [keepIndex, setKeepIndex] = useState(false);
  const [includeStaged, setIncludeStaged] = useState(false);

  useEffect(() => {
    if (open && status) {
      const all = [
    ...status.unstaged.map((f: GitFileEntry) => f.path),
    ...status.staged.map((f: GitFileEntry) => f.path),
      ];
      setSelected(new Set(all));
    }
    if (!open) {
      setMessage("");
      setSelected(new Set());
      setKeepIndex(false);
      setIncludeStaged(false);
    }
  }, [open, status]);

  const toggleFile = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleStash = async () => {
    if (selected.size === 0) return;
    setStashing(true);
    await stashPartial(Array.from(selected), message.trim() || undefined, keepIndex, includeStaged);
    setStashing(false);
    onClose();
  };

  const stagedSet = new Set((status?.staged ?? []).map((f) => f.path));
  const allFiles = [
    ...(status?.unstaged ?? []).map((f) => f.path),
    ...(status?.staged ?? []).map((f) => f.path),
  ];
  const unique = [...new Set(allFiles)];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Partial Stash</DialogTitle>
          <DialogDescription>Select files to stash selectively.</DialogDescription>
        </DialogHeader>
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Stash message (optional)"
          className="h-8 text-sm"
        />
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={keepIndex}
              onChange={(e) => setKeepIndex(e.target.checked)}
              className="size-3"
            />
            Keep staged
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeStaged}
              onChange={(e) => setIncludeStaged(e.target.checked)}
              className="size-3"
            />
            Include staged
          </label>
        </div>
        <ScrollArea className="flex-1 border border-border/40 rounded-md">
          {unique.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No changes to stash</div>
          ) : (
            <div className="space-y-0.5 p-1">
              {unique.map((path) => (
                <label
                  key={path}
                  className={`flex items-center gap-2 px-2 py-1 text-xs rounded cursor-pointer hover:bg-accent/50 ${
                    selected.has(path) ? "bg-accent/30" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(path)}
                    onChange={() => toggleFile(path)}
                    className="size-3"
                  />
                  <span className="flex-1 truncate font-mono">{path}</span>
                  {stagedSet.has(path) && <span className="text-[10px] text-green-500">staged</span>}
                </label>
              ))}
            </div>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleStash} disabled={stashing || selected.size === 0}>
            {stashing ? <Loader2 className="size-3 animate-spin mr-1" /> : <Archive className="size-3 mr-1" />}
            Stash {selected.size} file{selected.size > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StashItem({
  stash,
  onPop,
  onApply,
  onDrop,
  onView,
}: {
  stash: GitStash;
  onPop: (index: number) => void;
  onApply: (index: number) => void;
  onDrop: (index: number) => void;
  onView: (stash: GitStash) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 rounded-sm group">
      <Archive className="size-3 shrink-0 text-yellow-400" />
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate">
          <span className="font-mono text-muted-foreground mr-1">stash@{stash.index}:</span>
          {stash.message || stash.branch}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">{stash.hash.slice(0, 8)}</div>
      </div>
      <div className="hidden group-hover:flex items-center gap-0.5">
        <button onClick={() => onView(stash)} className="p-1 rounded hover:bg-accent" title="View diff">
          <Eye className="size-3" />
        </button>
        <button onClick={() => onApply(stash.index)} className="p-1 rounded hover:bg-accent text-blue-400" title="Apply (keep stash)">
          <GitPullRequest className="size-3" />
        </button>
        <button onClick={() => onPop(stash.index)} className="p-1 rounded hover:bg-accent text-green-400" title="Apply & drop">
          <Play className="size-3" />
        </button>
        <button onClick={() => onDrop(stash.index)} className="p-1 rounded hover:bg-accent text-red-400" title="Drop">
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function StashManager() {
  const stashes = useGitStore((s) => s.stashes);
  const stashPush = useGitStore((s) => s.stashPush);
  const stashPop = useGitStore((s) => s.stashPop);
  const stashDrop = useGitStore((s) => s.stashDrop);
  const stashApply = useGitStore((s) => s.stashApply);
  const clearStashApplyResult = useGitStore((s) => s.clearStashApplyResult);
  const stashApplyResult = useGitStore((s) => s.stashApplyResult);
  const refreshStashes = useGitStore((s) => s.refreshStashes);

  const [collapsed, setCollapsed] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [stashMsg, setStashMsg] = useState("");
  const [pushing, setPushing] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [selectedStash, setSelectedStash] = useState<GitStash | null>(null);
  const [partialOpen, setPartialOpen] = useState(false);

  useEffect(() => { refreshStashes(); }, [refreshStashes]);

  const handlePush = async () => {
    setPushing(true);
    await stashPush(stashMsg.trim() || undefined);
    setStashMsg(""); setPushOpen(false); setPushing(false);
  };

  const handlePop = (index: number) => {
    if (window.confirm(`Apply and drop stash@{${index}}?`)) stashPop(index);
  };

  const handleApply = (index: number) => {
    stashApply(index, false);
  };

  const handleDrop = (index: number) => {
    if (window.confirm(`Drop stash@{${index}}?`)) stashDrop(index);
  };

  const handleView = (stash: GitStash) => {
    setSelectedStash(stash);
    setDiffOpen(true);
  };

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <Archive className="size-3" />
        <span className="flex-1 text-left">Stashes</span>
        <span className="text-xs font-normal">{stashes.length}</span>
        <button title="Partial stash" onClick={(e) => { e.stopPropagation(); setPartialOpen(true); }} className="p-0.5 hover:bg-accent rounded">
          <FileUp className="size-3" />
        </button>
        <button title="Create stash" onClick={(e) => { e.stopPropagation(); setPushOpen(true); }} className="p-0.5 hover:bg-accent rounded">
          <Plus className="size-3" />
        </button>
      </button>
      {!collapsed && (
        <ScrollArea className="max-h-36">
          {stashes.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">No stashes</div>
          ) : (
            stashes.map((s) => (
              <StashItem key={s.index} stash={s} onPop={handlePop} onApply={handleApply} onDrop={handleDrop} onView={handleView} />
            ))
          )}
        </ScrollArea>
      )}
      <StashDiffDialog open={diffOpen} onClose={() => setDiffOpen(false)} stash={selectedStash} />
      <StashApplyResultDialog open={!!stashApplyResult} onClose={clearStashApplyResult} />
      <PartialStashDialog open={partialOpen} onClose={() => setPartialOpen(false)} />
      <Dialog open={pushOpen} onOpenChange={setPushOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stash Changes</DialogTitle>
            <DialogDescription>Temporarily save uncommitted changes.</DialogDescription>
          </DialogHeader>
          <Input
            value={stashMsg}
            onChange={(e) => setStashMsg(e.target.value)}
            placeholder="Stash message (optional)"
            className="h-8 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") handlePush(); }}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPushOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handlePush} disabled={pushing}>
              {pushing ? <Loader2 className="size-3 animate-spin mr-1" /> : <Archive className="size-3 mr-1" />}
              Stash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
