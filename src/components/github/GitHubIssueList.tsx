import { useGitHubStore } from "@/stores/githubStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleDot, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function GitHubIssueList() {
  const { issues, issuesLoading, repo } = useGitHubStore();

  if (!repo) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CircleDot className="h-8 w-8 mb-2" />
        <p className="text-xs">No GitHub remote detected</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      {issuesLoading && issues.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!issuesLoading && issues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CircleDot className="h-8 w-8 mb-2" />
          <p className="text-xs">No open issues</p>
        </div>
      )}

      {issues.map((issue) => (
        <a
          key={issue.number}
          href={issue.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-start gap-2 px-3 py-2 hover:bg-accent transition-colors border-b border-border/50",
            "focus-visible:outline-none focus-visible:bg-accent"
          )}
        >
          <CircleDot className={`h-4 w-4 mt-0.5 shrink-0 ${issue.state === 'open' ? 'text-green-500' : 'text-red-500'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{issue.title}</p>
            <p className="text-xs text-muted-foreground">
              #{issue.number} · {issue.author.login}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{issue.commentsCount}</span>
          </div>
        </a>
      ))}
    </ScrollArea>
  );
}
