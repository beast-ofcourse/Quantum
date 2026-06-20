import * as monaco from "@/lib/monaco-entry";

const LANGUAGES = [
  "python", "cpp", "c", "csharp", "rust", "go", "java", "kotlin", "swift",
  "php", "ruby", "shell", "sql",
];

export function registerHoverProvider(): void {
  for (const lang of LANGUAGES) {
    monaco.languages.registerHoverProvider(lang, {
      provideHover: (model: monaco.editor.ITextModel, position: monaco.Position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return undefined;
        return {
          contents: [
            { value: "```" + lang + "\n" + word.word + "\n```" },
          ] as monaco.IMarkdownString[],
        };
      },
    });
  }
}
