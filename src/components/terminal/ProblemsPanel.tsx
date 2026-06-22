import { useCallback, useState } from "react";
import { AlertCircle, AlertTriangle, Info, X, ChevronRight, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as monaco from "@/lib/monaco-entry";
import { useEditorStore } from "@/stores/editorStore";
import { useDiagnosticStore } from "@/stores/diagnosticStore";
import type { DiagnosticItem } from "@/stores/diagnosticStore";

function getFileName(path: string) {
  return path.split(/[/\\]/).pop() || path;
}

function FileGroup({
  file,
  items,
}: {
  file: string;
  items: DiagnosticItem[];
}) {
  const [open, setOpen] = useState(true);
  const openFile = useEditorStore((s) => s.openFile);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const errCount = items.filter((p) => p.severity === "error").length;
  const warnCount = items.filter((p) => p.severity === "warning").length;

  const handleNavigate = useCallback(
    async (p: DiagnosticItem) => {
      await openFile(p.path);
      setActiveTab(p.path);
      const editors = monaco.editor.getEditors();
      const editor = editors.find((e) => {
        const model = e.getModel();
        return model?.uri.path.endsWith(p.path);
      });
      if (editor) {
        editor.setPosition(new monaco.Position(p.line, p.column));
        editor.revealPosition(new monaco.Position(p.line, p.column));
        editor.focus();
      }
    },
    [openFile, setActiveTab],
  );

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1 text-xs hover:bg-accent/50 cursor-pointer"
      >
        {open ? <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" /> : <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />}
        <span className="font-medium truncate">{getFileName(file)}</span>
        {errCount > 0 && (
          <span className="ml-auto flex items-center gap-0.5 text-destructive">
            <AlertCircle className="size-3" />{errCount}
          </span>
        )}
        {warnCount > 0 && (
          <span className="flex items-center gap-0.5 text-warning">
            <AlertTriangle className="size-3" />{warnCount}
          </span>
        )}
      </button>
      {open && (
        <div>
          {items.map((p, i) => (
            <div
              key={`${p.line}:${p.column}:${i}`}
              role="button"
              tabIndex={0}
              onClick={() => void handleNavigate(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  void handleNavigate(p);
                }
              }}
              className="flex cursor-pointer items-start gap-2 py-0.5 pl-8 pr-3 text-xs hover:bg-accent/30 active:bg-accent/50"
            >
              {p.severity === "error" ? (
                <AlertCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
              ) : p.severity === "warning" ? (
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
              ) : (
                <Info className="mt-0.5 size-3 shrink-0 text-blue-500" />
              )}
              <span className="truncate text-foreground/80">{p.message}</span>
              <span className="shrink-0 text-muted-foreground/50 ml-auto pl-2">
                line {p.line}, col {p.column}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProblemsPanel() {
  const problems = useDiagnosticStore((s) => s.problems);

  const handleClear = useCallback(() => {
    const models = monaco.editor.getModels();
    for (const model of models) {
      monaco.editor.setModelMarkers(model, "typescript", []);
      monaco.editor.setModelMarkers(model, "eslint", []);
      monaco.editor.setModelMarkers(model, "default", []);
    }
  }, []);

  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");
  const groups: Record<string, DiagnosticItem[]> = {};
  for (const p of problems) {
    if (!groups[p.path]) groups[p.path] = [];
    groups[p.path].push(p);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Problems</span>
        <span className="flex items-center gap-1 ml-auto">
          <AlertCircle className="size-3 text-destructive" />
          {errors.length}
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="size-3 text-warning" />
          {warnings.length}
        </span>
        <button
          onClick={handleClear}
          className="text-muted-foreground hover:text-foreground cursor-pointer"
          title="Clear all"
        >
          <X className="size-3" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        {problems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            No problems detected
          </div>
        ) : (
          Object.entries(groups).map(([file, items]) => (
            <FileGroup key={file} file={file} items={items} />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
