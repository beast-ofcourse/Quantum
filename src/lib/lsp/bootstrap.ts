import { isTauri } from "@/lib/platform";
import { lspManager } from "./manager";

export function tryStartLspServers(): void {
  if (!isTauri()) return;

  lspManager.registerLanguage("python", {
    binaryPath: "pylsp",
    args: [],
  });

  lspManager.registerLanguage("csharp", {
    binaryPath: "csharp-ls",
    args: [],
  });
}
