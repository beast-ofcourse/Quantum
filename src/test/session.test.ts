import { describe, it, expect, beforeEach } from "vitest";
import {
  saveSession,
  loadSession,
  clearSession,
  addRecentFolder,
  getRecentFolders,
  clearRecentFolders,
  saveUnsavedBackup,
  loadUnsavedBackup,
} from "@/lib/session";

beforeEach(() => {
  localStorage.clear();
});

describe("session", () => {
  it("saves and loads session data", () => {
    saveSession({
      tabs: [{ path: "/test/file.ts", cursor: { line: 10, col: 5 } }],
    });
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.tabs).toHaveLength(1);
    expect(loaded!.tabs[0].path).toBe("/test/file.ts");
    expect(loaded!.tabs[0].cursor?.line).toBe(10);
  });

  it("returns null when no session exists", () => {
    expect(loadSession()).toBeNull();
  });

  it("clears session data", () => {
    saveSession({ tabs: [{ path: "/test.ts" }] });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});

describe("recent folders", () => {
  it("adds and retrieves recent folders", () => {
    addRecentFolder("/path/to/folder");
    const folders = getRecentFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0]).toBe("/path/to/folder");
  });

  it("deduplicates recent folders", () => {
    addRecentFolder("/path");
    addRecentFolder("/other");
    addRecentFolder("/path");
    const folders = getRecentFolders();
    expect(folders).toHaveLength(2);
    expect(folders[0]).toBe("/path");
  });

  it("limits to 10 recent folders", () => {
    for (let i = 0; i < 15; i++) {
      addRecentFolder(`/path/${i}`);
    }
    expect(getRecentFolders()).toHaveLength(10);
  });

  it("clears recent folders", () => {
    addRecentFolder("/path");
    clearRecentFolders();
    expect(getRecentFolders()).toHaveLength(0);
  });
});

describe("unsaved backup", () => {
  it("saves and loads backup", () => {
    saveUnsavedBackup([{ path: "/test.ts", content: "hello" }]);
    const loaded = loadUnsavedBackup();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe("hello");
  });

  it("returns empty array when no backup", () => {
    expect(loadUnsavedBackup()).toEqual([]);
  });
});
