export interface Position {
	line: number;
	character: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export interface Location {
	uri: string;
	range: Range;
}

export interface Diagnostic {
	range: Range;
	severity?: number;
	message: string;
}

export interface CompletionItem {
	label: string;
	kind?: number;
	detail?: string;
	documentation?: string | { kind: string; value: string };
	insertText?: string;
}

export interface CompletionList {
	isIncomplete: boolean;
	items: CompletionItem[];
}

export interface Hover {
	contents: string | { kind: string; value: string };
	range?: Range;
}

export interface SignatureInformation {
	label: string;
	documentation?: string | { kind: string; value: string };
	parameters?: { label: string; documentation?: string }[];
}

export interface SignatureHelp {
	signatures: SignatureInformation[];
	activeSignature?: number;
	activeParameter?: number;
}

export interface CodeAction {
	title: string;
	kind?: string;
	diagnostics?: Diagnostic[];
	edit?: {
		changes: Record<string, TextEdit[]>;
	};
	command?: {
		title: string;
		command: string;
		arguments?: unknown[];
	};
}

export interface TextEdit {
	range: Range;
	newText: string;
}

export interface CodeActionContext {
	diagnostics: Diagnostic[];
	only?: string[];
}

export interface ServerCapabilities {
	textDocumentSync?: number;
	completionProvider?: { triggerCharacters?: string[] };
	hoverProvider?: boolean;
	definitionProvider?: boolean;
	signatureHelpProvider?: { triggerCharacters?: string[] };
	codeActionProvider?: boolean | { codeActionKinds?: string[] };
}

export interface LspConfig {
	binaryPath: string;
	args: string[];
	initializeOptions?: Record<string, unknown>;
}

export interface JsonRpcMessage {
	id?: number;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string };
}

export const Methods = {
	Initialize: "initialize",
	Initialized: "initialized",
	Shutdown: "shutdown",
	Exit: "exit",
	DidOpen: "textDocument/didOpen",
	DidChange: "textDocument/didChange",
	DidClose: "textDocument/didClose",
	Completion: "textDocument/completion",
	Hover: "textDocument/hover",
	Definition: "textDocument/definition",
	SignatureHelp: "textDocument/signatureHelp",
	PublishDiagnostics: "textDocument/publishDiagnostics",
} as const;
