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
  defaultHash?: string;
}

export function CherryPickDialog({ open, onOpenChange, defaultHash }: Props) {
  const cherryPick = useGitStore((s) => s.cherryPick);
  const cherryPickStatus = useGitStore((s) => s.cherryPickStatus);
  const continueCherryPick = useGitStore((s) => s.continueCherryPick);
  const abortCherryPick = useGitStore((s) => s.abortCherryPick);
  const [hash, setHash] = useState(defaultHash ?? "");
  const [noCommit, setNoCommit] = useState(false);
  const [strategyTheirs, setStrategyTheirs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inConflict = cherryPickStatus?.inProgress && cherryPickStatus.hasConflict;

  const handleStart = async () => {
    if (!hash.trim()) { setError("Commit hash is required"); return; }
    setLoading(true);
    setError(null);
    try {
      await cherryPick(hash.trim(), { noCommit, strategyTheirs });
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
      await continueCherryPick();
      if (!useGitStore.getState().cherryPickStatus?.inProgress) onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAbort = async () => {
    if (!window.confirm("Abort cherry-pick? This will discard any resolved conflicts.")) return;
    setLoading(true);
    setError(null);
    try {
      await abortCherryPick();
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
          <DialogTitle>{inConflict ? "Cherry-pick Conflict" : "Cherry-pick Commit"}</DialogTitle>
          <DialogDescription>
            {inConflict
              ? "Resolve conflicts in the editor, then continue."
              : "Apply the changes from a specific commit to the current branch."}
          </DialogDescription>
        </DialogHeader>

        {inConflict ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-amber-500">
              <AlertCircle className="size-4" />
              Cherry-pick paused — resolve conflicts then continue.
            </div>
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
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={strategyTheirs} onChange={(e) => setStrategyTheirs(e.target.checked)} className="rounded" />
              Use theirs on conflict (-X theirs)
            </label>
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
              {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
              Cherry-pick
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
