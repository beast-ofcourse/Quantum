import type { CompletionProvider, ProviderContext, TriggerKind } from "./types";

export interface TriggerRule {
  /** Which trigger kinds activate this rule. */
  kinds: TriggerKind[];
  /** Provider IDs to invoke. */
  providerIds: string[];
}

const DEFAULT_RULES: TriggerRule[] = [
  { kinds: ["letter"], providerIds: ["lsp", "keywords", "workspace", "snippets"] },
  { kinds: ["dot"], providerIds: ["lsp"] },
  { kinds: ["angle"], providerIds: ["lsp", "snippets"] },
  { kinds: ["quote", "slash"], providerIds: ["path"] },
  { kinds: ["manual"], providerIds: ["lsp", "keywords", "workspace", "snippets", "path"] },
];

export class TriggerManager {
  private rules: TriggerRule[];

  constructor(rules?: TriggerRule[]) {
    this.rules = rules ?? DEFAULT_RULES;
  }

  /** Determine which trigger kind applies to the current context. */
  detectTriggerKind(context: ProviderContext): TriggerKind {
    if (context.manual) return "manual";
    const ch = context.triggerChar;
    if (ch === ".") return "dot";
    if (ch === "<") return "angle";
    if (ch === "\"" || ch === "'") return "quote";
    if (ch === "/") return "slash";
    if (ch && /[a-zA-Z0-9_]/.test(ch)) return "letter";
    return "manual";
  }

  /** Return the list of provider IDs that should be invoked. */
  getActiveProviderIds(context: ProviderContext): string[] {
    const kind = this.detectTriggerKind(context);
    const ids = new Set<string>();
    for (const rule of this.rules) {
      if (rule.kinds.includes(kind)) {
        for (const id of rule.providerIds) ids.add(id);
      }
    }
    return Array.from(ids);
  }

  /** Check if a specific provider should fire. */
  shouldInvoke(provider: CompletionProvider, context: ProviderContext): boolean {
    if (!provider.canProvide(context)) return false;
    const ids = this.getActiveProviderIds(context);
    return ids.includes(provider.id);
  }
}
