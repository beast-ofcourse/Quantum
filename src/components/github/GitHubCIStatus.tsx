import type { GitHubCheckRun } from "@/types/github";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, MinusCircle, Clock } from "lucide-react";

interface Props {
  checks: GitHubCheckRun[];
}

export function GitHubCIStatus({ checks }: Props) {
  const passed = checks.filter((c) => c.conclusion === "success").length;
  const failed = checks.filter((c) => c.conclusion === "failure").length;
  const pending = checks.filter(
    (c) => c.status !== "completed" || c.conclusion === null
  ).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-green-500" /> {passed}
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="h-3 w-3 text-red-500" /> {failed}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-yellow-500" /> {pending}
        </span>
      </div>

      <div className="space-y-1">
        {checks.map((check, i) => (
          <a
            key={i}
            href={check.htmlUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-accent transition-colors",
              check.conclusion === "failure" && "text-red-500",
              check.conclusion === "success" && "text-green-500",
              (check.status !== "completed" || check.conclusion === null) && "text-yellow-500"
            )}
          >
            {check.conclusion === "success" ? (
              <CheckCircle className="h-3 w-3 shrink-0" />
            ) : check.conclusion === "failure" ? (
              <XCircle className="h-3 w-3 shrink-0" />
            ) : check.conclusion === "neutral" || check.conclusion === "skipped" ? (
              <MinusCircle className="h-3 w-3 shrink-0" />
            ) : (
              <Clock className="h-3 w-3 shrink-0 animate-pulse" />
            )}
            <span className="truncate">{check.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
