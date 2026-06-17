import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useGitStore } from "@/stores/gitStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MergeDialog({ open, onOpenChange }: Props) {
  const branches = useGitStore((s) => s.branches);
  const mergeBranch = useGitStore((s) => s.mergeBranch);
  const abortMerge = useGitStore((s) => s.abortMerge);
  const [selected, setSelected] = useState("");
  const [noFF, setNoFF] = useState(false);
  const [squash, setSquash] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localBranches = branches.filter((b) => !b.isRemote && !b.isHead);

  const handleMerge = async () => {
    if (!selected) { setError("Select a branch to merge"); return; }
    setLoading(true); setError(null);
    try {
      await mergeBranch(selected, { noFF, squash });
      onOpenChange(false);
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  };

  const handleAbort = async () => {
    if (!window.confirm("Abort merge? Uncommitted changes may be lost.")) return;
    setLoading(true); setError(null);
    try {
      await abortMerge();
      onOpenChange(false);
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge Branch</DialogTitle>
          <DialogDescription>Merge a branch into the current branch.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Branch</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full h-8 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select branch...</option>
              {localBranches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={noFF} onChange={(e) => setNoFF(e.target.checked)} className="rounded" />
            Create merge commit even when fast-forward is possible (--no-ff)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={squash} onChange={(e) => setSquash(e.target.checked)} className="rounded" />
            Squash all changes into a single commit (--squash)
          </label>
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="size-3 shrink-0" />{error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={handleAbort} disabled={loading}>
            {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
            Abort Merge
          </Button>
          <Button size="sm" onClick={handleMerge} disabled={loading || !selected}>
            {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
