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
import { TagManager } from "./TagManager";
import { BranchManager } from "./BranchManager";
import { StashManager } from "./StashManager";
import { RemoteManager } from "./RemoteManager";
import { GitWorktreePanel } from "./GitWorktreePanel";
import { GitBisectWizard } from "./GitBisectWizard";
import { GitBranchCompare } from "./GitBranchCompare";
import { GitHubPanel } from "@/components/github/GitHubPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { RefreshCw, GitBranch, ArrowUp, ArrowDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "changes" | "graph" | "github" | "compare";

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end px-3 h-7">
        <Button variant="ghost" size="icon-xs" onClick={() => refreshStatus()} disabled={statusLoading} aria-label="Refresh status">
          <RefreshCw className={cn("h-3 w-3", statusLoading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex">
        {(["changes", "graph", "compare", "github"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 text-xs py-1 transition-colors capitalize",
              tab === t
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "changes" ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1">
            <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs font-mono truncate flex-1">{currentBranch ?? "unknown"}</span>
            {status && (status.ahead > 0 || status.behind > 0) && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {status.ahead > 0 && (
                  <button
                    onClick={() => push()}
                    disabled={pushing}
                    className="flex items-center gap-0.5 hover:text-foreground transition-colors disabled:opacity-40"
                    title={`Push ${status.ahead} commits`}
                  >
                    <ArrowUp className={cn("h-2.5 w-2.5", pushing && "animate-bounce")} />
                    <span>{status.ahead}</span>
                  </button>
                )}
                {status.behind > 0 && (
                  <button
                    onClick={() => pull()}
                    disabled={pulling}
                    className="flex items-center gap-0.5 hover:text-foreground transition-colors disabled:opacity-40"
                    title={`Pull ${status.behind} commits`}
                  >
                    <ArrowDown className={cn("h-2.5 w-2.5", pulling && "animate-bounce")} />
                    <span>{status.behind}</span>
                  </button>
                )}
                <button
                  onClick={() => fetch()}
                  disabled={fetching}
                  className="flex items-center gap-0.5 hover:text-foreground transition-colors disabled:opacity-40 ml-0.5"
                  title="Fetch"
                >
                  <Download className={cn("h-2.5 w-2.5", fetching && "animate-bounce")} />
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="mx-2 mb-1 px-2 py-1 rounded text-[11px] bg-red-900/30 text-red-400 border border-red-900/50">
              {error}
            </div>
          )}

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
      ) : tab === "graph" ? (
        <GitGraphView />
      ) : tab === "compare" ? (
        <GitBranchCompare />
      ) : (
        <GitHubPanel />
      )}
    </div>
  );
}
