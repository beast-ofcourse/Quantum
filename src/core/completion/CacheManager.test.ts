import { CacheManager } from "./CacheManager";

// Basic get/set
const cache = new CacheManager({ ttl: 1000 });
cache.set("test", { value: 42 });
const val = cache.get<{ value: number }>("test");
if (!val || val.value !== 42) throw new Error("Basic get/set failed");

// Expiry
const fastCache = new CacheManager({ ttl: 10 });
fastCache.set("expire", true);
await new Promise(r => setTimeout(r, 20));
if (fastCache.get("expire") !== null) throw new Error("Expiry failed");

// Invalidation
const c2 = new CacheManager();
c2.set("workspace:symbols", [1, 2, 3]);
c2.set("workspace:files", ["a.ts"]);
c2.invalidatePrefix("workspace:");
if (c2.get("workspace:symbols") !== null) throw new Error("Prefix invalidation failed");

// Clear
c2.set("keep", true);
c2.clear();
if (c2.get("keep") !== null) throw new Error("Clear failed");

console.log("All cache tests passed");
