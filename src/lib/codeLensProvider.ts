import type * as monaco from "@/lib/monaco-entry";

let registered = false;

export function registerCodeLensProvider(monacoMod: typeof monaco): monaco.IDisposable {
  if (registered) return { dispose: () => {} };

  const provider = monacoMod.languages.registerCodeLensProvider(
    { pattern: "**/*" },
    {
      provideCodeLenses: async (model) => {
        const symbols = await (monacoMod.languages as unknown as {
          executeDocumentSymbolProvider: (uri: monaco.Uri | monaco.editor.ITextModel) => Promise<monaco.languages.DocumentSymbol[] | undefined>;
        }).executeDocumentSymbolProvider(model.uri);

        if (!symbols) return { lenses: [] };

        const lenses: monaco.languages.CodeLens[] = [];
        for (const sym of symbols) {
          const kind = sym.kind;
          if (
            kind === monacoMod.languages.SymbolKind.Function ||
            kind === monacoMod.languages.SymbolKind.Method ||
            kind === monacoMod.languages.SymbolKind.Constructor ||
            kind === monacoMod.languages.SymbolKind.Class
          ) {
            lenses.push({
              range: sym.range,
              id: `lens-run-${sym.name}`,
              command: {
                id: "code-lens.run",
                title: `▶ Run ${sym.name}`,
                arguments: [model.uri.toString(), sym.name],
              },
            });
          }
        }

        return { lenses };
      },
      resolveCodeLens: (_model, codeLens) => codeLens,
    },
  );

  registered = true;

  const command = monacoMod.editor.registerCommand("code-lens.run", async (_accessor, fileUri?: string, _symbolName?: string) => {
    try {
      const { useDebugStore } = await import("@/stores/debugStore");
      const { useEditorStore } = await import("@/stores/editorStore");
      const { DebugConfigurationService } = await import("@/lib/debugConfiguration");

      const store = useDebugStore.getState();
      const editorStore = useEditorStore.getState();

      // Don't start if already running
      if (store.activeSessionId) {
        const s = store.sessions.find((s) => s.id === store.activeSessionId);
        if (s && s.status !== "terminated" && s.status !== "inactive") return;
      }

      // Load configs and find active config
      const configs = await DebugConfigurationService.loadConfigs();
      if (configs.length === 0) return;

      let config = configs[0];

      // If we have a file, use it as the program
      const currentPath = fileUri ? fileUri.replace(/^file:\/\//, "") : editorStore.openTabs.find((t) => t.id === editorStore.activeTabId)?.path;
      if (currentPath && config.type === "node") {
        config = { ...config, program: currentPath };
      }

      await store.startSession(config);
    } catch {
      // Silently fail - debug store handles errors
    }
  });

  return {
    dispose: () => {
      provider.dispose();
      command.dispose();
      registered = false;
    },
  };
}
