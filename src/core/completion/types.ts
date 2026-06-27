import type { languages, Position } from "monaco-editor";

/** Monaco editor IRange shape — used instead of importing editor namespace. */
export interface IRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** Raw completion result from a single provider. */
export interface CompletionItem {
  label: string;
  kind: languages.CompletionItemKind;
  detail?: string;
  documentation?: string | { value: string; isTrusted?: boolean };
  insertText?: string;
  sortText?: string;
  filterText?: string;
  range?: IRange;
  /** Provider-specific metadata for ranking. */
  source: string;
  /** Boost factor applied by provider (1.0 = neutral). */
  score: number;
}

/** Context passed to every provider. */
export interface ProviderContext {
  /** Full model text up to cursor. */
  text: string;
  /** Cursor position in Monaco coordinates. */
  position: Position;
  /** Current word being typed. */
  prefix: string;
  /** Trigger character that started completion, if any. */
  triggerChar: string | null;
  /** URI of the current file. */
  uri: string;
  /** Language ID (typescript, python, rust, etc.). */
  language: string;
  /** Whether Ctrl+Space was pressed (manual trigger). */
  manual: boolean;
}

/** A provider that returns completions for a given context. */
export interface CompletionProvider {
  /** Unique provider ID used for debugging and logging. */
  id: string;
  /** Check if this provider can handle the current context (fast check). */
  canProvide(context: ProviderContext): boolean;
  /** Return completions. Can be async. */
  provide(context: ProviderContext): Promise<CompletionItem[]>;
}

/** A ranked item after scoring and sorting. */
export interface RankedItem {
  item: CompletionItem;
  fuzzyScore: number;
  contextScore: number;
  finalScore: number;
}

/** Trigger type for categorizing completion sessions. */
export type TriggerKind = "letter" | "dot" | "angle" | "quote" | "slash" | "manual";
