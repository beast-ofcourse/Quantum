import { describe, it, expect } from "vitest";
import { CacheManager } from "./CacheManager";

describe("CacheManager", () => {
  it("basic get/set", () => {
    const cache = new CacheManager({ ttl: 1000 });
    cache.set("test", { value: 42 });
    const val = cache.get<{ value: number }>("test");
    expect(val?.value).toBe(42);
  });

  it("expires entries after TTL", async () => {
    const fastCache = new CacheManager({ ttl: 10 });
    fastCache.set("expire", true);
    await new Promise((r) => setTimeout(r, 20));
    expect(fastCache.get("expire")).toBeNull();
  });

  it("invalidates by prefix", () => {
    const c2 = new CacheManager();
    c2.set("workspace:symbols", [1, 2, 3]);
    c2.set("workspace:files", ["a.ts"]);
    c2.invalidatePrefix("workspace:");
    expect(c2.get("workspace:symbols")).toBeNull();
  });

  it("clears all entries", () => {
    const c2 = new CacheManager();
    c2.set("keep", true);
    c2.clear();
    expect(c2.get("keep")).toBeNull();
  });
});
