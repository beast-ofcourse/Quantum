import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export function FileTreeSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-3" aria-hidden="true">
      {[40, 65, 50, 80, 35, 55, 70, 45].map((w, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6" aria-hidden="true">
      <div className="flex gap-2 border-b border-border pb-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-24" />
      </div>
      {[98, 85, 92, 78, 88, 95, 82, 90, 76, 86].map((w, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function TerminalSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4" aria-hidden="true">
      <div className="flex gap-1.5 border-b border-border pb-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      {[92, 85, 78, 88, 90].map((w, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function GitSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 p-3", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-5" style={{ width: `${50 + (i * 7) % 40}%` }} />
      ))}
    </div>
  );
}

export function DiffSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" aria-hidden="true">
      <div className="flex gap-2 border-b border-border pb-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-16" />
      </div>
      {[90, 75, 85, 60, 80, 70, 95, 65].map((w, i) => (
        <div key={i} className="flex gap-2">
          <Skeleton className="h-4 w-8 shrink-0" />
          <Skeleton className="h-4" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

export function GraphSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-3" aria-hidden="true">
      <div className="flex gap-2 border-b border-border pb-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="relative pl-6">
        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-muted-foreground/10" />
        {[92, 88, 75, 95, 82, 70].map((w, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5">
            <Skeleton className="size-3 shrink-0 rounded-full" />
            <Skeleton className="h-4" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export { Skeleton };
