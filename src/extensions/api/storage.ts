export function createStorageAPI(extensionId: string) {
  const prefix = `ext:${extensionId}:`;

  return {
    get(key: string): unknown {
      try {
        const raw = localStorage.getItem(`${prefix}${key}`);
        return raw ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    },
    set(key: string, value: unknown): void {
      try {
        localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
      } catch {
        console.warn(`[ext:storage] failed to set "${key}"`);
      }
    },
  };
}

export type StorageAPI = ReturnType<typeof createStorageAPI>;
