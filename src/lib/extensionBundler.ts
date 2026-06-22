import { pathExists } from "@/tauri/fs";
import { isTauri } from "@/lib/platform";
import { getMonacoModule } from "@/extensions/editorRef";
import { lspManager } from "@/lib/lsp";
import { tryStartLspServers } from "@/lib/lsp/bootstrap";

export async function ensureBundledExtensions(): Promise<void> {
  if (!isTauri()) return;

  const monaco = getMonacoModule();
  if (monaco) {
    lspManager.init();
    tryStartLspServers();
  }

  const extDir = await getExtensionDir();
  const pythonDir = extDir + "/python";
  const exists = await pathExists(pythonDir + "/package.json");
  if (exists) return;
}

async function getExtensionDir(): Promise<string> {
  const { resolveHome } = await import("@/tauri/fs");
  const home = await resolveHome();
  return home + "/.code-editor/extensions";
}
