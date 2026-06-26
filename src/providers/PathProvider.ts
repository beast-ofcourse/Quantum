import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";

export class PathProvider implements CompletionProvider {
  id = "path";

  /** Only fire when typing inside quote/slash context (imports). */
  canProvide(context: ProviderContext): boolean {
    return context.triggerChar === "\""
      || context.triggerChar === "'"
      || context.triggerChar === "/"
      || (context.prefix.includes("/") || context.prefix.includes("\\"));
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    // For v1, parse the current import path from the line.
    // Full directory listing would need access to the filesystem via Tauri.
    // This provides a scaffold that works with relative paths.
    const line = context.text.split("\n")[context.position.lineNumber - 1] ?? "";
    const match = line.match(/from\s+["']([^"']*)$/);
    if (!match) return [];

    const partial = match[1];
    if (!partial.includes(".") && !partial.includes("/")) {
      // No directory context yet — suggest "./" and "../"
      return [
        { label: "./", kind: 18 as any, detail: "relative path", insertText: "./", source: "path", score: 0 },
        { label: "../", kind: 18 as any, detail: "parent path", insertText: "../", source: "path", score: 0 },
      ];
    }

    // Extend this with Tauri fs readDir when available
    return [];
  }
}
