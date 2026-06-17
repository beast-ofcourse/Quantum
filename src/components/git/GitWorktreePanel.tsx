import { useState, useEffect } from "react";
import {
  GitBranch, Plus, Trash2, Loader2, Scissors, FolderGit2, AlertCircle,
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
import type { WorktreeEntry } from "@/types/git";

function WorktreeItem({
  entry,
  onRemove,
  currentPath,
}: {
  entry: WorktreeEntry;
  onRemove: (path: string) => void;
  currentPath: string;
}) {
  const isCurrent = entry.path === currentPath;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 rounded-sm group">
      <FolderGit2 className={`size-3 shrink-0 ${isCurrent ? "text-blue-400" : "text-muted-foreground"}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate flex items-center gap-1.5">
          {entry.branch ? (
            <><GitBranch className="size-2.5 shrink-0" /><span className="font-medium">{entry.branch}</span></>
          ) : (
            <span className="text-muted-foreground italic">detached</span>
          )}
          {isCurrent && <span className="text-[10px] text-blue-400">(current)</span>}
          {entry.isDirty && <span className="text-[10px] text-yellow-400">dirty</span>}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono truncate">{entry.commit.slice(0, 8)} — {entry.path}</div>
      </div>
      <div className="hidden group-hover:flex items-center gap-0.5">
        <button
          onClick={() => onRemove(entry.path)}
          className="p-1 rounded hover:bg-accent text-red-400"
          title="Remove worktree"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function GitWorktreePanel() {
  const repoRoot = useGitStore((s) => s.repoRoot);
  const worktrees = useGitStore((s) => s.worktrees);
  const worktreesLoading = useGitStore((s) => s.worktreesLoading);
  const refreshWorktrees = useGitStore((s) => s.refreshWorktrees);
  const addWorktree = useGitStore((s) => s.addWorktree);
  const removeWorktree = useGitStore((s) => s.removeWorktree);
  const pruneWorktrees = useGitStore((s) => s.pruneWorktrees);

  const [collapsed, setCollapsed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);

  useEffect(() => { refreshWorktrees(); }, [refreshWorktrees]);

  const handleAdd = async () => {
    if (!newPath.trim()) { setAddError("Path is required"); return; }
    setAdding(true); setAddError(null);
    try {
      await addWorktree(newPath.trim(), newBranch.trim() || undefined);
      setNewPath(""); setNewBranch(""); setAddOpen(false);
    } catch (err) { setAddError(String(err)); }
    finally { setAdding(false); }
  };

  const handleRemove = (path: string) => {
    if (window.confirm(`Remove worktree at "${path}"?\n\nThis will delete the worktree metadata but NOT the files.`)) {
      removeWorktree(path, false);
    }
  };

  const handlePrune = async () => {
    if (!window.confirm("Prune worktree metadata for removed worktrees?")) return;
    setPruning(true);
    await pruneWorktrees();
    setPruning(false);
  };

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <FolderGit2 className="size-3" />
        <span className="flex-1 text-left">Worktrees</span>
        <span className="text-xs font-normal">{worktrees.length}</span>
        {worktrees.length > 0 && (
          <button
            title="Prune"
            onClick={(e) => { e.stopPropagation(); handlePrune(); }}
            className="p-0.5 hover:bg-accent rounded"
            disabled={pruning}
          >
            {pruning ? <Loader2 className="size-3 animate-spin" /> : <Scissors className="size-3" />}
          </button>
        )}
        <button
          title="Add worktree"
          onClick={(e) => { e.stopPropagation(); setAddOpen(true); }}
          className="p-0.5 hover:bg-accent rounded"
        >
          <Plus className="size-3" />
        </button>
      </button>
      {!collapsed && (
        <ScrollArea className="max-h-36">
          {worktreesLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            </div>
          ) : worktrees.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">No worktrees</div>
          ) : (
            worktrees.map((w) => (
              <WorktreeItem key={w.path} entry={w} onRemove={handleRemove} currentPath={repoRoot ?? ""} />
            ))
          )}
        </ScrollArea>
      )}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Worktree</DialogTitle>
            <DialogDescription>Create a new linked working tree.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Path</label>
              <Input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="../my-feature"
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Branch (optional)</label>
              <Input
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                placeholder="feature-branch (creates new branch)"
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            {addError && (
              <div className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle className="size-3 shrink-0" />{addError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="size-3 animate-spin mr-1" /> : <FolderGit2 className="size-3 mr-1" />}
              Add Worktree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
