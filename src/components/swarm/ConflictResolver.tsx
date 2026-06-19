import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSwarmStore } from "@/stores/swarmStore";

interface ConflictFile {
  path: string;
  theirs: string;
  ours: string;
  resolved?: string;
}

export function ConflictResolver() {
  const [files, setFiles] = useState<ConflictFile[]>([]);
  const mergeQueue = useSwarmStore((s) => s.state?.mergeQueue);

  if (files.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="size-5 text-red-400" />
            <h2 className="text-sm font-semibold">Merge Conflict</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            One or more agents have conflicting changes. Review and resolve conflicts to continue.
          </p>
          <p className="mb-4 text-xs text-muted-foreground/60">
            Conflict detected in merge queue ({mergeQueue?.length ?? 0} pending merges).
            Monaco diff integration pending full Tauri build.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFiles([])}>
              <X className="size-3" />
              Dismiss
            </Button>
            <Button
              onClick={() => {
                console.log("[ConflictResolver] accept theirs (placeholder)");
                setFiles([]);
              }}
            >
              <Check className="size-3" />
              Accept Theirs
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-3/4 w-full max-w-3xl flex-col rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <AlertTriangle className="size-5 text-red-400" />
          <h2 className="text-sm font-semibold">Merge Conflict</h2>
          <span className="ml-auto text-xs text-muted-foreground">{files.length} file(s)</span>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-48 shrink-0 border-r border-border p-2">
            {files.map((f) => (
              <button
                key={f.path}
                className="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted"
              >
                {f.path}
              </button>
            ))}
          </div>
          <div className="flex-1 p-4">
            <p className="text-xs text-muted-foreground">
              Monaco diff editor will render here in the full build.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" onClick={() => setFiles([])}>
            Cancel
          </Button>
          <Button onClick={() => setFiles([])}>
            <Check className="size-3" />
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
