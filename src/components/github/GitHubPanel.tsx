import { useState, useEffect } from "react";
import { useGitHubStore } from "@/stores/githubStore";
import { useGitStore } from "@/stores/gitStore";
import { GitHubAuth } from "./GitHubAuth";
import { GitHubPullRequestList } from "./GitHubPullRequestList";
import { GitHubIssueList } from "./GitHubIssueList";
import { GitPullRequest, CircleDot, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SubTab = "prs" | "issues";

export function GitHubPanel() {
  const { authenticated, refreshAll, prsLoading, issuesLoading, setRepoFromRemote } = useGitHubStore();
  const [subTab, setSubTab] = useState<SubTab>("prs");
  const remotes = useGitStore((s) => s.remotes);

  useEffect(() => {
    const origin = remotes.find((r) => r.name === "origin");
    setRepoFromRemote((origin?.fetchUrl ?? origin?.pushUrl) ?? undefined);
  }, [remotes, setRepoFromRemote]);

  return (
    <div className="flex flex-col h-full">
      <GitHubAuth />

      {authenticated && (
        <>
          <div className="flex border-b">
            <button
              onClick={() => setSubTab("prs")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 transition-colors",
                subTab === "prs"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              Pull Requests
            </button>
            <button
              onClick={() => setSubTab("issues")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 transition-colors",
                subTab === "issues"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <CircleDot className="h-3.5 w-3.5" />
              Issues
            </button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={refreshAll}
              disabled={prsLoading || issuesLoading}
              className="mr-1"
              aria-label="Refresh"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", (prsLoading || issuesLoading) && "animate-spin")} />
            </Button>
          </div>

          {subTab === "prs" ? <GitHubPullRequestList /> : <GitHubIssueList />}
        </>
      )}
    </div>
  );
}
