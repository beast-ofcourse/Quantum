import { useRef, useMemo, useEffect, useState } from "react";
import Editor, { type OnMount, loader } from "@monaco-editor/react";
import * as monaco from "@/lib/monaco-entry";
import { AlertTriangle } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { setupMonaco } from "@/lib/monaco-setup";
import { ThemeService } from "@/lib/themeService";
import { getLanguageFromPath } from "@/lib/languages";
import { setMonacoEditor } from "@/extensions/editorRef";
import { initDiagnostics } from "@/stores/diagnosticStore";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useGitGutterDecorations } from "@/hooks/useGitGutterDecorations";
import { useGitBlameDecorations } from "@/hooks/useGitBlameDecorations";
import { registerDefinitionProvider } from "@/lib/definitionProvider";
import { registerCodeLensProvider } from "@/lib/codeLensProvider";
import { registerLanguageCompletions } from "@/lib/languageCompletions";
import { registerHoverProvider } from "@/lib/hoverProvider";
import { ContentStore } from "@/lib/contentStore";

loader.config({ monaco });
setupMonaco();

interface MonacoEditorProps {
	tabId: string;
	path: string;
	language: string;
	value: string;
}

export function MonacoEditor({
	tabId,
	path,
	language,
	value,
}: MonacoEditorProps) {
	const theme = useUiStore((s) => s.theme);
	const settings = useSettingsStore();
	const updateContent = useEditorStore((s) => s.updateContent);
	const setCursor = useEditorStore((s) => s.setCursor);
	const monacoRef = useRef<typeof monaco | null>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const isLargeFile = useEditorStore((s) => {
		const t = s.openTabs.find((x) => x.id === tabId);
		return t?.isLargeFile ?? false;
	});

	useAutoSave(tabId);
	useGitGutterDecorations(path);
	const [showBlame, setShowBlame] = useState(false);
	useGitBlameDecorations(path, showBlame);

	// Resolve effective content — large files bypass Zustand via ContentStore
	const effectiveValue = isLargeFile
		? (ContentStore.get(path) ?? value)
		: value;

	// Sync external content changes to Monaco model
	useEffect(() => {
		const model = monacoRef.current?.editor.getModel(monaco.Uri.file(path));
		if (model && editorRef.current && model.getValue() !== effectiveValue) {
			model.setValue(effectiveValue);
		}
	}, [effectiveValue, path]);

	const editorOptions =
		useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(
			() => ({
				fontFamily: settings.editor.fontFamily,
				fontSize: settings.editor.fontSize,
				fontLigatures: true,
				lineHeight: Math.round(settings.editor.fontSize * 1.5),
				tabSize: settings.editor.tabSize,
				insertSpaces: true,
				wordWrap: settings.editor.wordWrap,
				minimap: {
					enabled: settings.editor.minimap,
					scale: settings.editor.minimapScale,
					renderCharacters: false,
					maxColumn: 120,
				},
				lineNumbers: settings.editor.lineNumbers,
				glyphMargin: true,
				folding: true,
				renderLineHighlight: "all",
				scrollBeyondLastLine: false,
				smoothScrolling: true,
				cursorBlinking: "smooth",
				cursorSmoothCaretAnimation: "on",
				automaticLayout: true,
				fixedOverflowWidgets: true,
				bracketPairColorization: { enabled: true },
				inlayHints: { enabled: settings.editor.inlayHints ? "on" : "off" },
				definitionLinkOpensInPeek: true,
				gotoLocation: {
					mouseRight: "peek",
					multiple: "peek",
					multipleDefinitions: "peek",
				},
				padding: { top: 8, bottom: 8 },
				scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
				stickyScroll: { enabled: true },
				links: true,
				breadcrumbs: { enabled: settings.editor.breadcrumbs },
			}),
			[settings.editor],
		);

	const handleMount: OnMount = (editor, monacoInstance) => {
		monacoRef.current = monacoInstance;
		editorRef.current = editor;
		setMonacoEditor(editor, monacoInstance);
		editor.onDidChangeCursorPosition((e) => {
			setCursor(tabId, e.position.lineNumber, e.position.column);
		});
		initDiagnostics();
		registerDefinitionProvider();
		registerCodeLensProvider(monacoInstance);
		registerLanguageCompletions();
		registerHoverProvider();

		// Intercept global keybindings inside Monaco and forward them to the window context
		editor.onKeyDown((e) => {
			const isMod = e.ctrlKey || e.metaKey;
			const key = e.browserEvent.key.toLowerCase();
			const isShift = e.shiftKey;
			const isAlt = e.altKey;

			const shouldForward =
				(isMod && key === "p") ||            // Ctrl+P / Ctrl+Shift+P (Quick Open)
				(isMod && key === "b") ||            // Ctrl+B (Toggle Sidebar)
				(isMod && key === ",") ||            // Ctrl+, (Settings)
				(isMod && key === "`") ||            // Ctrl+` (Terminal)
				(isMod && key === "f" && isShift) ||   // Ctrl+Shift+F (Global Search)
				(isMod && key === "e" && isShift) ||   // Ctrl+Shift+E (Focus Explorer)
				(isMod && key === "g" && isShift) ||   // Ctrl+Shift+G (Focus Source Control)
				(isMod && key === "d" && isShift) ||   // Ctrl+Shift+D (Focus Debugger)
				(isMod && key === "o") ||            // Ctrl+O (Open File)
				(isMod && key === "s") ||            // Ctrl+S (Save File)
				(isMod && key === "w") ||            // Ctrl+W (Close Tab)
				(isMod && key === "\\") ||           // Ctrl+\ (Split Editor)
				(isMod && key === "tab") ||          // Ctrl+Tab (Cycle Tabs)
				(key === "alt") ||                   // Alt (Toggle Menu Bar)
				(key === "f5") ||                    // F5 / Shift+F5 / Ctrl+F5 (Debugging)
				(isAlt && e.browserEvent.ctrlKey && key === "k"); // Ctrl+Alt+K (Shortcuts)

			if (shouldForward) {
				e.preventDefault();
				e.stopPropagation();

				const clone = new KeyboardEvent("keydown", {
					key: e.browserEvent.key,
					code: e.browserEvent.code,
					ctrlKey: e.browserEvent.ctrlKey,
					metaKey: e.browserEvent.metaKey,
					shiftKey: e.browserEvent.shiftKey,
					altKey: e.browserEvent.altKey,
					bubbles: true,
				});
				window.dispatchEvent(clone);
			}
		});

		// 1. Format Document (custom entry mapping to built-in command)
		editor.addAction({
			id: "editor.action.formatDocument.custom",
			label: "Format Document",
			contextMenuGroupId: "1_modification",
			contextMenuOrder: 1.5,
			run: () => {
				editor.getAction("editor.action.formatDocument")?.run();
			},
		});

		// 2. Run Active File (fires F5 global debug run)
		editor.addAction({
			id: "editor.action.runActiveFile",
			label: "Run Active File",
			contextMenuGroupId: "navigation",
			contextMenuOrder: 2,
			run: () => {
				const clone = new KeyboardEvent("keydown", {
					key: "F5",
					code: "F5",
					bubbles: true,
				});
				window.dispatchEvent(clone);
			},
		});

		// 3. Toggle Git Blame Annotations (integrated with context menu)
		editor.addAction({
			id: "editor.toggleBlame",
			label: "Toggle Git Blame Annotations",
			keybindings: [
				monacoInstance.KeyMod.CtrlCmd |
					monacoInstance.KeyMod.Shift |
					monacoInstance.KeyCode.KeyB,
			],
			contextMenuGroupId: "navigation",
			contextMenuOrder: 3,
			run: () => setShowBlame((prev) => !prev),
		});
	};

	const contentLen = isLargeFile
		? (ContentStore.get(path)?.length ?? 0)
		: value.length;
	const fileSizeLabel =
		contentLen > 1_000_000
			? `${(contentLen / 1_000_000).toFixed(1)}MB`
			: `${(contentLen / 1000).toFixed(0)}KB`;

	return (
		<div className="flex h-full w-full flex-col">
			{isLargeFile && (
				<div className="flex items-center gap-2 border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-1.5 text-xs text-yellow-600 dark:text-yellow-400">
					<AlertTriangle className="size-3.5 shrink-0" />
					<span>
						Large file ({fileSizeLabel}) — editor performance may be degraded
					</span>
				</div>
			)}
			<div className="min-h-0 flex-1">
				<Editor
					key={tabId}
					path={path}
					defaultLanguage={language || getLanguageFromPath(path)}
					defaultValue={effectiveValue}
					theme={ThemeService.toMonacoThemeId(theme)}
					onMount={handleMount}
					onChange={(v) => updateContent(tabId, v ?? "")}
					options={editorOptions}
					loading={
						<div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
							Loading editor…
						</div>
					}
				/>
			</div>
		</div>
	);
}
