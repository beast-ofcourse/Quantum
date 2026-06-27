import type { CompletionProvider, CompletionItem, ProviderContext } from "./types";

export class ProviderManager {
  private providers = new Map<string, CompletionProvider>();

  register(provider: CompletionProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  get(id: string): CompletionProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): CompletionProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Invoke a subset of providers in parallel and collect results.
   * @param providerIds - List of provider IDs to invoke.
   * @param context - Current completion context.
   */
  async invokeProviders(
    providerIds: string[],
    context: ProviderContext,
  ): Promise<CompletionItem[]> {
    const promises: Promise<CompletionItem[]>[] = [];

    for (const id of providerIds) {
      const provider = this.providers.get(id);
      if (!provider || !provider.canProvide(context)) continue;

      promises.push(
        provider.provide(context).catch((err) => {
          console.warn(`[Completion] Provider "${id}" failed:`, err);
          return [] as CompletionItem[];
        }),
      );
    }

    const results = await Promise.all(promises);
    return results.flat();
  }
}
