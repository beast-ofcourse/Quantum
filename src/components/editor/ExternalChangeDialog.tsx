import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ExternalChangeDialogProps {
  tabName: string | null;
  onKeepLocal: () => void;
  onReload: () => void;
}

export function ExternalChangeDialog({
  tabName,
  onKeepLocal,
  onReload,
}: ExternalChangeDialogProps) {
  const open = tabName !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onKeepLocal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File changed on disk</DialogTitle>
          <DialogDescription>
            &quot;{tabName ?? ""}&quot; has been modified outside the editor.
            Reload from disk and lose local changes?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onKeepLocal}>
            Keep local
          </Button>
          <Button onClick={onReload}>Reload from disk</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
