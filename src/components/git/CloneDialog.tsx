import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useGitStore } from "@/stores/gitStore";
import { useFileStore } from "@/stores/fileStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloneDialog({ open, onOpenChange }: Props) {
  const cloneRepo = useGitStore((s) => s.cloneRepo);
  const setRepoRoot = useGitStore((s) => s.setRepoRoot);
  const checkIsRepo = useGitStore((s) => s.checkIsRepo);
  const openFolder = useFileStore((s) => s.openFolder);
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [depth, setDepth] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClone = async () => {
    if (!url.trim()) { setError("Repository URL is required"); return; }
    if (!path.trim()) { setError("Destination path is required"); return; }
    setLoading(true); setError(null);
    try {
      const depthNum = depth.trim() ? parseInt(depth, 10) : undefined;
      await cloneRepo(url.trim(), path.trim(), depthNum);
      setRepoRoot(path.trim());
      await openFolder(path.trim());
      onOpenChange(false);
      void checkIsRepo();
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clone Repository</DialogTitle>
          <DialogDescription>Clone a remote Git repository to a local directory.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Repository URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Destination Path</label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="C:/Users/me/projects/my-repo"
              className="mt-1 h-8 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Depth (optional, shallow clone)</label>
            <Input
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              placeholder="Leave empty for full history"
              className="mt-1 h-8 text-sm"
              type="number"
              min="1"
            />
          </div>
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="size-3 shrink-0" />{error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleClone} disabled={loading || !url.trim() || !path.trim()}>
            {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
            Clone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
