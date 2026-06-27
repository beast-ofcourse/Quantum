import type { editor, Position } from "monaco-editor";
import type { ProviderContext } from "./types";

export class ContextAnalyzer {
  /**
   * Build a ProviderContext from Monaco editor state.
   * This is called from the CompletionProvider Monaco handler.
   */
  analyze(
    model: editor.ITextModel,
    position: Position,
    triggerChar: string | null,
    manual: boolean,
  ): ProviderContext {
    const text = model.getValue();
    const uri = model.uri.toString();
    const language = model.getLanguageId();

    // Extract the word being typed (before cursor)
    const word = model.getWordUntilPosition(position);
    const prefix = word?.word ?? "";

    return {
      text,
      position,
      prefix,
      triggerChar,
      uri,
      language,
      manual,
    };
  }
}
