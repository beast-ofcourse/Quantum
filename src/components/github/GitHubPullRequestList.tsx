import { useGitHubStore } from "@/stores/githubStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitPullRequest, GitPullRequestDraft, GitMerge } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { GitHubPullRequestDetail } from "./GitHubPullRequestDetail";

export function GitHubPullRequestList() {
  const { pullRequests, prsLoading, repo } = useGitHubStore();
  const [selectedPr, setSelectedPr] = useState<number | null>(null);

  useEffect(() => {
    if (selectedPr !== null && !pullRequests.find((p) => p.number === selectedPr)) {
      setSelectedPr(null);
    }
  }, [selectedPr, pullRequests]);

  if (!repo) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <GitPullRequest className="h-8 w-8 mb-2" />
        <p className="text-xs">No GitHub remote detected</p>
        <p className="text-xs">Push to GitHub to see pull requests</p>
      </div>
    );
  }

  if (selectedPr !== null) {
    const pr = pullRequests.find((p) => p.number === selectedPr);
    if (pr) {
      return <GitHubPullRequestDetail pr={pr} onBack={() => setSelectedPr(null)} />;
    }
  }

  return (
    <ScrollArea className="flex-1">
      {prsLoading && pullRequests.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!prsLoading && pullRequests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <GitPullRequest className="h-8 w-8 mb-2" />
          <p className="text-xs">No open pull requests</p>
        </div>
      )}

      {pullRequests.map((pr) => (
        <button
          key={pr.number}
          onClick={() => setSelectedPr(pr.number)}
          className={cn(
            "w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/50",
            "focus-visible:outline-none focus-visible:bg-accent"
          )}
        >
          <div className="flex items-start gap-2">
            {pr.draft ? (
              <GitPullRequestDraft className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            ) : pr.merged ? (
              <GitMerge className="h-4 w-4 mt-0.5 shrink-0 text-purple-500" />
            ) : (
              <GitPullRequest className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{pr.title}</p>
              <p className="text-xs text-muted-foreground">
                #{pr.number} · {pr.author.login}
              </p>
            </div>
          </div>
          {pr.checks.length > 0 && (
            <div className="flex gap-1 mt-1 ml-6">
              {pr.checks.map((check, i) => (
                <span
                  key={i}
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    check.conclusion === "success" && "bg-green-500",
                    check.conclusion === "failure" && "bg-red-500",
                    check.conclusion === "neutral" && "bg-gray-400",
                    (!check.conclusion || check.status !== "completed") && "bg-yellow-400"
                  )}
                  title={check.name}
                />
              ))}
            </div>
          )}
          {pr.labels.length > 0 && (
            <div className="flex gap-1 mt-1 ml-6 flex-wrap">
              {pr.labels.map((label) => (
                <span
                  key={label.name}
                  className="inline-block text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `#${label.color}22`, color: `#${label.color}` }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </ScrollArea>
  );
}
