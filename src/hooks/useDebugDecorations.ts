import { useEffect, useRef, useCallback } from "react";
import { useDebugStore } from "@/stores/debugStore";
import { useEditorStore } from "@/stores/editorStore";
import { getCurrentEditor, getMonacoModule } from "@/extensions/editorRef";
import type * as monaco from "monaco-editor";

const BREAKPOINT_CLASS = "debug-breakpoint-glyph";
const EXECUTION_LINE_CLASS = "debug-execution-line-background";
const EXECUTION_GLYPH_CLASS = "debug-execution-line-glyph";


function injectStyles(_monacoModule: typeof monaco): void {
  const styleId = "debug-decorations-style";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .${BREAKPOINT_CLASS} {
      background: #ef4444;
      border-radius: 50%;
      width: 8px !important;
      height: 8px !important;
      margin-left: 5px;
      margin-top: 5px;
    }
    .${EXECUTION_LINE_CLASS} {
      background: rgba(234, 179, 8, 0.15);
      border-left: 3px solid #eab308;
    }
    .${EXECUTION_GLYPH_CLASS} {
      background: #eab308;
      clip-path: polygon(0% 0%, 100% 50%, 0% 100%);
      width: 10px !important;
      height: 12px !important;
      margin-left: 4px;
      margin-top: 4px;
    }

  `;
  document.head.appendChild(style);
}

interface DecorationState {
  breakpointIds: string[];
  executionIds: string[];
  selectedFrameIds: string[];
  gutterHandler: (() => void) | null;
}

export function useDebugDecorations(): void {
  const stateRef = useRef<DecorationState>({
    breakpointIds: [],
    executionIds: [],
    selectedFrameIds: [],
    gutterHandler: null,
  });

  const breakpoints = useDebugStore((s) => s.breakpoints);
  const callStack = useDebugStore((s) => s.callStack);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  const updateDecorations = useCallback(() => {
    const editor = getCurrentEditor();
    const monacoModule = getMonacoModule();
    if (!editor || !monacoModule) return;

    injectStyles(monacoModule);

    const model = editor.getModel();
    if (!model) return;

    const uri = model.uri.toString();
    const filePath = model.uri.path;

    const newBreakpointDecorations: monaco.editor.IModelDeltaDecoration[] = [];
    const fileBreakpoints = breakpoints.get(filePath);
    if (fileBreakpoints) {
      for (const bp of fileBreakpoints) {
        if (!bp.enabled) continue;
        newBreakpointDecorations.push({
          range: new monacoModule.Range(bp.line, 1, bp.line, 1),
          options: {
            isWholeLine: false,
            glyphMarginClassName: `${BREAKPOINT_CLASS} ${bp.verified ? "opacity-100" : "opacity-50"}`,
            glyphMarginHoverMessage: { value: `Breakpoint at line ${bp.line}` },
          },
        });
      }
    }

    const newExecutionDecorations: monaco.editor.IModelDeltaDecoration[] = [];
    const newSelectedFrameDecorations: monaco.editor.IModelDeltaDecoration[] = [];

    if (callStack.length > 0) {
      const topFrame = callStack[0];
      if (topFrame.source?.path) {
        const frameUri = monacoModule.Uri.file(topFrame.source.path).toString();
        if (frameUri === uri) {
          newExecutionDecorations.push({
            range: new monacoModule.Range(
              topFrame.line,
              topFrame.column,
              topFrame.line,
              topFrame.column + 1,
            ),
            options: {
              isWholeLine: true,
              className: EXECUTION_LINE_CLASS,
              glyphMarginClassName: EXECUTION_GLYPH_CLASS,
            },
          });
        }
      }
    }

    const prev = stateRef.current;
    prev.breakpointIds = editor.deltaDecorations(
      prev.breakpointIds,
      newBreakpointDecorations,
    );
    prev.executionIds = editor.deltaDecorations(
      prev.executionIds,
      newExecutionDecorations,
    );
    prev.selectedFrameIds = editor.deltaDecorations(
      prev.selectedFrameIds,
      newSelectedFrameDecorations,
    );
  }, [breakpoints, callStack]);

  useEffect(() => {
    const prev = stateRef.current;

    const editor = getCurrentEditor();
    const monacoModule = getMonacoModule();
    if (!editor || !monacoModule) return;

    const handleGutterClick = (e: monaco.editor.IEditorMouseEvent) => {
      const target = e.target;
      if (target.type !== monacoModule.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      if (!target.position) return;
      const line = target.position.lineNumber;
      const model = editor.getModel();
      if (!model) return;
      const filePath = model.uri.path;

      const currentBreakpoints = useDebugStore.getState().breakpoints.get(filePath);
      const exists = currentBreakpoints?.some((bp) => bp.line === line);

      if (exists) {
        useDebugStore.getState().removeBreakpoint(filePath, line);
      } else {
        useDebugStore.getState().addBreakpoint(filePath, line);
      }
    };

    const disposable = editor.onMouseDown(handleGutterClick);
    prev.gutterHandler = () => disposable.dispose();

    updateDecorations();

    const unsubscribe = useDebugStore.subscribe(updateDecorations);

    return () => {
      disposable.dispose();
      unsubscribe();
      editor.deltaDecorations(prev.breakpointIds, []);
      editor.deltaDecorations(prev.executionIds, []);
      editor.deltaDecorations(prev.selectedFrameIds, []);
      prev.breakpointIds = [];
      prev.executionIds = [];
      prev.selectedFrameIds = [];
      prev.gutterHandler = null;
    };
  }, [activeTabId]);
}
