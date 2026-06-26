import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";

const KEYWORDS: Record<string, string[]> = {
  typescript: [
    "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
    "return", "throw", "try", "catch", "finally",
    "class", "interface", "type", "enum", "extends", "implements",
    "const", "let", "var", "function", "async", "await",
    "import", "export", "from", "default",
    "new", "this", "super", "typeof", "instanceof",
    "public", "private", "protected", "readonly", "static",
    "true", "false", "null", "undefined", "void",
  ],
  javascript: [
    "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
    "return", "throw", "try", "catch", "finally",
    "class", "extends",
    "const", "let", "var", "function", "async", "await",
    "import", "export", "from", "default",
    "new", "this", "super", "typeof", "instanceof",
    "true", "false", "null", "undefined", "void",
  ],
  python: [
    "if", "elif", "else", "for", "while", "break", "continue",
    "def", "class", "return", "yield", "import", "from", "as",
    "try", "except", "finally", "raise", "with", "pass",
    "True", "False", "None", "not", "and", "or", "is", "in",
    "async", "await", "lambda", "global", "nonlocal",
  ],
  rust: [
    "fn", "let", "mut", "const", "static",
    "if", "else", "match", "loop", "while", "for", "in",
    "return", "break", "continue",
    "struct", "enum", "impl", "trait", "pub", "use", "mod",
    "self", "super", "crate",
    "true", "false",
    "async", "await", "move", "ref",
    "Some", "None", "Ok", "Err",
  ],
  go: [
    "if", "else", "for", "range", "switch", "case", "default", "break", "continue",
    "func", "return", "defer", "go",
    "var", "const", "type", "struct", "interface", "map",
    "import", "package",
    "true", "false", "nil",
    "select", "fallthrough",
  ],
  java: [
    "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
    "return", "throw", "try", "catch", "finally",
    "class", "interface", "enum", "extends", "implements",
    "public", "private", "protected", "static", "final", "abstract",
    "new", "this", "super", "instanceof",
    "import", "package",
    "true", "false", "null", "void",
    "int", "long", "float", "double", "boolean", "char", "String",
  ],
};

export class KeywordProvider implements CompletionProvider {
  id = "keywords";

  canProvide(context: ProviderContext): boolean {
    return context.prefix.length > 0;
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    const keywords = KEYWORDS[context.language];
    if (!keywords) return [];

    return keywords.map((kw) => ({
      label: kw,
      kind: 13 as any, // CompletionItemKind.Keyword
      detail: "keyword",
      insertText: kw,
      source: "keywords",
      score: -0.5, // keywords ranked slightly below semantic completions
    }));
  }
}
