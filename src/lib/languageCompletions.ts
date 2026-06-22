import * as monaco from "@/lib/monaco-entry";

const KEYWORDS: Record<string, string[]> = {
  python: [
    "False", "None", "True", "and", "as", "assert", "async", "await",
    "break", "class", "continue", "def", "del", "elif", "else", "except",
    "finally", "for", "from", "global", "if", "import", "in", "is",
    "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
    "while", "with", "yield",
  ],
  cpp: [
    "auto", "bool", "break", "case", "catch", "char", "class", "const",
    "continue", "default", "delete", "do", "double", "else", "enum",
    "explicit", "export", "extern", "false", "float", "for", "friend",
    "goto", "if", "inline", "int", "long", "namespace", "new", "noexcept",
    "nullptr", "operator", "override", "private", "protected", "public",
    "return", "short", "signed", "sizeof", "static", "struct", "switch",
    "template", "this", "throw", "true", "try", "typedef", "typename",
    "union", "unsigned", "using", "virtual", "void", "volatile", "while",
  ],
  c: [
    "auto", "break", "case", "char", "const", "continue", "default", "do",
    "double", "else", "enum", "extern", "float", "for", "goto", "if",
    "int", "long", "register", "return", "short", "signed", "sizeof",
    "static", "struct", "switch", "typedef", "union", "unsigned", "void",
    "volatile", "while",
  ],
  csharp: [
    "abstract", "as", "base", "bool", "break", "byte", "case", "catch",
    "char", "checked", "class", "const", "continue", "decimal", "default",
    "delegate", "do", "double", "else", "enum", "event", "explicit",
    "extern", "false", "finally", "fixed", "float", "for", "foreach",
    "goto", "if", "implicit", "in", "int", "interface", "internal", "is",
    "lock", "long", "namespace", "new", "null", "object", "operator",
    "out", "override", "params", "private", "protected", "public",
    "readonly", "ref", "return", "sbyte", "sealed", "short", "sizeof",
    "stackalloc", "static", "string", "struct", "switch", "this", "throw",
    "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe",
    "ushort", "using", "virtual", "void", "volatile", "while",
  ],
  rust: [
    "Self", "as", "async", "await", "break", "const", "continue", "crate",
    "dyn", "else", "enum", "extern", "false", "fn", "for", "if", "impl",
    "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref",
    "return", "self", "static", "struct", "super", "trait", "true",
    "type", "union", "unsafe", "use", "where", "while",
  ],
  go: [
    "break", "case", "chan", "const", "continue", "default", "defer",
    "else", "fallthrough", "for", "func", "go", "goto", "if", "import",
    "interface", "map", "package", "range", "return", "select", "struct",
    "switch", "type", "var",
  ],
  java: [
    "abstract", "assert", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "default", "do", "double",
    "else", "enum", "extends", "false", "final", "finally", "float",
    "for", "goto", "if", "implements", "import", "instanceof", "int",
    "interface", "long", "native", "new", "null", "package", "private",
    "protected", "public", "return", "short", "static", "strictfp",
    "super", "switch", "synchronized", "this", "throw", "throws",
    "transient", "true", "try", "void", "volatile", "while",
  ],
  kotlin: [
    "as", "break", "class", "continue", "do", "else", "false", "for",
    "fun", "if", "in", "interface", "is", "null", "object", "package",
    "return", "super", "this", "throw", "true", "try", "typealias",
    "typeof", "val", "var", "when", "while",
  ],
  swift: [
    "associatedtype", "async", "await", "break", "case", "catch", "class",
    "continue", "default", "defer", "do", "else", "enum", "extension",
    "false", "fileprivate", "for", "func", "guard", "if", "import", "in",
    "indirect", "infix", "init", "inout", "internal", "is", "let",
    "open", "operator", "postfix", "precedence", "prefix", "private",
    "protocol", "public", "repeat", "return", "self", "static", "struct",
    "subscript", "super", "switch", "throw", "throws", "true", "try",
    "typealias", "var", "where", "while",
  ],
  php: [
    "__CLASS__", "__DIR__", "__FILE__", "__FUNCTION__", "__LINE__",
    "__METHOD__", "__NAMESPACE__", "__TRAIT__", "abstract", "and",
    "array", "as", "break", "callable", "case", "catch", "class",
    "clone", "const", "continue", "declare", "default", "die", "do",
    "echo", "else", "elseif", "empty", "enddeclare", "endfor", "endforeach",
    "endif", "endswitch", "endwhile", "eval", "exit", "extends", "false",
    "final", "finally", "fn", "for", "foreach", "function", "global",
    "goto", "if", "implements", "include", "instanceof", "insteadof",
    "interface", "isset", "list", "match", "namespace", "new", "null",
    "or", "print", "private", "protected", "public", "readonly", "require",
    "return", "static", "switch", "throw", "trait", "true", "try",
    "unset", "use", "var", "while", "xor", "yield",
  ],
  ruby: [
    "BEGIN", "END", "alias", "and", "begin", "break", "case", "class",
    "def", "defined?", "do", "else", "elsif", "end", "ensure", "false",
    "for", "if", "in", "module", "next", "nil", "not", "or", "redo",
    "rescue", "retry", "return", "self", "super", "then", "true",
    "undef", "unless", "until", "when", "while", "yield",
  ],
  shell: [
    "case", "do", "done", "elif", "else", "esac", "fi", "for", "function",
    "if", "in", "select", "then", "time", "until", "while",
  ],
  sql: [
    "ADD", "ALL", "ALTER", "AND", "AS", "ASC", "BETWEEN", "BY",
    "CASCADE", "CASE", "CHECK", "COLUMN", "CONSTRAINT", "CREATE",
    "CROSS", "DATABASE", "DEFAULT", "DELETE", "DESC", "DISTINCT",
    "DROP", "ELSE", "END", "EXISTS", "FOREIGN", "FROM", "FULL",
    "GROUP", "HAVING", "IN", "INDEX", "INNER", "INSERT", "INTO",
    "IS", "JOIN", "KEY", "LEFT", "LIKE", "LIMIT", "NOT", "NULL",
    "ON", "OR", "ORDER", "OUTER", "PRIMARY", "REFERENCES", "RIGHT",
    "SELECT", "SET", "TABLE", "THEN", "TO", "TRIGGER", "UNION",
    "UNIQUE", "UPDATE", "VALUES", "VIEW", "WHERE",
  ],
};

const SNIPPETS: Record<string, { label: string; insertText: string; detail: string }[]> = {
  python: [
    { label: "class", insertText: "class ${1:ClassName}:\n\t${2:pass}", detail: "class definition" },
    { label: "def", insertText: "def ${1:function_name}(${2:args}):\n\t${3:pass}", detail: "function definition" },
    { label: "for", insertText: "for ${1:item} in ${2:iterable}:\n\t${3:pass}", detail: "for loop" },
    { label: "if", insertText: "if ${1:condition}:\n\t${2:pass}", detail: "if statement" },
    { label: "if-else", insertText: "if ${1:condition}:\n\t${2:pass}\nelse:\n\t${3:pass}", detail: "if-else statement" },
    { label: "try", insertText: "try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:pass}", detail: "try-except block" },
    { label: "import", insertText: "import ${1:module}", detail: "import module" },
    { label: "main", insertText: "if __name__ == \"__main__\":\n\t${1:pass}", detail: "main guard" },
  ],
  cpp: [
    { label: "class", insertText: "class ${1:Name} {\npublic:\n\t${2:}(${3:});\nprivate:\n\t${4:};\n};", detail: "class definition" },
    { label: "for", insertText: "for (${1:int i = 0}; ${2:i < n}; ${3:++i}) {\n\t${4:}\n}", detail: "for loop" },
    { label: "if", insertText: "if (${1:condition}) {\n\t${2:}\n}", detail: "if statement" },
    { label: "main", insertText: "int main(${1:int argc, char *argv[]}) {\n\t${2:return 0;\n}}", detail: "main function" },
  ],
  c: [
    { label: "for", insertText: "for (${1:int i = 0}; ${2:i < n}; ${3:++i}) {\n\t${4:}\n}", detail: "for loop" },
    { label: "if", insertText: "if (${1:condition}) {\n\t${2:}\n}", detail: "if statement" },
    { label: "main", insertText: "int main(${1:int argc, char *argv[]}) {\n\t${2:return 0;\n}}", detail: "main function" },
  ],
  csharp: [
    { label: "class", insertText: "class ${1:ClassName}\n{\n\t${2:}\n}", detail: "class definition" },
    { label: "for", insertText: "for (${1:int i = 0}; ${2:i < n}; ${3:i++}) {\n\t${4:}\n}", detail: "for loop" },
    { label: "foreach", insertText: "foreach (${1:var} ${2:item} in ${3:collection}) {\n\t${4:}\n}", detail: "foreach loop" },
    { label: "if", insertText: "if (${1:condition}) {\n\t${2:}\n}", detail: "if statement" },
  ],
  rust: [
    { label: "fn", insertText: "fn ${1:name}(${2:args}) ${3:-> ${4:ReturnType}} {\n\t${5:}\n}", detail: "function definition" },
    { label: "for", insertText: "for ${1:item} in ${2:iterable} {\n\t${3:}\n}", detail: "for loop" },
    { label: "if", insertText: "if ${1:condition} {\n\t${2:}\n}", detail: "if statement" },
    { label: "match", insertText: "match ${1:value} {\n\t${2:Pattern} => ${3:},\n\t_ => ${4:},\n}", detail: "match expression" },
    { label: "impl", insertText: "impl ${1:Type} {\n\tfn ${2:method}(&self) ${3:-> ${4:ReturnType}} {\n\t\t${5:}\n\t}\n}", detail: "impl block" },
  ],
  go: [
    { label: "func", insertText: "func ${1:name}(${2:args}) ${3:}${4:error} {\n\t${5:return\n}}", detail: "function definition" },
    { label: "for", insertText: "for ${1:i := 0}; ${2:i < n}; ${3:i++} {\n\t${4:}\n}", detail: "for loop" },
    { label: "if", insertText: "if ${1:condition} {\n\t${2:}\n}", detail: "if statement" },
    { label: "if-err", insertText: "if ${1:err} != nil {\n\t${2:return ${3:err}\n}}", detail: "error check" },
    { label: "main", insertText: "func main() {\n\t${1:}\n}", detail: "main function" },
  ],
  java: [
    { label: "class", insertText: "public class ${1:ClassName} {\n\t${2:}\n}", detail: "class definition" },
    { label: "for", insertText: "for (${1:int i = 0}; ${2:i < n}; ${3:i++}) {\n\t${4:}\n}", detail: "for loop" },
    { label: "if", insertText: "if (${1:condition}) {\n\t${2:}\n}", detail: "if statement" },
    { label: "main", insertText: "public static void main(String[] args) {\n\t${1:}\n}", detail: "main method" },
    { label: "try", insertText: "try {\n\t${1:}\n} catch (${2:Exception} ${3:e}) {\n\t${4:}\n}", detail: "try-catch block" },
  ],
  kotlin: [
    { label: "fun", insertText: "fun ${1:name}(${2:args})${3:: ${4:ReturnType}} {\n\t${5:}\n}", detail: "function" },
    { label: "for", insertText: "for (${1:item} in ${2:collection}) {\n\t${3:}\n}", detail: "for loop" },
    { label: "if", insertText: "if (${1:condition}) {\n\t${2:}\n}", detail: "if statement" },
    { label: "class", insertText: "class ${1:Name}${2:: ${3:Any}} {\n\t${4:}\n}", detail: "class" },
  ],
  swift: [
    { label: "func", insertText: "func ${1:name}(${2:args}) ${3:-> ${4:ReturnType}} {\n\t${5:}\n}", detail: "function" },
    { label: "for", insertText: "for ${1:item} in ${2:collection} {\n\t${3:}\n}", detail: "for-in loop" },
    { label: "if", insertText: "if ${1:condition} {\n\t${2:}\n}", detail: "if statement" },
    { label: "class", insertText: "class ${1:Name}${2:: ${3:SuperClass}} {\n\t${4:}\n}", detail: "class" },
  ],
  php: [
    { label: "class", insertText: "class ${1:ClassName} {\n\t${2:}\n}", detail: "class" },
    { label: "function", insertText: "function ${1:name}(${2:args})${3:: ${4:ReturnType}} {\n\t${5:}\n}", detail: "function" },
    { label: "for", insertText: "for ($${1:i} = 0; $${1:i} < ${2:n}; $${1:i}++) {\n\t${3:}\n}", detail: "for loop" },
    { label: "if", insertText: "if (${1:condition}) {\n\t${2:}\n}", detail: "if" },
    { label: "foreach", insertText: "foreach ($${1:array} as $${2:value}) {\n\t${3:}\n}", detail: "foreach" },
  ],
  ruby: [
    { label: "def", insertText: "def ${1:method_name}\n\t${2:}\nend", detail: "method" },
    { label: "for", insertText: "for ${1:item} in ${2:collection}\n\t${3:}\nend", detail: "for loop" },
    { label: "if", insertText: "if ${1:condition}\n\t${2:}\nend", detail: "if" },
    { label: "class", insertText: "class ${1:ClassName}\n\t${2:}\nend", detail: "class" },
  ],
  shell: [
    { label: "for", insertText: "for ${1:i} in ${2:list}; do\n\t${3:}\ndone", detail: "for loop" },
    { label: "if", insertText: "if [ ${1:condition} ]; then\n\t${2:}\nfi", detail: "if statement" },
    { label: "function", insertText: "function ${1:name}() {\n\t${2:}\n}", detail: "function" },
  ],
  sql: [
    { label: "select", insertText: "SELECT ${1:*} FROM ${2:table}${3: WHERE ${4:condition}}", detail: "SELECT query" },
    { label: "insert", insertText: "INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values})", detail: "INSERT" },
    { label: "update", insertText: "UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition}", detail: "UPDATE" },
    { label: "delete", insertText: "DELETE FROM ${1:table} WHERE ${2:condition}", detail: "DELETE" },
    { label: "create", insertText: "CREATE TABLE ${1:table_name} (\n\t${2:id} ${3:INTEGER PRIMARY KEY},\n\t${4:name} ${5:TEXT}\n);", detail: "CREATE TABLE" },
  ],
};

export function registerLanguageCompletions(): void {
  for (const [language, keywords] of Object.entries(KEYWORDS)) {
    const snippets = SNIPPETS[language] ?? [];
    if (snippets.length === 0 && keywords.length === 0) continue;

    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems: (model: monaco.editor.ITextModel, position: monaco.Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: [
            ...keywords.map((kw) => ({
              label: kw,
              kind: monaco.languages.CompletionItemKind.Keyword as number,
              insertText: kw,
              range,
            })),
            ...snippets.map((s) => ({
              label: s.label,
              kind: monaco.languages.CompletionItemKind.Snippet as number,
              insertText: s.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet as number,
              detail: s.detail,
              range,
            })),
          ],
        };
      },
    });
  }
}
