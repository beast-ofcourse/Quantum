import type { editor, languages, Position, CancellationToken } from "monaco-editor";
import { ContextAnalyzer } from "./ContextAnalyzer";
import { ProviderManager } from "./ProviderManager";
import { TriggerManager } from "./TriggerManager";
import { RankingEngine } from "./RankingEngine";
import { CacheManager } from "./CacheManager";
import { CompletionStore } from "./CompletionStore";

export class CompletionEngine {
  providerManager = new ProviderManager();
  triggerManager = new TriggerManager();
  rankingEngine = new RankingEngine();
  cacheManager = new CacheManager();
  contextAnalyzer = new ContextAnalyzer();
  store = new CompletionStore();

  /**
   * Monaco CompletionItemProvider handler.
   * This is the single entry point registered with monaco.languages.registerCompletionItemProvider.
   */
  async provideCompletionItems(
    model: editor.ITextModel,
    position: Position,
    context: languages.CompletionContext,
    token: CancellationToken,
  ): Promise<languages.CompletionList | undefined> {
    // 1. Analyze context
    const ctx = this.contextAnalyzer.analyze(
      model, position, context.triggerCharacter ?? null, context.triggerKind === 0 /* Invoke */,
    );

    // 2. Determine which providers to invoke
    const activeIds = this.triggerManager.getActiveProviderIds(ctx);

    // 3. Invoke providers in parallel
    const items = await this.providerManager.invokeProviders(activeIds, ctx);
    if (token.isCancellationRequested) return undefined;

    // 4. Rank, sort, deduplicate
    if (items.length === 0) return undefined;
    const ranked = this.rankingEngine.rank(items, ctx);

    // 5. Store for potential re-use
    this.store.setItems(ranked);

    // 6. Convert to Monaco format
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    return {
      suggestions: ranked.map((r) => ({
        label: r.item.label,
        kind: r.item.kind,
        detail: r.item.detail,
        documentation: r.item.documentation,
        insertText: r.item.insertText ?? r.item.label,
        range,
        sortText: String(r.finalScore).padStart(5, "0"),
      })),
    };
  }
}
