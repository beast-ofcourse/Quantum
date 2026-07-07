import { describe, it, expect } from "vitest";
import { KeywordProvider } from "./KeywordProvider";
import type { ProviderContext } from "../core/completion/types";

const provider = new KeywordProvider();

const ctx = (lang: string, prefix: string): ProviderContext => ({
  text: "",
  position: { lineNumber: 1, column: prefix.length + 1 } as any,
  prefix,
  triggerChar: null,
  uri: "test.ts",
  language: lang,
  manual: false,
});

describe("KeywordProvider", () => {
  it("provides TypeScript keywords", async () => {
    const items = await provider.provide(ctx("typescript", "if"));
    expect(items.find((i) => i.label === "if")).toBeTruthy();
    expect(items.find((i) => i.label === "for")).toBeTruthy();
  });

  it("provides Python keywords", async () => {
    const items = await provider.provide(ctx("python", "def"));
    expect(items.find((i) => i.label === "def")).toBeTruthy();
  });

  it("returns empty for unknown language", async () => {
    const items = await provider.provide(ctx("unknown_lang", "x"));
    expect(items).toHaveLength(0);
  });
});
