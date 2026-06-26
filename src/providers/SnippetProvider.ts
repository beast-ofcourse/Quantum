import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";

interface Snippet {
  prefix: string;
  body: string;
  description: string;
}

const SNIPPETS: Record<string, Snippet[]> = {
  typescript: [
    { prefix: "for", body: "for (let ${1:i} = 0; $1 < ${2:items}.length; $1++) {\n\t${3}\n}", description: "for loop" },
    { prefix: "forof", body: "for (const ${1:item} of ${2:items}) {\n\t${3}\n}", description: "for...of loop" },
    { prefix: "forin", body: "for (const ${1:key} in ${2:obj}) {\n\t${3}\n}", description: "for...in loop" },
    { prefix: "try", body: "try {\n\t${1}\n} catch (${2:err}) {\n\t${3}\n}", description: "try-catch block" },
    { prefix: "fn", body: "function ${1:name}(${2:params}): ${3:void} {\n\t${4}\n}", description: "function declaration" },
    { prefix: "arrow", body: "const ${1:name} = (${2:params}): ${3:void} => {\n\t${4}\n}", description: "arrow function" },
    { prefix: "class", body: "class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t${3}\n\t}\n}", description: "class declaration" },
    { prefix: "export", body: "export { ${1:name} };", description: "export statement" },
    { prefix: "import", body: "import { ${1:name} } from '${2:module}';", description: "import statement" },
    { prefix: "react", body: "import React from 'react';\n\ninterface ${1:Props} {\n\t${2}\n}\n\nexport const ${3:Component}: React.FC<${1:Props}> = ({ ${4} }) => {\n\treturn (\n\t\t<${5:div}>${6}</${5:div}>\n\t);\n};", description: "React component" },
    { prefix: "useState", body: "const [${1:state}, set${1:$1}] = useState<${2:type}>(${3:initial});", description: "React useState hook" },
    { prefix: "useEffect", body: "useEffect(() => {\n\t${1}\n}, [${2}]);", description: "React useEffect hook" },
  ],
  javascript: [
    { prefix: "for", body: "for (let ${1:i} = 0; $1 < ${2:items}.length; $1++) {\n\t${3}\n}", description: "for loop" },
    { prefix: "try", body: "try {\n\t${1}\n} catch (${2:err}) {\n\t${3}\n}", description: "try-catch block" },
    { prefix: "fn", body: "function ${1:name}(${2:params}) {\n\t${3}\n}", description: "function declaration" },
    { prefix: "arrow", body: "const ${1:name} = (${2:params}) => {\n\t${3}\n}", description: "arrow function" },
    { prefix: "import", body: "import { ${1:name} } from '${2:module}';", description: "import statement" },
  ],
  python: [
    { prefix: "def", body: "def ${1:name}(${2:params}):\n\t${3:pass}", description: "function definition" },
    { prefix: "class", body: "class ${1:Name}:\n\tdef __init__(self${2:, params}):\n\t\t${3:pass}", description: "class definition" },
    { prefix: "for", body: "for ${1:item} in ${2:items}:\n\t${3:pass}", description: "for loop" },
    { prefix: "ifmain", body: "if __name__ == '__main__':\n\t${1:main()}", description: "if __name__ guard" },
    { prefix: "try", body: "try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:pass}", description: "try-except block" },
  ],
};

export class SnippetProvider implements CompletionProvider {
  id = "snippets";

  canProvide(context: ProviderContext): boolean {
    return context.prefix.length >= 1;
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    const snippets = SNIPPETS[context.language];
    if (!snippets) return [];

    return snippets.map((s) => ({
      label: s.prefix,
      kind: 14 as any, // CompletionItemKind.Snippet
      detail: s.description,
      documentation: { value: "```\n" + s.body.split("\n").join("\n") + "\n```", isTrusted: true },
      insertText: s.body,
      source: "snippets",
      score: -2, // snippets ranked below semantic suggestions
    }));
  }
}
