import { lspManager } from "@/lib/lsp";
import type { LspConfig } from "@/lib/lsp";

export function createLspApi() {
  return {
    register(languageId: string, config: LspConfig): { dispose: () => void } {
      return lspManager.registerLanguage(languageId, config);
    },
  };
}
