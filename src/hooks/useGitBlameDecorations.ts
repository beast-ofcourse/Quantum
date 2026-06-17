import { useEffect, useRef, useCallback } from "react";
import { getCurrentEditor, getMonacoModule } from "@/extensions/editorRef";
import { useGitStore } from "@/stores/gitStore";
import type * as monaco from "@/lib/monaco-entry";

export function useGitBlameDecorations(
  path: string | undefined,
  enabled: boolean,
) {
  const decorationIdsRef = useRef<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const applyDecorations = useCallback(() => {
    const editor = getCurrentEditor();
    const monaco = getMonacoModule();
    if (!editor || !monaco || !pathRef.current) return;

    const blame = useGitStore.getState().blame;
    if (!blame || blame.length === 0) return;

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    for (const line of blame) {
      decorations.push({
        range: new monaco.Range(line.line, 1, line.line, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: "git-blame-glyph",
          glyphMarginHoverMessage: {
            value: `**${line.author}** — ${line.message.split("\n")[0]}`,
          },
        },
      });
    }

    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      decorations,
    );
  }, []);

  const clearDecorations = useCallback(() => {
    const editor = getCurrentEditor();
    if (editor && decorationIdsRef.current.length > 0) {
      decorationIdsRef.current = editor.deltaDecorations(
        decorationIdsRef.current,
        [],
      );
    }
  }, []);

  useEffect(() => {
    if (!enabled || !path) {
      clearDecorations();
      return;
    }

    const repoRoot = useGitStore.getState().repoRoot;
    if (repoRoot) {
      useGitStore.getState().getBlame(path);
    }

    const unsubscribe = useGitStore.subscribe((state, prevState) => {
      if (pathRef.current && state.blame !== prevState.blame) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(applyDecorations, 200);
      }
    });

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearDecorations();
    };
  }, [path, enabled, applyDecorations, clearDecorations]);
}
