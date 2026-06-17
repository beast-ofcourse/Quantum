import type { GitHubPullRequest } from "@/types/github";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ExternalLink, GitPullRequest, GitPullRequestDraft, GitMerge } from "lucide-react";
import { GitHubCIStatus } from "./GitHubCIStatus";

interface Props {
  pr: GitHubPullRequest;
  onBack: () => void;
}

export function GitHubPullRequestDetail({ pr, onBack }: Props) {
  const statusIcon = pr.draft ? (
    <GitPullRequestDraft className="h-4 w-4 text-muted-foreground" />
  ) : pr.merged ? (
    <GitMerge className="h-4 w-4 text-purple-500" />
  ) : (
    <GitPullRequest className="h-4 w-4 text-green-500" />
  );

  const statusText = pr.draft ? "Draft" : pr.merged ? "Merged" : pr.state === "closed" ? "Closed" : "Open";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-1 border-b">
        <Button variant="ghost" size="icon-xs" onClick={onBack} aria-label="Back to list">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium">PR #{pr.number}</span>
        <a
          href={pr.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </a>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-3">
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="text-xs text-muted-foreground">{statusText}</span>
          </div>

          <h3 className="text-sm font-semibold leading-tight">{pr.title}</h3>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <img src={pr.author.avatarUrl} alt={pr.author.login} className="h-4 w-4 rounded-full" />
            <span>{pr.author.login}</span>
            <ArrowLeft className="h-3 w-3" />
            <span>{pr.headRef}</span>
            <span className="text-muted-foreground/50">→</span>
            <span>{pr.baseRef}</span>
          </div>

          {pr.body && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap line-clamp-6">
              {pr.body}
            </div>
          )}

          {pr.labels.length > 0 && (
            <div className="flex gap-1 flex-wrap">
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

          {pr.checks.length > 0 ? (
            <GitHubCIStatus checks={pr.checks} />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No CI checks for this PR</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
