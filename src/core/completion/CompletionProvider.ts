import type { editor, languages, Position, CancellationToken } from "monaco-editor";
import { CompletionEngine } from "./CompletionEngine";

export function createCompletionProvider(engine: CompletionEngine): languages.CompletionItemProvider {
  return {
    triggerCharacters: [".", "<", "/", "\"", "'"],
    provideCompletionItems: async (
      model: editor.ITextModel,
      position: Position,
      context: languages.CompletionContext,
      token: CancellationToken,
    ) => {
      return engine.provideCompletionItems(model, position, context, token);
    },
  };
}
