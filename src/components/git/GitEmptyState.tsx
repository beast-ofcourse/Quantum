import { useState } from "react";
import { GitBranch, GitCommitHorizontal, FolderOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileStore } from "@/stores/fileStore";
import { useGitStore } from "@/stores/gitStore";

interface Props {
  isRepo: boolean;
  checkingRepo: boolean;
}

export function GitEmptyState({ isRepo, checkingRepo }: Props) {
  const rootPath = useFileStore((s) => s.rootPath);
  const initRepo = useGitStore((s) => s.initRepo);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

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
        <Button
          variant="secondary"
          size="sm"
          onClick={handleInit}
          disabled={isInitializing}
          className="mt-2"
        >
          <GitCommitHorizontal className="mr-2 size-4" />
          {isInitializing ? "Initializing..." : "Initialize Repository"}
        </Button>
      </div>
    );
  }

  return null;
}
