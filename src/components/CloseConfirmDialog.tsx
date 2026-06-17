import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DirtyTab {
  path: string;
  name: string;
}

export function CloseConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [dirtyTabs, setDirtyTabs] = useState<DirtyTab[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ dirtyTabs: DirtyTab[] }>).detail;
      setDirtyTabs(detail.dirtyTabs);
      setOpen(true);
    };
    window.addEventListener("code-editor:close-requested", handler);
    return () => window.removeEventListener("code-editor:close-requested", handler);
  }, []);

  const resolveClose = (discard: boolean) => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("code-editor:close-resolved", {
        detail: { discard },
      }),
    );
  };

  const handleDiscard = () => resolveClose(true);
  const handleCancel = () => resolveClose(false);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Unsaved Changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes. Do you want to discard them and close?
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-32 overflow-y-auto text-sm">
          {dirtyTabs.map((t) => (
            <div key={t.path} className="flex items-center gap-2 py-0.5 text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
              {t.name}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDiscard}>
            Discard & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
