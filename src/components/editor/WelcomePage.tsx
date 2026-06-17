import { useState, useEffect } from "react";
import { FolderOpen, Keyboard, History, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";


interface WelcomePageProps {
  onOpenFolder: () => void;
  onNewFile: () => void;
  onOpenRecentFolder?: (path: string) => void;
}

const SHORTCUTS = [
  { keys: "Ctrl+O", label: "Open File" },
  { keys: "Ctrl+K Ctrl+O", label: "Open Folder" },
  { keys: "Ctrl+N", label: "New File (in Explorer)" },
  { keys: "Ctrl+S", label: "Save" },
  { keys: "Ctrl+Shift+P", label: "Command Palette" },
  { keys: "Ctrl+B", label: "Toggle Sidebar" },
  { keys: "Ctrl+`", label: "Toggle Terminal" },
  { keys: "Ctrl+Shift+G", label: "Source Control" },
];

export function WelcomePage({ onOpenFolder, onNewFile, onOpenRecentFolder }: WelcomePageProps) {
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("code-editor:recentFolders");
      if (stored) setRecentFolders(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-auto">
      {theme === "spiderman" ? (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/spidy-eyes.png)" }} />
      ) : (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/welcome-image.jpg)" }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/10 to-background/70" />
      <div className="relative z-10 flex max-w-lg flex-col items-center gap-8 px-6 py-12">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-xl bg-primary/10">
            <span className="text-3xl font-bold text-primary">&lt;/&gt;</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Quantum</h1>
          <p className="text-sm text-muted-foreground">Open a folder to get started</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={onOpenFolder}>
            <FolderOpen className="mr-2 size-4" />
            Open Folder
          </Button>
          <Button variant="outline" onClick={onNewFile}>
            <FileText className="mr-2 size-4" />
            Open File…
          </Button>
        </div>

        {/* Recent folders */}
        {recentFolders.length > 0 && (
          <div className="w-full">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <History className="size-3.5" />
              Recent
            </div>
            <div className="flex flex-col gap-1">
              {recentFolders.map((folder) => (
                <button
                  key={folder}
                  onClick={() => onOpenRecentFolder?.(folder)}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <FolderOpen className="size-3.5 shrink-0" />
                  <span className="truncate">{folder}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shortcuts */}
        <div className="w-full">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Keyboard className="size-3.5" />
            Keyboard Shortcuts
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {SHORTCUTS.map(({ keys, label }) => (
              <div key={keys} className="flex items-center justify-between gap-4 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
