import { pathExists } from "@/tauri/fs";
import { isTauri } from "@/lib/platform";
import { getMonacoModule } from "@/extensions/editorRef";
import { lspManager } from "@/lib/lsp";

export async function ensureBundledExtensions(): Promise<void> {
  // In browser mode, bundled extensions are not available (no Tauri fs).
  // LSP and Monaco integration still work via the browser runtime.
  if (!isTauri()) return;

  const extDir = await getExtensionDir();
  const pythonDir = extDir + "/python";
  const exists = await pathExists(pythonDir + "/package.json");
  if (exists) return;

  const monaco = getMonacoModule();
  if (monaco) {
    lspManager.init();
  }
}

async function getExtensionDir(): Promise<string> {
  const { resolveHome } = await import("@/tauri/fs");
  const home = await resolveHome();
  return home + "/.code-editor/extensions";
}
