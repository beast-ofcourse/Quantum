import { describe, it, expect } from "vitest";
import { fuzzyMatch } from "./FuzzyMatcher";

describe("FuzzyMatcher", () => {
  it("matches prefix with high score", () => {
    const r1 = fuzzyMatch("con", "console");
    expect(r1).toBeTruthy();
    expect(r1!.score).toBeGreaterThanOrEqual(100);

    const r2 = fuzzyMatch("cons", "console");
    expect(r2).toBeTruthy();
    expect(r2!.score).toBeGreaterThanOrEqual(100);
  });

  it("matches substring", () => {
    const r = fuzzyMatch("sole", "console");
    expect(r).toBeTruthy();
    expect(r!.score).toBeGreaterThanOrEqual(90);
  });

  it("matches subsequence", () => {
    const r = fuzzyMatch("rd", "readFile");
    expect(r).toBeTruthy();
    expect(r!.score).toBeGreaterThanOrEqual(50);
  });

  it("matches camelCase boundary", () => {
    const r = fuzzyMatch("rf", "readFile");
    expect(r).toBeTruthy();
    expect(r!.score).toBeGreaterThanOrEqual(80);
  });

  it("rejects non-matching queries", () => {
    expect(fuzzyMatch("xyz", "console")).toBeNull();
    expect(fuzzyMatch("abc", "")).toBeNull();
  });
});
