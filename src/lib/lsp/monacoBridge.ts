import type { LspClient } from "./client";
import type { Diagnostic } from "./types";

function rangeFromLsp(r: {
	start: { line: number; character: number };
	end: { line: number; character: number };
}) {
	return {
		startLineNumber: r.start.line + 1,
		startColumn: r.start.character + 1,
		endLineNumber: r.end.line + 1,
		endColumn: r.end.character + 1,
	};
}

const completionKindMap: Record<number, number> = {
	1: 0, // Text
	2: 1, // Method
	3: 2, // Function
	4: 3, // Constructor
	5: 4, // Field
	6: 5, // Variable
	7: 6, // Class
	8: 7, // Interface
	9: 8, // Module
	10: 9, // Property
	11: 10, // Unit
	12: 11, // Value
	13: 12, // Enum
	14: 13, // Keyword
	15: 14, // Snippet
	16: 15, // Color
	17: 16, // File
	18: 17, // Reference
	19: 18, // Folder
	20: 19, // EnumMember
	21: 20, // Constant
	22: 21, // Struct
	23: 22, // Event
	24: 23, // Operator
	25: 24, // TypeParameter
};

export class MonacoBridge {
	private disposables: { dispose(): void }[] = [];
	private monaco: any;

	constructor(
		monaco: any,
		private client: LspClient,
		private languageId: string,
	) {
		this.monaco = monaco;
	}

	register(): void {
		this.client.setDiagnosticsHandler(
			(uri: string, diagnostics: Diagnostic[]) => {
				const { editor, MarkerSeverity } = this.monaco;
				const models = editor.getModels();
				const model = models.find((m: any) => m.uri.toString() === uri);
				if (model) {
					editor.setModelMarkers(
						model,
						this.languageId,
						diagnostics.map((d) => ({
							severity:
								d.severity === 1
									? MarkerSeverity.Error
									: d.severity === 2
										? MarkerSeverity.Warning
										: MarkerSeverity.Info,
							message: d.message,
							...rangeFromLsp(d.range),
						})),
					);
				}
			},
		);

		const monaco = this.monaco;
		const { CompletionItemKind } = monaco.languages;
		const getId = (kindId: number) =>
			completionKindMap[kindId] ?? CompletionItemKind.Text;

		this.disposables.push(
			monaco.languages.registerCompletionItemProvider(this.languageId, {
				triggerCharacters: [".", "(", ","],
				provideCompletionItems: async (model: any, position: any) => {
					const result = await this.client.requestCompletions(
						model.uri.toString(),
						position,
					);
					if (!result) return undefined;
					// Range is required - use current position as fallback
					const word = model.getWordUntilPosition(position);
					const range = {
						startLineNumber: position.lineNumber,
						endLineNumber: position.lineNumber,
						startColumn: word.startColumn,
						endColumn: word.endColumn,
					};
					return {
						suggestions: result.items.map((item: any) => ({
							label: item.label,
							kind: getId(item.kind),
							detail: item.detail,
							documentation:
								typeof item.documentation === "string"
									? item.documentation
									: (item.documentation?.value ?? ""),
							insertText: item.insertText ?? item.label,
							range,
						})),
					};
				},
			}),
		);

		this.disposables.push(
			monaco.languages.registerHoverProvider(this.languageId, {
				provideHover: async (model: any, position: any) => {
					const result = await this.client.requestHover(
						model.uri.toString(),
						position,
					);
					if (!result) return undefined;
					return {
						contents: [
							{
								value:
									typeof result.contents === "string"
										? result.contents
										: result.contents.value,
								language: this.languageId,
							},
						],
						range: result.range ? rangeFromLsp(result.range) : undefined,
					};
				},
			}),
		);

		this.disposables.push(
			monaco.languages.registerDefinitionProvider(this.languageId, {
				provideDefinition: async (model: any, position: any) => {
					const result = await this.client.requestDefinition(
						model.uri.toString(),
						position,
					);
					if (!result) return undefined;
					const locs = Array.isArray(result) ? result : [result];
					return locs.map((loc: any) => ({
						uri: monaco.Uri.parse(loc.uri),
						range: rangeFromLsp(loc.range),
					}));
				},
			}),
		);

		this.disposables.push(
			monaco.languages.registerSignatureHelpProvider(this.languageId, {
				signatureHelpTriggerCharacters: ["(", ","],
				provideSignatureHelp: async (model: any, position: any) => {
					const result = await this.client.requestSignatureHelp(
						model.uri.toString(),
						position,
					);
					if (!result) return undefined;
					return {
						value: {
							activeSignature: result.activeSignature ?? 0,
							activeParameter: result.activeParameter ?? 0,
							signatures: result.signatures.map((sig: any) => ({
								label: sig.label,
								documentation:
									typeof sig.documentation === "string"
										? sig.documentation
										: (sig.documentation?.value ?? ""),
								parameters:
									sig.parameters?.map((p: any) => ({
										label: p.label,
										documentation: p.documentation,
									})) ?? [],
							})),
						},
						dispose: () => {},
					};
				},
			}),
		);

		this.disposables.push(
			monaco.languages.registerCodeActionProvider(this.languageId, {
				provideCodeActions: async (model: any, range: any, context: any) => {
					const uri = model.uri.toString();
					const result = await this.client.requestCodeActions(
						uri,
						range,
						context,
					);
					if (!result || result.length === 0) return undefined;
					return {
						actions: result.map((action: any) => ({
							title: action.title,
							kind: action.kind,
							diagnostics: action.diagnostics,
							edit: action.edit,
							command: action.command,
						})),
					};
				},
			}),
		);

		// ponytail: inline completions hook ready for AI provider (Copilot-like).
		// Returns no ghosts by default. Plug in an external AI client to populate items.
		this.disposables.push(
			monaco.languages.registerInlineCompletionsProvider(this.languageId, {
				provideInlineCompletions: async () => {
					return { items: [] };
				},
				freeInlineCompletions: () => {},
			}),
		);
	}

	dispose(): void {
		for (const d of this.disposables) d.dispose();
		this.disposables = [];
	}
}
