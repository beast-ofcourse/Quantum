import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Tab } from "@/types/editor";

type Kind = "close" | "closeOthers" | "closeAll";

interface UnsavedChangesDialogProps {
  state: { tab: Tab; kind: Kind } | null;
  onCancel: () => void;
  onDontSave: () => void;
  onSave: () => void;
}

const COPY: Record<Kind, { title: string; bodyFor: (tab: Tab) => string }> = {
  close: {
    title: "Save changes?",
    bodyFor: (tab) =>
      `You have unsaved changes in "${tab.name}". Save before closing?`,
  },
  closeOthers: {
    title: "Save changes to other tabs?",
    bodyFor: () => "Some other tabs have unsaved changes. Save them before closing?",
  },
  closeAll: {
    title: "Save changes to all tabs?",
    bodyFor: () => "Some tabs have unsaved changes. Save them before closing?",
  },
};

export function UnsavedChangesDialog({
  state,
  onCancel,
  onDontSave,
  onSave,
}: UnsavedChangesDialogProps) {
  const open = state !== null;
  const copy = state ? COPY[state.kind] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>
            {state && copy ? copy.bodyFor(state.tab) : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDontSave}>
            Don't Save
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
