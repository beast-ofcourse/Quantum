import { useState, useEffect } from "react";
import { Tag, Plus, Trash2, Upload, Tags, Loader2, AlertCircle } from "lucide-react";
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
import type { GitTag } from "@/types/git";

interface CreateTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCommit?: string;
}

function CreateTagDialog({ open, onOpenChange, defaultCommit }: CreateTagDialogProps) {
  const createTag = useGitStore((s) => s.createTag);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [commit, setCommit] = useState(defaultCommit ?? "");
  const [annotated, setAnnotated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setMessage("");
      setCommit(defaultCommit ?? "");
      setAnnotated(true);
      setError(null);
    }
  }, [open, defaultCommit]);

  const handleCreate = async () => {
    if (!name.trim()) { setError("Tag name is required"); return; }
    if (!commit.trim()) { setError("Commit hash is required"); return; }
    setLoading(true);
    setError(null);
    try {
      await createTag(name.trim(), message.trim(), commit.trim(), annotated);
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Tag</DialogTitle>
          <DialogDescription>Create a new git tag at the specified commit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tag Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="v1.0.0" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Commit</label>
            <Input value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="HEAD" className="mt-1 h-8 text-sm font-mono" />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={annotated} onChange={(e) => setAnnotated(e.target.checked)} className="rounded" />
              Annotated tag
            </label>
          </div>
          {annotated && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tag message..."
                className="mt-1 w-full h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="size-3 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Tag className="size-3 mr-1" />}
            Create Tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagItem({ tag, onDelete, onPush }: { tag: GitTag; onDelete: (name: string) => void; onPush: (name: string) => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 rounded-sm group">
      <Tag className="size-3 shrink-0 text-blue-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono truncate">{tag.name}</span>
          {tag.isAnnotated && <span className="text-[10px] px-1 rounded bg-blue-500/20 text-blue-400">a</span>}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono truncate">{tag.hash.slice(0, 8)}</div>
      </div>
      <div className="hidden group-hover:flex items-center gap-0.5">
        <button onClick={() => onPush(tag.name)} className="p-1 rounded hover:bg-accent" title="Push tag">
          <Upload className="size-3" />
        </button>
        <button onClick={() => onDelete(tag.name)} className="p-1 rounded hover:bg-accent text-red-400" title="Delete tag">
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function TagManager({ defaultCommit }: { defaultCommit?: string }) {
  const tags = useGitStore((s) => s.tags);
  const tagsLoading = useGitStore((s) => s.tagsLoading);
  const refreshTags = useGitStore((s) => s.refreshTags);
  const deleteTag = useGitStore((s) => s.deleteTag);
  const pushTag = useGitStore((s) => s.pushTag);
  const [createOpen, setCreateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  const handleDelete = (name: string) => {
    if (window.confirm(`Delete tag "${name}"?`)) {
      deleteTag(name);
    }
  };

  const handlePush = (name: string) => {
    if (window.confirm(`Push tag "${name}" to remote?`)) {
      pushTag(name);
    }
  };

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <Tags className="size-3" />
        <span className="flex-1 text-left">Tags</span>
        <span className="text-xs font-normal">{tags.length}</span>
        <Plus className="size-3" onClick={(e) => { e.stopPropagation(); setCreateOpen(true); }} />
      </button>
      {!collapsed && (
        <ScrollArea className="max-h-32">
          {tagsLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            </div>
          ) : tags.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">No tags</div>
          ) : (
            tags.map((tag) => (
              <TagItem key={tag.name} tag={tag} onDelete={handleDelete} onPush={handlePush} />
            ))
          )}
        </ScrollArea>
      )}
      <CreateTagDialog open={createOpen} onOpenChange={setCreateOpen} defaultCommit={defaultCommit} />
    </div>
  );
}
