import { useState, useEffect } from "react";
import {
  Plus, Trash2, Check, GitFork, Loader2, AlertCircle,
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
import { cn } from "@/lib/utils";
import type { GitBranch } from "@/types/git";

function BranchItem({
  branch,
  onCheckout,
  onDelete,
}: {
  branch: GitBranch;
  onCheckout: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  const isCurrent = branch.isHead;
  const icon = branch.isRemote
    ? <GitFork className="size-3 shrink-0 text-purple-400" />
    : <Check className={cn("size-3 shrink-0", isCurrent ? "text-green-400" : "text-muted-foreground")} />;
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 rounded-sm group",
      isCurrent && "bg-accent/30"
    )}>
      {icon}
      <div className="flex-1 min-w-0">
        <span className={cn("text-xs truncate block", isCurrent && "font-medium text-foreground")}>
          {branch.name}
          {isCurrent && <span className="ml-1.5 text-[10px] text-green-400 font-normal">HEAD</span>}
        </span>
        {branch.upstream && (
          <span className="text-[10px] text-muted-foreground truncate block">{branch.upstream}</span>
        )}
      </div>
      {branch.ahead > 0 && <span className="text-[10px] text-green-400 font-mono">+{branch.ahead}</span>}
      {branch.behind > 0 && <span className="text-[10px] text-red-400 font-mono">-{branch.behind}</span>}
      <div className="hidden group-hover:flex items-center gap-0.5">
        {!isCurrent && (
          <>
            <button onClick={() => onCheckout(branch.name)} className="p-1 rounded hover:bg-accent" title="Checkout">
              <Check className="size-3" />
            </button>
            {!branch.isRemote && (
              <button onClick={() => onDelete(branch.name)} className="p-1 rounded hover:bg-accent text-red-400" title="Delete branch">
                <Trash2 className="size-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CreateBranchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createBranch = useGitStore((s) => s.createBranch);
  const [name, setName] = useState("");
  const [startPoint, setStartPoint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setName(""); setStartPoint(""); setError(null); }
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim()) { setError("Branch name is required"); return; }
    setLoading(true); setError(null);
    try {
      await createBranch(name.trim(), startPoint.trim() || undefined);
      onOpenChange(false);
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Branch</DialogTitle>
          <DialogDescription>Create a new branch from the specified starting point.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Branch Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/my-feature" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Start Point (optional)</label>
            <Input value={startPoint} onChange={(e) => setStartPoint(e.target.value)} placeholder="main (default: current HEAD)" className="mt-1 h-8 text-sm font-mono" />
          </div>
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="size-3 shrink-0" />{error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Plus className="size-3 mr-1" />}
            Create Branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BranchManager() {
  const branches = useGitStore((s) => s.branches);
  const checkout = useGitStore((s) => s.checkout);
  const deleteBranch = useGitStore((s) => s.deleteBranch);
  const refreshBranches = useGitStore((s) => s.refreshBranches);
  const [collapsed, setCollapsed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { refreshBranches(); }, [refreshBranches]);

  const handleCheckout = (name: string) => checkout(name);
  const handleDelete = (name: string) => {
    if (window.confirm(`Delete branch "${name}"?`)) deleteBranch(name, true);
  };

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  return (
    <div className="border-b border-border">
      <div
        onClick={() => setCollapsed(!collapsed)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(c => !c); } }}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <GitFork className="size-3" />
        <span className="flex-1 text-left">Branches</span>
        <span className="text-xs font-normal">{localBranches.length}</span>
        <Plus className="size-3" onClick={(e) => { e.stopPropagation(); setCreateOpen(true); }} />
      </div>
      {!collapsed && (
        <ScrollArea className="max-h-48">
          {branches.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">No branches</div>
          ) : (
            <>
              {localBranches.map((b) => (
                <BranchItem key={b.name} branch={b} onCheckout={handleCheckout} onDelete={handleDelete} />
              ))}
              {remoteBranches.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Remote</div>
                  {remoteBranches.map((b) => (
                    <BranchItem key={b.name} branch={b} onCheckout={handleCheckout} onDelete={handleDelete} />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollArea>
      )}
      <CreateBranchDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
