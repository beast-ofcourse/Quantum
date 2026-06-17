/**
 * Module-level content store for large files.
 *
 * Files >5MB are not stored in Zustand (double-memory with Monaco).
 * Instead, content lives here — a simple Map keyed by file path.
 * This avoids storing the same large string in both Zustand and Monaco.
 * Small/medium files still go through Zustand as before.
 */

const contentMap = new Map<string, string>();

export const ContentStore = {
  get(path: string): string | undefined {
    return contentMap.get(path);
  },

  set(path: string, content: string): void {
    contentMap.set(path, content);
  },

  delete(path: string): void {
    contentMap.delete(path);
  },

  has(path: string): boolean {
    return contentMap.has(path);
  },

  /** Clear all stored content (e.g., on close-all). */
  clear(): void {
    contentMap.clear();
  },
};
