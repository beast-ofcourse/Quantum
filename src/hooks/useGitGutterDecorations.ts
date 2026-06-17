import { useEffect, useRef, useCallback } from "react";
import { getCurrentEditor, getMonacoModule } from "@/extensions/editorRef";
import { useGitStore } from "@/stores/gitStore";
import type * as monaco from "@/lib/monaco-entry";

export function useGitGutterDecorations(path: string | undefined) {
  const decorationIdsRef = useRef<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const applyDecorations = useCallback(() => {
    const editor = getCurrentEditor();
    const monaco = getMonacoModule();
    if (!editor || !monaco || !pathRef.current) return;

    const repoRoot = useGitStore.getState().repoRoot;
    if (!repoRoot) return;

    const cacheKey = pathRef.current;
    const cached = useGitStore.getState().diffHunkCache[cacheKey];

    if (!cached) {
      useGitStore.getState().getDiffHunks(pathRef.current, false);
      return;
    }

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    for (const hunk of cached) {
      const hasAdded = hunk.lines.some((l) => l.type === "added");
      const hasRemoved = hunk.lines.some((l) => l.type === "removed");
      const hunkType = hasAdded && hasRemoved ? "modified" : hasAdded ? "added" : "removed";

      for (const line of hunk.lines) {
        if (line.type === "context") continue;

        const displayLine = line.newLineNumber ?? line.oldLineNumber;
        if (displayLine == null) continue;

        decorations.push({
          range: new monaco.Range(displayLine, 1, displayLine, 1),
          options: {
            isWholeLine: true,
            glyphMarginClassName:
              hunkType === "modified"
                ? "git-gutter-modified"
                : hunkType === "added"
                  ? "git-gutter-added"
                  : "git-gutter-deleted",
            glyphMarginHoverMessage: {
              value:
                hunkType === "modified"
                  ? "Modified"
                  : hunkType === "added"
                    ? "Added"
                    : "Removed",
            },
          },
        });
      }
    }

    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      decorations,
    );
  }, []);

  useEffect(() => {
    const unsubscribe = useGitStore.subscribe((state, prevState) => {
      if (pathRef.current && state.diffHunkCache !== prevState.diffHunkCache) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(applyDecorations, 300);
      }
    });

    if (path) {
      const repoRoot = useGitStore.getState().repoRoot;
      if (repoRoot) {
        useGitStore.getState().getDiffHunks(path, false);
      }
    }

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const editor = getCurrentEditor();
      if (editor && decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(
          decorationIdsRef.current,
          [],
        );
      }
    };
  }, [path, applyDecorations]);
}
