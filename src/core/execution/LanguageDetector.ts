import type { Language } from "./types";

const EXT_MAP: Record<string, Language> = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
};

export function detectLanguage(filePath: string): Language {
  const lower = filePath.toLowerCase();
  for (const [ext, lang] of Object.entries(EXT_MAP)) {
    if (lower.endsWith(ext)) return lang;
  }
  return "unknown";
}
