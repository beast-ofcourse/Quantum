import { useState, useEffect } from "react";
import {
  Globe, Plus, Trash2, Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useGitStore } from "@/stores/gitStore";
import type { GitRemote } from "@/types/git";

function RemoteItem({
  remote,
  onRemove,
}: {
  remote: GitRemote;
  onRemove: (name: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 rounded-sm group">
      <Globe className="size-3 shrink-0 text-purple-400" />
      <div className="flex-1 min-w-0">
        <span className="text-xs truncate block font-medium">{remote.name}</span>
        <span className="text-[10px] text-muted-foreground truncate block">{remote.fetchUrl ?? remote.pushUrl ?? "—"}</span>
      </div>
      <div className="hidden group-hover:flex items-center gap-0.5">
        <button onClick={() => onRemove(remote.name)} className="p-1 rounded hover:bg-accent text-red-400" title="Remove remote">
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function RemoteManager() {
  const remotes = useGitStore((s) => s.remotes);
  const addRemote = useGitStore((s) => s.addRemote);
  const removeRemote = useGitStore((s) => s.removeRemote);
  const refreshRemotes = useGitStore((s) => s.refreshRemotes);
  const [collapsed, setCollapsed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { refreshRemotes(); }, [refreshRemotes]);

  const handleAdd = async () => {
    if (!name.trim()) { setError("Remote name is required"); return; }
    if (!url.trim()) { setError("URL is required"); return; }
    setLoading(true); setError(null);
    try {
      await addRemote(name.trim(), url.trim());
      setName(""); setUrl(""); setAddOpen(false);
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  };

  const handleRemove = (name: string) => {
    if (window.confirm(`Remove remote "${name}"?`)) removeRemote(name);
  };

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <Globe className="size-3" />
        <span className="flex-1 text-left">Remotes</span>
        <span className="text-xs font-normal">{remotes.length}</span>
        <Plus className="size-3" onClick={(e) => { e.stopPropagation(); setAddOpen(true); }} />
      </button>
      {!collapsed && (
        <ScrollArea className="max-h-36">
          {remotes.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">No remotes</div>
          ) : (
            remotes.map((r) => (
              <RemoteItem key={r.name} remote={r} onRemove={handleRemove} />
            ))
          )}
        </ScrollArea>
      )}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Remote</DialogTitle>
            <DialogDescription>Add a new remote repository.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="origin" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/..." className="mt-1 h-8 text-sm font-mono" />
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle className="size-3 shrink-0" />{error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={loading}>
              {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Globe className="size-3 mr-1" />}
              Add Remote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
