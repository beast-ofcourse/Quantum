import { useState } from "react";
import { Undo2, Loader2, AlertCircle } from "lucide-react";
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
  defaultHash?: string;
  isMergeCommit?: boolean;
}

export function RevertDialog({ open, onOpenChange, defaultHash, isMergeCommit }: Props) {
  const revert = useGitStore((s) => s.revert);
  const revertStatus = useGitStore((s) => s.revertStatus);
  const continueRevert = useGitStore((s) => s.continueRevert);
  const abortRevert = useGitStore((s) => s.abortRevert);
  const [hash, setHash] = useState(defaultHash ?? "");
  const [noCommit, setNoCommit] = useState(false);
  const [parentNumber, setParentNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inConflict = revertStatus?.inProgress && revertStatus.hasConflict;

  const handleStart = async () => {
    if (!hash.trim()) { setError("Commit hash is required"); return; }
    setLoading(true);
    setError(null);
    try {
      await revert(hash.trim(), { noCommit, parentNumber: isMergeCommit ? parentNumber : undefined });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    setError(null);
    try {
      await continueRevert();
      if (!useGitStore.getState().revertStatus?.inProgress) onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAbort = async () => {
    if (!window.confirm("Abort revert? This will discard any resolved conflicts.")) return;
    setLoading(true);
    setError(null);
    try {
      await abortRevert();
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{inConflict ? "Revert Conflict" : "Revert Commit"}</DialogTitle>
          <DialogDescription>
            {inConflict
              ? "Resolve conflicts in the editor, then continue."
              : "Create a new commit that undoes the changes from a specific commit."}
          </DialogDescription>
        </DialogHeader>

        {inConflict ? (
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <AlertCircle className="size-4" />
            Revert paused — resolve conflicts then continue.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Commit Hash</label>
              <input
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                placeholder={defaultHash ?? "abc123"}
                className="mt-1 w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={noCommit} onChange={(e) => setNoCommit(e.target.checked)} className="rounded" />
              No commit (stage changes only)
            </label>
            {isMergeCommit && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Parent Number (-m)</label>
                <select
                  value={parentNumber}
                  onChange={(e) => setParentNumber(Number(e.target.value))}
                  className="mt-1 w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={1}>Parent 1 (mainline)</option>
                  <option value={2}>Parent 2 (merged branch)</option>
                </select>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertCircle className="size-3 shrink-0" />
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          {inConflict ? (
            <>
              <Button variant="destructive" size="sm" onClick={handleAbort} disabled={loading}>
                {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                Abort
              </Button>
              <Button size="sm" onClick={handleContinue} disabled={loading}>
                {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                Continue
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={loading || !hash.trim()}>
              {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Undo2 className="size-3 mr-1" />}
              Revert
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
