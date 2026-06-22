import { LspTransport } from "./transport";
import { createRequest, createNotification } from "./jsonrpc";
import type {
	JsonRpcMessage,
	Position,
	CompletionList,
	Hover,
	Location,
	SignatureHelp,
	ServerCapabilities,
	LspConfig,
	Diagnostic,
	DocumentHighlight,
	WorkspaceEdit,
	FormattingOptions,
	TextEdit,
	ColorInformation,
	ColorPresentation,
	FoldingRange,
} from "./types";

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT = 10000;

function posToLsp(pos: { lineNumber: number; column: number }): Position {
	return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

export class LspClient {
	private transport = new LspTransport();
	private pending = new Map<number, PendingRequest>();
	private capabilities: ServerCapabilities = {};
	private onDiagnostics:
		| ((uri: string, diagnostics: Diagnostic[]) => void)
		| null = null;
	private config: LspConfig;
	private started = false;

	constructor(config: LspConfig) {
		this.config = config;
	}

	setDiagnosticsHandler(
		handler: (uri: string, diagnostics: Diagnostic[]) => void,
	): void {
		this.onDiagnostics = handler;
	}

	getCapabilities(): ServerCapabilities {
		return this.capabilities;
	}

	async start(): Promise<void> {
		if (this.started) return;
		this.started = true;
		await this.transport.spawn(this.config.binaryPath, this.config.args);
		this.transport.on({
			onMessage: (msg) => this.handleMessage(msg),
			onExit: () => {},
		});
		await this.initialize();
	}

	private handleMessage(msg: JsonRpcMessage): void {
		if (msg.id != null && typeof msg.id === "number") {
			const pending = this.pending.get(msg.id);
			if (pending) {
				clearTimeout(pending.timer);
				this.pending.delete(msg.id);
				if (msg.error) {
					pending.reject(new Error(msg.error.message));
				} else {
					pending.resolve(msg.result);
				}
			}
			return;
		}
		if (msg.method === "textDocument/publishDiagnostics") {
			const params = msg.params as { uri: string; diagnostics: Diagnostic[] };
			this.onDiagnostics?.(params.uri, params.diagnostics);
		}
	}

	private request(method: string, params?: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const req = createRequest(method, params);
			const timer = setTimeout(() => {
				this.pending.delete(req.id);
				reject(new Error(`LSP request timed out: ${method}`));
			}, REQUEST_TIMEOUT);
			this.pending.set(req.id, { resolve, reject, timer });
			this.transport.send(req);
		});
	}

	private async initialize(): Promise<void> {
		const result = (await this.request("initialize", {
			processId: null,
			rootUri: null,
			capabilities: {},
		})) as { capabilities?: ServerCapabilities };
		this.capabilities = result?.capabilities ?? {};
		this.transport.send(createNotification("initialized"));
	}

	async openDocument(
		uri: string,
		text: string,
		version: number,
		languageId = "python",
	): Promise<void> {
		this.transport.send(
			createNotification("textDocument/didOpen", {
				textDocument: { uri, languageId, version, text },
			}),
		);
	}

	async changeDocument(
		uri: string,
		text: string,
		version: number,
	): Promise<void> {
		this.transport.send(
			createNotification("textDocument/didChange", {
				textDocument: { uri, version },
				contentChanges: [{ text }],
			}),
		);
	}

	async closeDocument(uri: string): Promise<void> {
		this.transport.send(
			createNotification("textDocument/didClose", {
				textDocument: { uri },
			}),
		);
	}

	async requestCompletions(
		uri: string,
		position: { lineNumber: number; column: number },
	): Promise<CompletionList | null> {
		if (!this.capabilities.completionProvider) return null;
		const result = await this.request("textDocument/completion", {
			textDocument: { uri },
			position: posToLsp(position),
			context: { triggerKind: 1 },
		});
		if (!result) return null;
		const items = result as CompletionList | import("./types").CompletionItem[];
		return Array.isArray(items) ? { isIncomplete: false, items } : items;
	}

	async requestHover(
		uri: string,
		position: { lineNumber: number; column: number },
	): Promise<Hover | null> {
		if (!this.capabilities.hoverProvider) return null;
		return this.request("textDocument/hover", {
			textDocument: { uri },
			position: posToLsp(position),
		}) as Promise<Hover | null>;
	}

	async requestDefinition(
		uri: string,
		position: { lineNumber: number; column: number },
	): Promise<Location | Location[] | null> {
		if (!this.capabilities.definitionProvider) return null;
		return this.request("textDocument/definition", {
			textDocument: { uri },
			position: posToLsp(position),
		}) as Promise<Location | Location[] | null>;
	}

	async requestSignatureHelp(
		uri: string,
		position: { lineNumber: number; column: number },
	): Promise<SignatureHelp | null> {
		if (!this.capabilities.signatureHelpProvider) return null;
		return this.request("textDocument/signatureHelp", {
			textDocument: { uri },
			position: posToLsp(position),
		}) as Promise<SignatureHelp | null>;
	}

	async requestCodeActions(
		uri: string,
		range: {
			startLineNumber: number;
			startColumn: number;
			endLineNumber: number;
			endColumn: number;
		},
		context: { diagnostics: Diagnostic[] },
	): Promise<import("./types").CodeAction[] | null> {
		if (!this.capabilities.codeActionProvider) return null;
		return this.request("textDocument/codeAction", {
			textDocument: { uri },
			range: {
				start: {
					line: range.startLineNumber - 1,
					character: range.startColumn - 1,
				},
				end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
			},
			context,
		}) as Promise<import("./types").CodeAction[] | null>;
	}

	// ── Tier 1 (already added but some may have been lost) ──

	async requestDocumentHighlight(
		uri: string,
		position: { lineNumber: number; column: number },
	): Promise<DocumentHighlight[] | null> {
		if (!this.capabilities.documentHighlightProvider) return null;
		return this.request("textDocument/documentHighlight", {
			textDocument: { uri },
			position: posToLsp(position),
		}) as Promise<DocumentHighlight[] | null>;
	}

	async requestReferences(
		uri: string,
		position: { lineNumber: number; column: number },
	): Promise<Location[] | null> {
		if (!this.capabilities.referencesProvider) return null;
		return this.request("textDocument/references", {
			textDocument: { uri },
			position: posToLsp(position),
			context: { includeDeclaration: true },
		}) as Promise<Location[] | null>;
	}

	async requestRename(
		uri: string,
		position: { lineNumber: number; column: number },
		newName: string,
	): Promise<WorkspaceEdit | null> {
		if (!this.capabilities.renameProvider) return null;
		return this.request("textDocument/rename", {
			textDocument: { uri },
			position: posToLsp(position),
			newName,
		}) as Promise<WorkspaceEdit | null>;
	}

	async requestFormatting(
		uri: string,
		options?: FormattingOptions,
	): Promise<TextEdit[] | null> {
		if (!this.capabilities.documentFormattingProvider) return null;
		return this.request("textDocument/formatting", {
			textDocument: { uri },
			options: options ?? { tabSize: 4, insertSpaces: true },
		}) as Promise<TextEdit[] | null>;
	}

	// ── Tier 2 ──

	async requestDocumentColors(uri: string): Promise<ColorInformation[] | null> {
		if (!this.capabilities.colorProvider) return null;
		return this.request("textDocument/documentColor", {
			textDocument: { uri },
		}) as Promise<ColorInformation[] | null>;
	}

	async requestColorPresentations(
		uri: string,
		color: { red: number; green: number; blue: number; alpha: number },
		range: {
			startLineNumber: number;
			startColumn: number;
			endLineNumber: number;
			endColumn: number;
		},
	): Promise<ColorPresentation[] | null> {
		if (!this.capabilities.colorProvider) return null;
		return this.request("textDocument/colorPresentation", {
			textDocument: { uri },
			color,
			range: {
				start: {
					line: range.startLineNumber - 1,
					character: range.startColumn - 1,
				},
				end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
			},
		}) as Promise<ColorPresentation[] | null>;
	}

	async requestFoldingRanges(uri: string): Promise<FoldingRange[] | null> {
		if (!this.capabilities.foldingRangeProvider) return null;
		return this.request("textDocument/foldingRange", {
			textDocument: { uri },
		}) as Promise<FoldingRange[] | null>;
	}

	async requestImplementation(
		uri: string,
		position: { lineNumber: number; column: number },
	): Promise<Location | Location[] | null> {
		if (!this.capabilities.implementationProvider) return null;
		return this.request("textDocument/implementation", {
			textDocument: { uri },
			position: posToLsp(position),
		}) as Promise<Location | Location[] | null>;
	}

	async shutdown(): Promise<void> {
		try {
			await this.request("shutdown");
		} catch {
			/* server may have already exited */
		}
		this.transport.send(createNotification("exit"));
		this.transport.kill();
	}
}
