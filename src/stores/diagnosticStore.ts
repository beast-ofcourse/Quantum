import { create } from "zustand";
import * as monaco from "@/lib/monaco-entry";

export interface DiagnosticItem {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
}

interface DiagnosticState {
  errorCount: number;
  warningCount: number;
  problems: DiagnosticItem[];
  isReady: boolean;
}

export const useDiagnosticStore = create<DiagnosticState>(() => ({
  errorCount: 0,
  warningCount: 0,
  problems: [],
  isReady: false,
}));

let subscription: monaco.IDisposable | null = null;

export function initDiagnostics() {
  if (subscription) return;

  const update = () => {
    const markers = monaco.editor.getModelMarkers({});
    const problems = markers.map((m) => ({
      path: decodeURIComponent(m.resource.path),
      line: m.startLineNumber,
      column: m.startColumn,
      message: m.message,
      severity:
        m.severity === monaco.MarkerSeverity.Error
          ? "error" as const
          : m.severity === monaco.MarkerSeverity.Warning
            ? "warning" as const
            : "info" as const,
    }));

    useDiagnosticStore.setState({
      problems,
      errorCount: problems.filter((p) => p.severity === "error").length,
      warningCount: problems.filter((p) => p.severity === "warning").length,
      isReady: true,
    });
  };

  subscription = monaco.editor.onDidChangeMarkers(() => {
    update();
  });

  update();
}

export function destroyDiagnostics() {
  subscription?.dispose();
  subscription = null;
}
