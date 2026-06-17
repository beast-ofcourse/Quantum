import { useState, useEffect } from "react";
import {
  GitCommit,
  Calendar,
  User,
  Copy,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useGitStore } from "@/stores/gitStore";
import { cn } from "@/lib/utils";
import { GitSkeleton } from "@/components/ui/skeleton";
import type { GitCommit as GitCommitType } from "@/types/git";

export function GitHistoryView() {
  const log = useGitStore((s) => s.log);
  const logLoading = useGitStore((s) => s.logLoading);
  const error = useGitStore((s) => s.error);
  const getLog = useGitStore((s) => s.getLog);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitType | null>(null);

  useEffect(() => {
    getLog({ maxCount: 50 });
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const relativeTime = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      const now = Date.now();
      const diff = now - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days}d ago`;
      const months = Math.floor(days / 30);
      return `${months}mo ago`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <GitCommit className="size-3.5" />
          History
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => getLog({ maxCount: 50 })}
          disabled={logLoading}
        >
          <RefreshCw className={cn("size-3", logLoading && "animate-spin")} />
        </Button>
      </header>

      {selectedCommit ? (
        <div className="flex flex-1 flex-col">
          <div className="flex h-8 items-center gap-2 border-b border-border px-3">
            <Button variant="ghost" size="xs" onClick={() => setSelectedCommit(null)}>
              <ArrowLeft className="size-3" />
            </Button>
            <span className="text-xs font-medium">Commit Details</span>
          </div>
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {selectedCommit.hash.slice(0, 8)}
                  </code>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleCopy(selectedCommit.hash)}
                    title="Copy hash"
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="size-3" />
                {selectedCommit.authorName}
                <span className="text-muted-foreground/60">
                  &lt;{selectedCommit.authorEmail}&gt;
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="size-3" />
                {new Date(selectedCommit.date).toLocaleString()}
              </div>
              {selectedCommit.refs && (
                <div className="flex flex-wrap gap-1">
                  {selectedCommit.refs.split(", ").map((ref) => (
                    <Badge key={ref} variant="secondary" className="text-[10px]">
                      {ref}
                    </Badge>
                  ))}
                </div>
              )}
              <Separator />
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                {selectedCommit.message}
              </pre>
            </div>
          </ScrollArea>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {error && !logLoading && (
            <div className="flex items-center gap-2 p-3 text-xs text-red-500 border-b border-border">
              <AlertCircle className="size-3 shrink-0" />
              <span className="flex-1">{error}</span>
              <Button variant="ghost" size="xs" onClick={() => getLog({ maxCount: 50 })} className="h-6 text-[10px]">
                Retry
              </Button>
            </div>
          )}
          {logLoading ? (
            <GitSkeleton rows={5} />
          ) : log.length === 0 && !error ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No commits yet.
            </div>
          ) : (
            <div className="flex flex-col">
              {log.map((commit) => (
                <button
                  key={commit.hash}
                  onClick={() => setSelectedCommit(commit)}
                  className="flex gap-3 border-b border-border px-3 py-2 text-left hover:bg-accent/50"
                >
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <div className="size-2 rounded-full border border-primary" />
                    <div className="w-px flex-1 bg-border" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-foreground/90">
                      {commit.message.split("\n")[0]}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{commit.authorName}</span>
                      <span>{relativeTime(commit.date)}</span>
                      <code className="font-mono text-[10px] text-muted-foreground/60">
                        {commit.hash.slice(0, 7)}
                      </code>
                    </div>
                    {commit.refs && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {commit.refs.split(", ").map((ref) => (
                          <Badge key={ref} variant="outline" className="text-[10px] px-1 py-0">
                            {ref}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
