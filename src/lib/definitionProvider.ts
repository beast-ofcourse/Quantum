import { getCurrentEditor, getMonacoModule } from "@/extensions/editorRef";
import { findDefinitions } from "@/tauri/definitions";
import { useFileStore } from "@/stores/fileStore";
import type * as monaco from "@/lib/monaco-entry";

let registered = false;

export function registerDefinitionProvider() {
  if (registered) return;
  const monaco = getMonacoModule();
  const editor = getCurrentEditor();
  if (!monaco || !editor) return;
  registered = true;

  const provider = monaco.languages.registerDefinitionProvider(
    { pattern: "**/*.{py,rb,go,rs,kt,kts,scala,sc,c,h,cpp,hpp,cc,cxx,php,swift,zig,ex,exs,lua,sh,bash,zsh,r,R,dart}" },
    {
      provideDefinition: async (model: monaco.editor.ITextModel, position: monaco.Position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        const rootPath = useFileStore.getState().rootPath;
        if (!rootPath) return null;

        try {
          const results = await findDefinitions(rootPath, word.word, model.uri.path);
          if (results.length === 0) return null;

          const definitions: monaco.languages.Location[] = results.map((r) => {
            const uri = monaco.Uri.file(
              rootPath.replace(/\\/g, "/").replace(/\/$/, "") + "/" + r.path,
            );
            return {
              uri,
              range: new monaco.Range(r.line, r.column, r.line, r.column + word.word.length),
            };
          });

          return definitions;
        } catch {
          return null;
        }
      },
    },
  );

  const disposable = { dispose: () => { provider.dispose(); registered = false; } };
  return disposable;
}

export function unregisterDefinitionProvider() {
  registered = false;
}
