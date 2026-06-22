import { useState, useEffect } from "react";
import { Columns2, AlignJustify, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiffEditor } from "@monaco-editor/react";
import { useGitStore } from "@/stores/gitStore";
import { useUiStore } from "@/stores/uiStore";
import { ThemeService } from "@/lib/themeService";
import { readFile } from "@/tauri/fs";
import { getLanguageFromPath } from "@/lib/languages";
import { DiffSkeleton } from "@/components/ui/skeleton";

interface Props {
  path: string;
  staged: boolean;
  onClose: () => void;
}

export function GitDiffView({ path, staged, onClose }: Props) {
  const theme = useUiStore((s) => s.theme);
  const showFile = useGitStore((s) => s.showFile);
  const error = useGitStore((s) => s.error);

  const [mode, setMode] = useState<"inline" | "side-by-side">("side-by-side");
  const [originalContent, setOriginalContent] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");
  const [diffLoading, setDiffLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadContents = async () => {
      setDiffLoading(true);
      try {
        let original = "";
        let modified = "";

        if (staged) {
          // staged diff: HEAD vs index
          original = await showFile(path, "HEAD");
          modified = await showFile(path, "");
        } else {
          // unstaged diff: index vs disk
          original = await showFile(path, "");
          try {
            modified = await readFile(path);
          } catch {
            // file might be deleted on disk
            modified = "";
          }
        }

        if (active) {
          setOriginalContent(original);
          setModifiedContent(modified);
        }
      } catch (err) {
        console.error("Error loading diff contents", err);
      } finally {
        if (active) {
          setDiffLoading(false);
        }
      }
    };

    loadContents();
    return () => {
      active = false;
    };
  }, [path, staged, showFile]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500 p-4">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 bg-muted/20">
        <span className="text-xs font-medium text-foreground truncate max-w-[60%]">
          Diff: {path.split(/[/\\]/).pop()}
          {staged && <span className="ml-2 text-green-500 font-semibold">(staged)</span>}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant={mode === "inline" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setMode("inline")}
            title="Inline view"
            className="h-6 w-8 p-0"
          >
            <AlignJustify className="size-3.5" />
          </Button>
          <Button
            variant={mode === "side-by-side" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setMode("side-by-side")}
            title="Side by side"
            className="h-6 w-8 p-0"
          >
            <Columns2 className="size-3.5" />
          </Button>
          <Button variant="ghost" size="xs" onClick={onClose} className="h-6 w-8 p-0">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        {diffLoading ? (
          <DiffSkeleton />
        ) : (
          <DiffEditor
            original={originalContent}
            modified={modifiedContent}
            language={getLanguageFromPath(path)}
            theme={ThemeService.toMonacoThemeId(theme)}
            options={{
              readOnly: true,
              originalEditable: false,
              renderSideBySide: mode === "side-by-side",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fixedOverflowWidgets: true,
            }}
            loading={
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                Loading diff editor…
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
