import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";
import type { LspClient } from "../lib/lsp/client";

const MONACO_KINDS: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9,
  11: 10, 12: 11, 13: 12, 14: 13, 15: 14, 16: 15, 17: 16, 18: 17,
  19: 18, 20: 19, 21: 20, 22: 21, 23: 22, 24: 23, 25: 24,
};

export class LspCompletionProvider implements CompletionProvider {
  id = "lsp";
  private client: LspClient;

  constructor(client: LspClient) {
    this.client = client;
  }

  canProvide(context: ProviderContext): boolean {
    return true; // LSP can always be queried
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    try {
      // Build a Monaco-compatible position for the LSP client
      const position = {
        lineNumber: context.position.lineNumber,
        column: context.position.column,
      };

      const result = await this.client.requestCompletions(context.uri, position);
      if (!result || !result.items) return [];

      return result.items.map((item: any) => ({
        label: item.label,
        kind: MONACO_KINDS[item.kind] ?? 0,
        detail: item.detail,
        documentation: typeof item.documentation === "string"
          ? item.documentation
          : (item.documentation?.value ?? ""),
        insertText: item.insertText ?? item.label,
        source: "lsp",
        score: 0,
      }));
    } catch (err) {
      console.warn("[LspCompletionProvider] LSP request failed:", err);
      return [];
    }
  }
}
