import * as monaco from "monaco-editor";
import { CompletionEngine } from "./CompletionEngine";
import { createCompletionProvider } from "./CompletionProvider";
import { LspCompletionProvider } from "../../providers/LspCompletionProvider";
import { KeywordProvider } from "../../providers/KeywordProvider";
import { WorkspaceCompletionProvider } from "../../providers/WorkspaceCompletionProvider";
import { SnippetProvider } from "../../providers/SnippetProvider";
import { PathProvider } from "../../providers/PathProvider";
import type { LspClient } from "../../lib/lsp/client";

let engine: CompletionEngine | null = null;

/**
 * Initialize the completion system with all non-LSP providers
 * and register with Monaco for all languages.
 */
export function initCompletionSystem(): CompletionEngine {
  if (engine) return engine;

  engine = new CompletionEngine();

  // Register non-LSP providers
  engine.providerManager.register(new KeywordProvider());
  engine.providerManager.register(new WorkspaceCompletionProvider());
  engine.providerManager.register(new SnippetProvider());
  engine.providerManager.register(new PathProvider());

  // Register Monaco provider for all languages
  registerMonacoProvider(engine);

  return engine;
}

/** Register a new LSP client with the completion engine. */
export function registerLspClient(client: LspClient): void {
  if (!engine) return;
  engine.providerManager.register(new LspCompletionProvider(client));
}

/** Get the shared completion engine instance. */
export function getCompletionEngine(): CompletionEngine | null {
  return engine;
}

function registerMonacoProvider(eng: CompletionEngine): void {
  // Empty LanguageSelector matches all languages
  monaco.languages.registerCompletionItemProvider(
    [] as any,
    createCompletionProvider(eng),
  );
}
