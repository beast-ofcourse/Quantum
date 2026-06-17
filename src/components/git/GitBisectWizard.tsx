import { useState, useCallback, useEffect } from "react";
import {
  CheckCircle2, XCircle, SkipForward, RotateCcw, Loader2, AlertCircle,
  Target, ChevronRight, ScrollText,
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
import type { BisectStatus } from "@/types/git";

function BisectRunningView({
  status,
  onGood,
  onBad,
  onSkip,
  onReset,
}: {
  status: BisectStatus;
  onGood: () => void;
  onBad: () => void;
  onSkip: () => void;
  onReset: () => void;
}) {
  const progress = status.total > 0 ? Math.round((1 - status.remaining / status.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Target className="size-4 text-yellow-400" />
        <span className="font-medium">Bisecting — {status.remaining} step{status.remaining > 1 ? "s" : ""} remaining</span>
      </div>

      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="bg-muted/30 rounded-md p-2.5">
        <div className="text-xs text-muted-foreground font-mono truncate mb-1">{status.currentHash}</div>
        <div className="text-xs truncate">{status.currentMessage}</div>
      </div>

      <p className="text-xs text-muted-foreground">
        Mark the current revision as:
      </p>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onGood} variant="outline" className="flex-1 text-green-400 border-green-400/30 hover:bg-green-500/10 gap-1">
          <CheckCircle2 className="size-3" /> Good <kbd className="text-[10px] text-green-400/60 ml-1 font-mono">G</kbd>
        </Button>
        <Button size="sm" onClick={onBad} variant="outline" className="flex-1 text-red-400 border-red-400/30 hover:bg-red-500/10 gap-1">
          <XCircle className="size-3" /> Bad <kbd className="text-[10px] text-red-400/60 ml-1 font-mono">B</kbd>
        </Button>
        <Button size="sm" onClick={onSkip} variant="outline" className="flex-1 text-muted-foreground border-muted-foreground/30 hover:bg-accent/50 gap-1">
          <SkipForward className="size-3" /> Skip <kbd className="text-[10px] text-muted-foreground/60 ml-1 font-mono">S</kbd>
        </Button>
      </div>

      <Button size="sm" onClick={onReset} variant="ghost" className="w-full text-xs gap-1 text-muted-foreground">
        <RotateCcw className="size-3" /> Reset bisect
      </Button>
    </div>
  );
}

function BisectDoneView({
  status,
  onReset,
}: {
  status: BisectStatus;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        {status.step === "done" ? (
          <><CheckCircle2 className="size-4 text-green-400" /> <span className="font-medium text-green-400">Bisect Complete</span></>
        ) : (
          <><AlertCircle className="size-4 text-red-400" /> <span className="font-medium text-red-400">Bisect Error</span></>
        )}
      </div>

      {status.firstBadHash && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-md p-2.5">
          <div className="text-[10px] text-green-400/70 font-semibold uppercase tracking-wider mb-1">First bad commit</div>
          <div className="text-xs font-mono mb-0.5">{status.firstBadHash}</div>
          {status.firstBadMessage && (
            <div className="text-xs text-muted-foreground">{status.firstBadMessage}</div>
          )}
        </div>
      )}

      <Button size="sm" onClick={onReset} variant="outline" className="w-full gap-1">
        <RotateCcw className="size-3" /> Reset bisect
      </Button>
    </div>
  );
}

export function GitBisectWizard() {
  const bisectStatus = useGitStore((s) => s.bisectStatus);
  const bisectLoading = useGitStore((s) => s.bisectLoading);
  const bisectStart = useGitStore((s) => s.bisectStart);
  const bisectGood = useGitStore((s) => s.bisectGood);
  const bisectBad = useGitStore((s) => s.bisectBad);
  const bisectSkip = useGitStore((s) => s.bisectSkip);
  const bisectReset = useGitStore((s) => s.bisectReset);
  const error = useGitStore((s) => s.error);

  const [collapsed, setCollapsed] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [badRef, setBadRef] = useState("HEAD");
  const [goodRef, setGoodRef] = useState("");
  const [paths, setPaths] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const bisectStep = bisectStatus?.inProgress ? (bisectStatus.step === "done" ? "done" : "running") : null;

  const handleStart = async () => {
    if (!badRef.trim()) { setStartError("Bad ref is required"); return; }
    if (!goodRef.trim()) { setStartError("Good ref is required"); return; }
    setStarting(true); setStartError(null);
    try {
      await bisectStart({
        bad: badRef.trim(),
        good: goodRef.trim(),
        paths: paths.trim() ? paths.trim().split(/\s+/) : undefined,
      });
      setStartOpen(false);
    } catch (err) { setStartError(String(err)); }
    finally { setStarting(false); }
  };

  const handleGood = useCallback(async () => {
    setActionLoading(true);
    await bisectGood();
    setActionLoading(false);
  }, [bisectGood]);

  const handleBad = useCallback(async () => {
    setActionLoading(true);
    await bisectBad();
    setActionLoading(false);
  }, [bisectBad]);

  const handleSkip = useCallback(async () => {
    setActionLoading(true);
    await bisectSkip();
    setActionLoading(false);
  }, [bisectSkip]);

  const handleReset = useCallback(async () => {
    if (!window.confirm("Reset bisect? This will clean up the bisect state.")) return;
    await bisectReset();
  }, [bisectReset]);

  useEffect(() => {
    if (bisectStep !== "running" || collapsed || actionLoading) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "g" || e.key === "G") { e.preventDefault(); handleGood(); }
      else if (e.key === "b" || e.key === "B") { e.preventDefault(); handleBad(); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); handleSkip(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bisectStep, collapsed, actionLoading, handleGood, handleBad, handleSkip]);

  const statusDisplay = () => {
    if (!bisectStatus) return null;
    if (!bisectStatus.inProgress) return null;

    if (bisectStep === "done") {
      return <BisectDoneView status={bisectStatus} onReset={handleReset} />;
    }

    return (
      <BisectRunningView
        status={bisectStatus}
        onGood={handleGood}
        onBad={handleBad}
        onSkip={handleSkip}
        onReset={handleReset}
      />
    );
  };

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <Target className={`size-3 ${bisectStep === "running" ? "text-yellow-400" : bisectStep === "done" ? "text-green-400" : ""}`} />
        <span className="flex-1 text-left">Bisect</span>
        {bisectStep && (
          <span className="text-[10px] font-mono bg-yellow-400/10 text-yellow-400 px-1.5 py-0.5 rounded">
            {bisectStep === "running" ? `${bisectStatus!.remaining} left` : "done"}
          </span>
        )}
        {bisectStatus?.log && (
          <button
            title="Show log"
            onClick={(e) => { e.stopPropagation(); setLogOpen(true); }}
            className="p-0.5 hover:bg-accent rounded"
          >
            <ScrollText className="size-3" />
          </button>
        )}
        {!bisectStep && (
          <button
            title="Start bisect"
            onClick={(e) => { e.stopPropagation(); setStartOpen(true); }}
            className="p-0.5 hover:bg-accent rounded"
          >
            <ChevronRight className="size-3" />
          </button>
        )}
      </button>
      {!collapsed && bisectStep && (
        <div className="px-3 py-2">
          {bisectLoading || actionLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            statusDisplay()
          )}
          {error && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="size-3 shrink-0" />{error}
            </div>
          )}
        </div>
      )}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Bisect</DialogTitle>
            <DialogDescription>Find the commit that introduced a bug using binary search.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bad ref (contains bug)</label>
              <Input
                value={badRef}
                onChange={(e) => setBadRef(e.target.value)}
                placeholder="HEAD"
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Good ref (known working)</label>
              <Input
                value={goodRef}
                onChange={(e) => setGoodRef(e.target.value)}
                placeholder="abc123 or v1.0"
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Paths (optional, space-separated)</label>
              <Input
                value={paths}
                onChange={(e) => setPaths(e.target.value)}
                placeholder="src/ tests/"
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            {startError && (
              <div className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle className="size-3 shrink-0" />{startError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleStart} disabled={starting || !badRef.trim() || !goodRef.trim()}>
              {starting ? <Loader2 className="size-3 animate-spin mr-1" /> : <Target className="size-3 mr-1" />}
              Start Bisect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[60vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Bisect Log</DialogTitle>
            <DialogDescription>Full git bisect log for the current session.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 p-2">
              {bisectStatus?.log || "No log available"}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
