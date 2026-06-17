import { useState } from "react";
import { GitBranch, GitCommitHorizontal, FolderOpen, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileStore } from "@/stores/fileStore";
import { useGitStore } from "@/stores/gitStore";
import { CloneDialog } from "./CloneDialog";

interface Props {
  isRepo: boolean;
  checkingRepo: boolean;
}

export function GitEmptyState({ isRepo, checkingRepo }: Props) {
  const rootPath = useFileStore((s) => s.rootPath);
  const initRepo = useGitStore((s) => s.initRepo);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);

  const handleInit = async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      await initRepo();
    } catch (err) {
      setInitError(String(err));
    } finally {
      setIsInitializing(false);
    }
  };

  if (!rootPath) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
        <FolderOpen className="size-10 opacity-40" />
        <p className="leading-relaxed">Open a folder to see source control options.</p>
      </div>
    );
  }

  if (checkingRepo) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isRepo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
        <GitBranch className="size-10 opacity-40" />
        <p className="leading-relaxed">This folder is not a Git repository.</p>
        {initError && (
          <div className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertCircle className="size-3" />
            {initError}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleInit}
            disabled={isInitializing}
          >
            <GitCommitHorizontal className="mr-2 size-4" />
            {isInitializing ? "Initializing..." : "Initialize Repository"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCloneOpen(true)}
          >
            <Download className="mr-2 size-4" />
            Clone Repository
          </Button>
        </div>
        <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} />
      </div>
    );
  }

  return null;
}
