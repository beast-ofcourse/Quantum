import { useState, useEffect, useRef } from "react";
import { AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGitStore } from "@/stores/gitStore";
import { useUiStore } from "@/stores/uiStore";
import { ThemeService } from "@/lib/themeService";
import { readFile, writeFile } from "@/tauri/fs";
import { getLanguageFromPath } from "@/lib/languages";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "@/lib/monaco-entry";

interface Props {
	path: string;
}

interface ConflictInfo {
	startLine: number;
	splitLine: number;
	endLine: number;
	oursText: string;
	theirsText: string;
	fullRange: monaco.Range;
}

// Custom CSS styling injected dynamically
const conflictStyles = `
  .conflict-ours-bg { background-color: rgba(34, 197, 94, 0.08) !important; display: block; }
  .conflict-theirs-bg { background-color: rgba(59, 130, 246, 0.08) !important; display: block; }
  .conflict-ours-gutter { border-left: 3px solid #22c55e !important; }
  .conflict-theirs-gutter { border-left: 3px solid #3b82f6 !important; }
  .conflict-header-ours-bg { background-color: rgba(34, 197, 94, 0.20) !important; border-top: 1px solid rgba(34, 197, 94, 0.4); border-bottom: 1px solid rgba(34, 197, 94, 0.4); }
  .conflict-header-theirs-bg { background-color: rgba(59, 130, 246, 0.20) !important; border-top: 1px solid rgba(59, 130, 246, 0.4); border-bottom: 1px solid rgba(59, 130, 246, 0.4); }
`;

function parseConflicts(model: monaco.editor.ITextModel): ConflictInfo[] {
	const lineCount = model.getLineCount();
	const conflicts: ConflictInfo[] = [];

	let currentOursStart: number | null = null;
	let currentSplit: number | null = null;

	for (let i = 1; i <= lineCount; i++) {
		const line = model.getLineContent(i);
		if (line.startsWith("<<<<<<<")) {
			currentOursStart = i;
		} else if (line.startsWith("=======") && currentOursStart !== null) {
			currentSplit = i;
		} else if (
			line.startsWith(">>>>>>>") &&
			currentOursStart !== null &&
			currentSplit !== null
		) {
			const oursLines = [];
			for (let j = currentOursStart + 1; j < currentSplit; j++) {
				oursLines.push(model.getLineContent(j));
			}
			const theirsLines = [];
			for (let j = currentSplit + 1; j < i; j++) {
				theirsLines.push(model.getLineContent(j));
			}

			conflicts.push({
				startLine: currentOursStart,
				splitLine: currentSplit,
				endLine: i,
				oursText: oursLines.join("\n"),
				theirsText: theirsLines.join("\n"),
				fullRange: new monaco.Range(
					currentOursStart,
					1,
					i,
					model.getLineMaxColumn(i),
				),
			});

			currentOursStart = null;
			currentSplit = null;
		}
	}

	return conflicts;
}

export function MergeConflictResolver({ path }: Props) {
	const theme = useUiStore((s) => s.theme);
	const stage = useGitStore((s) => s.stage);

	const [initialContent, setInitialContent] = useState<string>("");
	const [currentContent, setCurrentContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const decorationsCollectionRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const providerRef = useRef<monaco.IDisposable | null>(null);
  const conflictContainerRef = useRef<HTMLDivElement>(null);
  const [containerReady, setContainerReady] = useState(false);

  useEffect(() => {
    const el = conflictContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerReady(true);
          ro.disconnect();
          break;
        }
      }
    });
    ro.observe(el);
    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
      setContainerReady(true);
      ro.disconnect();
    }
    return () => ro.disconnect();
  }, []);

	useEffect(() => {
		setLoading(true);
		setError(null);
		readFile(path)
			.then((data) => {
				setInitialContent(data);
				setCurrentContent(data);
				setLoading(false);
			})
			.catch((err) => {
				setError(String(err));
				setLoading(false);
			});

		return () => {
			if (providerRef.current) {
				providerRef.current.dispose();
			}
		};
	}, [path]);

	// Inject visual conflict styles dynamically
	useEffect(() => {
		const styleEl = document.createElement("style");
		styleEl.innerHTML = conflictStyles;
		document.head.appendChild(styleEl);
		return () => {
			document.head.removeChild(styleEl);
		};
	}, []);

	const updateDecorations = (
		editor: monaco.editor.IStandaloneCodeEditor,
		monacoInstance: typeof monaco,
	) => {
		const model = editor.getModel();
		if (!model) return;

		const conflicts = parseConflicts(model);
		const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];

    conflicts.forEach((conflict) => {
      // Ours block lines decoration
      if (conflict.splitLine > conflict.startLine + 1) {
        newDecorations.push({
          range: new monacoInstance.Range(conflict.startLine + 1, 1, conflict.splitLine - 1, model.getLineMaxColumn(conflict.splitLine - 1)),
          options: {
            className: "conflict-ours-bg",
            isWholeLine: true,
          }
        });
      }

      // Theirs block lines decoration
      if (conflict.endLine > conflict.splitLine + 1) {
        newDecorations.push({
          range: new monacoInstance.Range(conflict.splitLine + 1, 1, conflict.endLine - 1, model.getLineMaxColumn(conflict.endLine - 1)),
          options: {
            className: "conflict-theirs-bg",
            isWholeLine: true,
          }
        });
      }

			// Ours header line decoration
			newDecorations.push({
				range: new monacoInstance.Range(
					conflict.startLine,
					1,
					conflict.startLine,
					model.getLineMaxColumn(conflict.startLine),
				),
				options: {
					className: "conflict-header-ours-bg",
					isWholeLine: true,
				},
			});

			// Theirs header line decoration
			newDecorations.push({
				range: new monacoInstance.Range(
					conflict.endLine,
					1,
					conflict.endLine,
					model.getLineMaxColumn(conflict.endLine),
				),
				options: {
					className: "conflict-header-theirs-bg",
					isWholeLine: true,
				},
			});
		});

		if (decorationsCollectionRef.current) {
			decorationsCollectionRef.current.set(newDecorations);
		} else {
			decorationsCollectionRef.current =
				editor.createDecorationsCollection(newDecorations);
		}
	};

	const resolveConflict = (
		blockIndex: number,
		side: "ours" | "theirs" | "both",
	) => {
		const editor = editorRef.current;
		if (!editor) return;
		const model = editor.getModel();
		if (!model) return;

		const conflicts = parseConflicts(model);
		const block = conflicts[blockIndex];
		if (!block) return;

		let resolvedText = "";
		if (side === "ours") {
			resolvedText = block.oursText;
		} else if (side === "theirs") {
			resolvedText = block.theirsText;
		} else {
			resolvedText =
				block.oursText +
				(block.oursText && block.theirsText ? "\n" : "") +
				block.theirsText;
		}

		editor.executeEdits("merge-conflict-resolver", [
			{
				range: block.fullRange,
				text: resolvedText,
				forceMoveMarkers: true,
			},
		]);
	};

	const handleAcceptAll = (side: "ours" | "theirs" | "both") => {
		const editor = editorRef.current;
		if (!editor) return;
		const model = editor.getModel();
		if (!model) return;

    const conflicts = parseConflicts(model);
    // Apply edits in reverse order to ensure line shifting doesn't disrupt ranges
    const edits = conflicts.map((block) => {
      let resolvedText = "";
      if (side === "ours") {
        resolvedText = block.oursText;
      } else if (side === "theirs") {
        resolvedText = block.theirsText;
      } else {
        resolvedText = block.oursText + (block.oursText && block.theirsText ? "\n" : "") + block.theirsText;
      }

			return {
				range: block.fullRange,
				text: resolvedText,
				forceMoveMarkers: true,
			};
		});

		editor.executeEdits("merge-conflict-resolver-all", edits);
	};

	const handleStage = async () => {
		await stage([path]);
	};

	const handleMount: OnMount = (editor, monacoInstance) => {
		editorRef.current = editor;
		monacoRef.current = monacoInstance;

		// Register CodeLens Command Handlers
		const cmdOursId = editor.addCommand(0, (_, blockIndex: number) => {
			resolveConflict(blockIndex, "ours");
		});
		const cmdTheirsId = editor.addCommand(0, (_, blockIndex: number) => {
			resolveConflict(blockIndex, "theirs");
		});
		const cmdBothId = editor.addCommand(0, (_, blockIndex: number) => {
			resolveConflict(blockIndex, "both");
		});

		const model = editor.getModel();
		if (model) {
			updateDecorations(editor, monacoInstance);

      // Register CodeLens Provider for this model URI
      providerRef.current = monacoInstance.languages.registerCodeLensProvider(
        getLanguageFromPath(path),
        {
          provideCodeLenses: (m: monaco.editor.ITextModel) => {
            if (m.uri.toString() !== model.uri.toString()) return;
            const conflicts = parseConflicts(m);
            const lenses: monaco.languages.CodeLens[] = [];

						conflicts.forEach((conflict, index) => {
							lenses.push({
								range: new monacoInstance.Range(
									conflict.startLine,
									1,
									conflict.startLine,
									1,
								),
								command: {
									id: cmdOursId!,
									title: "Accept Ours",
									arguments: [index],
								},
							});
							lenses.push({
								range: new monacoInstance.Range(
									conflict.startLine,
									1,
									conflict.startLine,
									1,
								),
								command: {
									id: cmdTheirsId!,
									title: "Accept Theirs",
									arguments: [index],
								},
							});
							lenses.push({
								range: new monacoInstance.Range(
									conflict.startLine,
									1,
									conflict.startLine,
									1,
								),
								command: {
									id: cmdBothId!,
									title: "Accept Both",
									arguments: [index],
								},
							});
						});

						return { lenses, dispose: () => {} };
					},
				},
			);
		}
	};

	const handleEditorChange = (value: string | undefined) => {
		if (value === undefined) return;
		setCurrentContent(value);

		// Auto-save changes to disk
		writeFile(path, value).catch(console.error);

		// Refresh visual decorations collection
		if (editorRef.current && monacoRef.current) {
			updateDecorations(editorRef.current, monacoRef.current);
		}
	};

	const conflictCount = (currentContent.match(/<<<<<<< /g) || []).length;

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
				Loading merge conflict resolver…
			</div>
		);
	}

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 bg-muted/20">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-500">
          <AlertCircle className="size-4" />
          Conflict Resolver
          <Badge variant="destructive" className="text-[10px] h-4 px-1.5 font-bold">
            {conflictCount} Remaining
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleAcceptAll("ours")}
            disabled={conflictCount === 0}
            className="h-6 text-[11px]"
          >
            Accept All Ours
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleAcceptAll("theirs")}
            disabled={conflictCount === 0}
            className="h-6 text-[11px]"
          >
            Accept All Theirs
          </Button>
          <Button
            size="xs"
            onClick={handleStage}
            disabled={conflictCount > 0}
            className="h-6 text-[11px]"
          >
            <Check className="mr-1 size-3" />
            Mark Resolved
          </Button>
        </div>
      </div>
      <div ref={conflictContainerRef} className="flex-1 min-h-0 relative">
        {containerReady ? (
          <Editor
            path={path}
            defaultLanguage={getLanguageFromPath(path)}
            defaultValue={initialContent}
            theme={ThemeService.toMonacoThemeId(theme)}
            onMount={handleMount}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              glyphMargin: true,
              folding: true,
              smoothScrolling: true,
              automaticLayout: true,
              fixedOverflowWidgets: true,
              codeLens: true,
            }}
            loading={
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                Loading editor…
              </div>
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Loading editor…
          </div>
        )}
      </div>
    </div>
  );
}
