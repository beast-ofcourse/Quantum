import { useCallback } from "react";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as monaco from "monaco-editor";
import { useEditorStore } from "@/stores/editorStore";
import { useDiagnosticStore } from "@/stores/diagnosticStore";
import type { DiagnosticItem } from "@/stores/diagnosticStore";

export function ProblemsPanel() {
  const problems = useDiagnosticStore((s) => s.problems);
  const openFile = useEditorStore((s) => s.openFile);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const handleClear = useCallback(() => {
    const models = monaco.editor.getModels();
    for (const model of models) {
      monaco.editor.setModelMarkers(model, "typescript", []);
      monaco.editor.setModelMarkers(model, "eslint", []);
      monaco.editor.setModelMarkers(model, "default", []);
    }
  }, []);

  const handleProblemClick = useCallback(
    async (problem: DiagnosticItem) => {
      await openFile(problem.path);
      setActiveTab(problem.path);
      const editors = monaco.editor.getEditors();
      const editor = editors.find((e) => {
        const model = e.getModel();
        return model?.uri.path.endsWith(problem.path);
      });
      if (editor) {
        editor.setPosition(new monaco.Position(problem.line, problem.column));
        editor.revealPosition(new monaco.Position(problem.line, problem.column));
      }
    },
    [openFile, setActiveTab],
  );

  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <AlertCircle className="size-3 text-destructive" />
          {errors.length}
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="size-3 text-warning" />
          {warnings.length}
        </span>
        <button
          onClick={handleClear}
          className="ml-auto text-muted-foreground hover:text-foreground"
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
          <div className="space-y-0.5 px-2 pb-2">
            {problems.map((p, i) => {
              const filename = (p.path || "").split(/(\\|\/)/).pop() || p.path || "";
              return (
              <div
                key={`${p.path}:${p.line}:${p.column}:${i}`}
                role="button"
                tabIndex={0}
                onClick={() => void handleProblemClick(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    void handleProblemClick(p);
                  }
                }}
                className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50 active:bg-muted/70"
              >
                {p.severity === "error" ? (
                  <AlertCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
                ) : p.severity === "warning" ? (
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                ) : (
                  <Info className="mt-0.5 size-3 shrink-0 text-blue-500" />
                )}
                <span className="truncate text-foreground/80">{p.message}</span>
                <span className="shrink-0 text-muted-foreground/60">
                  {filename} ({p.line},{p.column})
                </span>
              </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
