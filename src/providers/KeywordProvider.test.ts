import { KeywordProvider } from "./KeywordProvider";
import type { ProviderContext } from "../core/completion/types";

const provider = new KeywordProvider();

const ctx = (lang: string, prefix: string): ProviderContext => ({
  text: "", position: { lineNumber: 1, column: prefix.length + 1 } as any,
  prefix, triggerChar: null, uri: "test.ts", language: lang, manual: false,
});

// Typescript keywords
async function test() {
  let items = await provider.provide(ctx("typescript", "if"));
  if (!items.find(i => i.label === "if")) throw new Error("missing 'if'");
  if (!items.find(i => i.label === "for")) throw new Error("missing 'for'");

  // Python keywords
  items = await provider.provide(ctx("python", "def"));
  if (!items.find(i => i.label === "def")) throw new Error("missing 'def'");

  // Unknown language — empty
  items = await provider.provide(ctx("unknown_lang", "x"));
  if (items.length !== 0) throw new Error("unknown language should return empty");

  console.log("All keyword provider tests passed");
}
test();
