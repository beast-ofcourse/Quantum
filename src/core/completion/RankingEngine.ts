import type { CompletionItem, RankedItem, ProviderContext } from "./types";
import { fuzzyMatch } from "./FuzzyMatcher";

export class RankingEngine {
  /**
   * Merge items from multiple providers, deduplicate, score, and sort.
   */
  rank(
    items: CompletionItem[],
    context: ProviderContext,
  ): RankedItem[] {
    // 1. Score each item
    const scored: RankedItem[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      // Deduplicate by label + source
      const key = `${item.label}:${item.source}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const fuzzyResult = fuzzyMatch(context.prefix, item.label);
      if (!fuzzyResult) continue; // skip if fuzzy doesn't match

      // Context score: prefer items with higher kind relevance
      let contextScore = 0;
      const kind = item.kind;

      // Local variables and methods ranked higher during method calls
      if (context.triggerChar === "." && kind === 4 /* Field */) contextScore += 10;
      if (context.triggerChar === "." && kind === 1 /* Method */) contextScore += 5;

      // Keywords ranked lower
      if (kind === 13 /* Keyword */) contextScore -= 10;

      // Final score: fuzzy score + context boost + provider score
      const finalScore = fuzzyResult.score + contextScore + (item.score ?? 0);

      scored.push({ item, fuzzyScore: fuzzyResult.score, contextScore, finalScore });
    }

    // 2. Sort by final score descending, then alphabetically
    scored.sort((a, b) => {
      if (a.finalScore !== b.finalScore) return b.finalScore - a.finalScore;
      return a.item.label.localeCompare(b.item.label);
    });

    return scored;
  }
}
