const SESSION_KEY = "code-editor:session";

export interface SessionTab {
  path: string;
  language: string;
  cursor: { line: number; col: number };
}

const SESSION_VERSION = 1;

export interface SessionData {
  version: number;
  tabs: SessionTab[];
  activeTabId: string | null;
}

export function saveSession(
  openTabs: { path: string; language: string; cursor: { line: number; col: number } }[],
  activeTabId: string | null,
): void {
  try {
    const data: SessionData = {
      version: SESSION_VERSION,
      tabs: openTabs.map((t) => ({
        path: t.path,
        language: t.language,
        cursor: { line: t.cursor.line, col: t.cursor.col },
      })),
      activeTabId,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

export function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Accept old data (no version — same shape) or current version
    if (data.version !== undefined && data.version !== SESSION_VERSION) {
      // Future-incompatible version — clear and start fresh
      clearSession();
      return null;
    }
    return data as SessionData;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // noop
  }
}
