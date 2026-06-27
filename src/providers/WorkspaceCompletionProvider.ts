import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";

interface WorkspaceSymbol {
  name: string;
  kind: number;
  file: string;
}

const DECL_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /export\s+(?:default\s+)?(?:function|class|interface|type|enum|const|let|var)\s+(\w+)/g,
    /(?:function|class)\s+(\w+)/g,
    /(\w+)\s*[:=]\s*(?:function|\([^)]*\)\s*=>)/g,
  ],
  javascript: [
    /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
    /(?:function|class)\s+(\w+)/g,
  ],
  python: [
    /(?:def|class)\s+(\w+)/g,
    /(\w+)\s*=\s*(?:lambda|\(|\[)/g,
  ],
};

export class WorkspaceCompletionProvider implements CompletionProvider {
  id = "workspace";

  /** In v1, scan open models for symbols. In future, use a persisted index. */
  private getSymbols(context: ProviderContext): WorkspaceSymbol[] {
    const patterns = DECL_PATTERNS[context.language];
    if (!patterns) return [];

    const symbols: WorkspaceSymbol[] = [];
    const lines = context.text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 5, // Variable
            file: context.uri,
          });
        }
      }
    }

    return symbols;
  }

  canProvide(context: ProviderContext): boolean {
    return context.prefix.length >= 1;
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    const symbols = this.getSymbols(context);
    return symbols.map((s) => ({
      label: s.name,
      kind: s.kind as any,
      detail: `workspace symbol — ${s.file.split("/").pop()}`,
      insertText: s.name,
      source: "workspace",
      score: 2, // slightly boosted — local project symbols are relevant
    }));
  }
}
