/**
 * Browser-mode virtual filesystem.
 *
 * Mirrors the Tauri `@/tauri/fs.ts` API using an in-memory Map persisted to
 * localStorage.  Lets the extension pipeline (scanner, installer, host) work
 * identically in browser dev mode without any `invoke` calls.
 *
 * All mutations auto-persist to localStorage so data survives page reloads.
 */

const STORAGE_KEY = "code-editor:browser-fs";
const DIR_MARKER = '{"type":"directory"}';

const virtualStore = new Map<string, string>();

// ---------------------------------------------------------------------------
// Init / persist
// ---------------------------------------------------------------------------

export function initBrowserFs(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(data)) {
      virtualStore.set(k, v);
    }
  } catch {
    /* corrupt cache — start fresh */
  }
}

export function persistBrowserFs(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(virtualStore)),
    );
  } catch {
    /* storage full — silently skip */
  }
}

export function clearBrowserFs(): void {
  virtualStore.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// API (mirrors @/tauri/fs.ts function signatures)
// ---------------------------------------------------------------------------

export async function browserResolveHome(): Promise<string> {
  return "/home/user";
}

export async function browserPathExists(path: string): Promise<boolean> {
  if (virtualStore.has(path)) return true;
  // Check if any stored key is a child of this path (directory check)
  for (const key of virtualStore.keys()) {
    if (key.startsWith(path + "/")) return true;
  }
  return false;
}

export async function browserCreateDirectory(path: string): Promise<void> {
  const normalPath = path.replace(/\/$/, "");
  if (!virtualStore.has(normalPath)) {
    virtualStore.set(normalPath, DIR_MARKER);
  }
  // Ensure parent chain
  const parts = normalPath.split("/");
  let acc = parts[0];
  for (let i = 1; i < parts.length; i++) {
    if (!virtualStore.has(acc)) {
      virtualStore.set(acc, DIR_MARKER);
    }
    acc += "/" + parts[i];
  }
  persistBrowserFs();
}

export async function browserWriteFile(
  path: string,
  content: string,
): Promise<void> {
  virtualStore.set(path, content);
  // Ensure parent directory chain
  const parts = path.split("/");
  let acc = parts[0];
  for (let i = 1; i < parts.length; i++) {
    if (!virtualStore.has(acc)) {
      virtualStore.set(acc, DIR_MARKER);
    }
    acc += "/" + parts[i];
  }
  persistBrowserFs();
}

export async function browserReadFile(path: string): Promise<string> {
  const content = virtualStore.get(path);
  if (content === undefined || content === DIR_MARKER) {
    throw new Error(`ENOENT: ${path}`);
  }
  return content;
}

export async function browserReadDirectory(
  path: string,
): Promise<{ entries: { name: string; path: string; isDir: boolean }[] }> {
  const normalPath = path.endsWith("/") ? path : path + "/";
  const entriesMap = new Map<string, { name: string; path: string; isDir: boolean }>();

  for (const key of virtualStore.keys()) {
    if (!key.startsWith(normalPath)) continue;
    const relative = key.slice(normalPath.length);
    if (!relative || relative.includes("/")) continue;
    const fullPath = normalPath + relative;
    const isDir = virtualStore.get(fullPath) === DIR_MARKER;
    entriesMap.set(relative, { name: relative, path: fullPath, isDir });
  }

  return { entries: Array.from(entriesMap.values()) };
}

export async function browserDeleteEntry(path: string): Promise<void> {
  const keysToDelete: string[] = [];
  for (const key of virtualStore.keys()) {
    if (key === path || key.startsWith(path + "/")) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    virtualStore.delete(key);
  }
  persistBrowserFs();
}

export async function browserStat(
  path: string,
): Promise<{ name: string; path: string; isDir: boolean }> {
  const isDir = virtualStore.get(path) === DIR_MARKER;
  const name = path.split("/").pop() ?? path;
  return { name, path, isDir };
}

export type BrowserFsEntry = {
  name: string;
  path: string;
  isDir: boolean;
};
