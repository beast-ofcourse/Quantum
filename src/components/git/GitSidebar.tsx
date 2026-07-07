import { useState, useEffect } from "react";
import { useGitStore } from "@/stores/gitStore";
import { useFileStore } from "@/stores/fileStore";
import { useEditorStore } from "@/stores/editorStore";
import { useUiStore } from "@/stores/uiStore";
import { GitEmptyState } from "./GitEmptyState";
import { GitChanges } from "./GitChanges";
import { GitCommitBox } from "./GitCommitBox";
import { GitDiffView } from "./GitDiffView";
import { GitGraphView } from "./GitGraphView";
import { GitHistoryView } from "./GitHistoryView";
import { TagManager } from "./TagManager";
import { BranchManager } from "./BranchManager";
import { StashManager } from "./StashManager";
import { RemoteManager } from "./RemoteManager";
import { GitWorktreePanel } from "./GitWorktreePanel";
import { GitBisectWizard } from "./GitBisectWizard";
import { GitBranchCompare } from "./GitBranchCompare";
import { MergeDialog } from "./MergeDialog";
import { CloneDialog } from "./CloneDialog";
import { GitHubPanel } from "@/components/github/GitHubPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { RefreshCw, GitBranch, ArrowUp, ArrowDown, Download, GitMerge } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "changes" | "history" | "graph" | "github" | "compare";

export function GitSidebar() {
  const isRepo = useGitStore((s) => s.isRepo);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const status = useGitStore((s) => s.status);
  const statusLoading = useGitStore((s) => s.statusLoading);
  const currentBranch = useGitStore((s) => s.currentBranch);
  const refreshStatus = useGitStore((s) => s.refreshStatus);
  const push = useGitStore((s) => s.push);
  const pull = useGitStore((s) => s.pull);
  const fetch = useGitStore((s) => s.fetch);
  const pushing = useGitStore((s) => s.pushing);
  const pulling = useGitStore((s) => s.pulling);
  const fetching = useGitStore((s) => s.fetching);
  const error = useGitStore((s) => s.error);
  const rootPath = useFileStore((s) => s.rootPath);
  const repoRoot = useGitStore((s) => s.repoRoot);
  const openFile = useEditorStore((s) => s.openFile);

  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [diffStaged, setDiffStaged] = useState(false);
  const [tab, setTab] = useState<Tab>("changes");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  const leftDockVisible = useUiStore((s) => s.zones.left.isVisible);

  useEffect(() => {
    if (!leftDockVisible) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const poll = async () => {
      if (!isMounted || !leftDockVisible) return;
      try {
        await refreshStatus();
      } catch {
        // ignore transient errors
      }
      if (isMounted && leftDockVisible) {
        timer = setTimeout(poll, 1000);
      }
    };

    poll();

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) { clearTimeout(timer); timer = null; }
      } else {
        if (!timer) poll();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [leftDockVisible, refreshStatus]);

  const handleOpenDiff = (path: string, staged: boolean) => {
    setDiffPath(path);
    setDiffStaged(staged);
  };

  const handleOpenFile = (path: string) => {
    const fullPath = repoRoot
      ? `${repoRoot.replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`
      : path;
    void openFile(fullPath);
  };

  if (!rootPath || checkingRepo || !isRepo) {
    return <GitEmptyState isRepo={isRepo} checkingRepo={checkingRepo} />;
  }

  if (diffPath) {
    return (
      <GitDiffView
        path={diffPath}
        staged={diffStaged}
        onClose={() => { setDiffPath(null); setDiffStaged(false); }}
      />
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "changes", label: "Changes" },
    { id: "history", label: "History" },
    { id: "graph", label: "Graph" },
    { id: "compare", label: "Compare" },
    { id: "github", label: "GitHub" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-3 h-7 border-b border-border">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono truncate">
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{currentBranch ?? "unknown"}</span>
          {status && status.ahead > 0 && (
            <span className="text-green-400 font-normal ml-1">↑{status.ahead}</span>
          )}
          {status && status.behind > 0 && (
            <span className="text-yellow-400 font-normal ml-0.5">↓{status.behind}</span>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={() => refreshStatus()} disabled={statusLoading} aria-label="Refresh status">
          <RefreshCw className={cn("h-3 w-3", statusLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Always-visible git actions: Push / Pull / Fetch / Merge */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
        <button
          onClick={() => push()}
          disabled={pushing}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors",
            "bg-accent/40 hover:bg-accent text-foreground disabled:opacity-40"
          )}
          title="Push commits to remote"
        >
          <ArrowUp className={cn("h-2.5 w-2.5", pushing && "animate-bounce")} />
          Push{status && status.ahead > 0 ? ` (${status.ahead})` : ""}
        </button>
        <button
          onClick={() => pull()}
          disabled={pulling}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors",
            "bg-accent/40 hover:bg-accent text-foreground disabled:opacity-40"
          )}
          title="Pull commits from remote"
        >
          <ArrowDown className={cn("h-2.5 w-2.5", pulling && "animate-bounce")} />
          Pull{status && status.behind > 0 ? ` (${status.behind})` : ""}
        </button>
        <button
          onClick={() => fetch()}
          disabled={fetching}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors",
            "bg-accent/40 hover:bg-accent text-foreground disabled:opacity-40"
          )}
          title="Fetch from remote"
        >
          <Download className={cn("h-2.5 w-2.5", fetching && "animate-bounce")} />
          Fetch
        </button>
        <button
          onClick={() => setMergeOpen(true)}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors",
            "bg-accent/40 hover:bg-accent text-foreground"
          )}
          title="Merge branch"
        >
          <GitMerge className="h-2.5 w-2.5" />
          Merge
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 text-[10px] px-2 py-1 transition-colors whitespace-nowrap",
              tab === t.id
                ? "text-foreground font-medium border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-2 mt-1 px-2 py-1 rounded text-[11px] bg-red-900/30 text-red-400 border border-red-900/50">
          {error}
        </div>
      )}

      {/* Tab content */}
      {tab === "changes" ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <GitCommitBox />
          <ScrollArea className="flex-1">
            <GitChanges onOpenDiff={handleOpenDiff} onOpenFile={handleOpenFile} />
            <BranchManager />
            <TagManager />
            <StashManager />
            <RemoteManager />
            <GitWorktreePanel />
            <GitBisectWizard />
          </ScrollArea>
        </div>
      ) : tab === "history" ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <GitHistoryView />
        </div>
      ) : tab === "graph" ? (
        <GitGraphView />
      ) : tab === "compare" ? (
        <GitBranchCompare />
      ) : (
        <GitHubPanel />
      )}
      <MergeDialog open={mergeOpen} onOpenChange={setMergeOpen} />
      <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} />
    </div>
  );
}
