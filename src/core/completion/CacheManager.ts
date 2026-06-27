export interface CacheOptions {
  /** TTL in milliseconds. Default: 30000. */
  ttl?: number;
}

export class CacheManager {
  private store = new Map<string, { data: unknown; expiresAt: number }>();
  private defaultTtl: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl ?? 30_000;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttl ?? this.defaultTtl),
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix (e.g. "workspace:"). */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
