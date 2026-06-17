import { FileText, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";
import { useFileStore } from "@/stores/fileStore";
import { pickFiles, pickFolder } from "@/tauri";

const isMac = typeof navigator !== 'undefined' && (navigator.platform?.toUpperCase().includes('MAC') || navigator.userAgent?.includes('Macintosh'));
const modifier = isMac ? 'Cmd' : 'Ctrl';

export function EditorEmptyState() {
  const togglePanel = useUiStore((s) => s.togglePanel);
  const rootPath = useFileStore((s) => s.rootPath);

  const openFolder = async () => {
    const picked = await pickFolder();
    if (picked) {
      await useFileStore.getState().openFolder(picked);
    }
  };

  const openFile = async () => {
    const picked = await pickFiles({ title: "Open File" });
    if (picked && picked.length > 0) {
      await useFileStore.getState().openFiles(picked);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <FileText className="mx-auto mb-3 size-10 text-muted-foreground/60" />
        <h2 className="mb-1 text-base font-semibold text-foreground">
          {rootPath ? "No file open" : "Welcome"}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {rootPath
            ? "Select a file from the explorer to open it in the editor."
            : "Open a folder or file to start editing."}
        </p>
        <div className="flex items-center justify-center gap-2">
          {rootPath ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => togglePanel("explorer")}
            >
              Show Explorer
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={openFile}>
                <FileText className="size-3.5" />
                Open File…
              </Button>
              <Button size="sm" variant="outline" onClick={openFolder}>
                <FolderOpen className="size-3.5" />
                Open Folder…
              </Button>
            </>
          )}
        </div>
        <div className="mt-6 space-y-1 text-left text-xs text-muted-foreground/80">
          <p className="font-semibold text-muted-foreground">Shortcuts</p>
          <p>{modifier}+O — open file</p>
          <p>{modifier}+K — open folder</p>
          <p>{modifier}+B — toggle sidebar</p>
          <p>{modifier}+` — toggle terminal</p>
          <p>{modifier}+S — save file</p>
          <p>{modifier}+W — close tab</p>
          <p>{modifier}+Tab — cycle tabs</p>
        </div>
      </div>
    </div>
  );
}
