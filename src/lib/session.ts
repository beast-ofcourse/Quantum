export interface SessionTab {
  path: string;
  cursor?: { line: number; col: number };
}

export interface WindowState {
  width: number;
  height: number;
  maximized: boolean;
}

export interface SessionData {
  tabs: SessionTab[];
  windowState?: WindowState;
}

const SESSION_KEY = "code-editor:session";
const BACKUP_KEY = "code-editor:unsaved-backup";
const RECENT_KEY = "code-editor:recentFolders";
const MAX_RECENT = 10;

export function saveSession(data: SessionData): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("[session] failed to save session:", err);
  }
}

function isValidSessionData(obj: unknown): obj is SessionData {
  if (typeof obj !== "object" || obj === null) return false;
  const s = obj as Record<string, unknown>;
  if (!Array.isArray(s.tabs)) return false;
  return s.tabs.every(
    (t: unknown) =>
      typeof t === "object" && t !== null && typeof (t as Record<string, unknown>).path === "string",
  );
}

export function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidSessionData(parsed)) {
      console.warn("[session] loadSession: invalid session data, returning null");
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

export function saveUnsavedBackup(tabs: { path: string; content: string }[]): void {
  try {
    const total = tabs.reduce((acc, t) => acc + t.content.length, 0);
    if (total > 1_000_000) {
      console.warn("[session] unsaved backup > 1MB, consider file-based storage");
    }
    localStorage.setItem(BACKUP_KEY, JSON.stringify(tabs));
  } catch (err) {
    console.error("[session] failed to save backup:", err);
  }
}

export function loadUnsavedBackup(): { path: string; content: string }[] {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).path === "string" &&
          typeof (item as Record<string, unknown>).content === "string",
      )
    ) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

export function clearUnsavedBackup(): void {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch { /* ignore */ }
}

export function addRecentFolder(path: string): void {
  try {
    const folders = getRecentFolders();
    const filtered = folders.filter((f) => f !== path);
    filtered.unshift(path);
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

export function getRecentFolders(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item: unknown) => typeof item === "string")) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

export function clearRecentFolders(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch { /* ignore */ }
}
