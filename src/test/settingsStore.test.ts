import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(useSettingsStore.getInitialState());
});

describe("settingsStore", () => {
  it("has correct default values", () => {
    const state = useSettingsStore.getState();
    expect(state.general.autoSave).toBe(false);
    expect(state.general.autoSaveDelay).toBe(1000);
    expect(state.editor.fontSize).toBe(13);
    expect(state.editor.fontFamily).toContain("monospace");
    expect(state.editor.tabSize).toBe(2);
    expect(state.editor.wordWrap).toBe("off");
    expect(state.editor.minimap).toBe(true);
    expect(state.editor.minimapScale).toBe(1);
    expect(state.editor.formatOnSave).toBe(false);
    expect(state.editor.breadcrumbs).toBe(true);
    expect(state.editor.lineNumbers).toBe("on");
    expect(state.terminal.fontSize).toBe(13);
    expect(state.terminal.fontFamily).toContain("monospace");
    expect(state.search.excludePatterns).toEqual(["node_modules", ".git", "dist", "build"]);
    expect(state.search.maxResults).toBe(1000);
  });

  it("update changes values in a section", () => {
    useSettingsStore.getState().update("editor", { fontSize: 16, tabSize: 4 });
    const state = useSettingsStore.getState();
    expect(state.editor.fontSize).toBe(16);
    expect(state.editor.tabSize).toBe(4);
  });

  it("update does not affect other sections", () => {
    useSettingsStore.getState().update("editor", { fontSize: 20 });
    expect(useSettingsStore.getState().terminal.fontSize).toBe(13);
  });

  it("update works with general section", () => {
    useSettingsStore.getState().update("general", { autoSave: true, autoSaveDelay: 2500 });
    const state = useSettingsStore.getState();
    expect(state.general.autoSave).toBe(true);
    expect(state.general.autoSaveDelay).toBe(2500);
  });

  it("zoom('in') increases fontSize by 1 for both editor and terminal", () => {
    useSettingsStore.getState().zoom("in");
    const state = useSettingsStore.getState();
    expect(state.editor.fontSize).toBe(14);
    expect(state.terminal.fontSize).toBe(14);
  });

  it("zoom('out') decreases fontSize by 1 for both editor and terminal", () => {
    useSettingsStore.getState().update("editor", { fontSize: 10 });
    useSettingsStore.getState().update("terminal", { fontSize: 10 });
    useSettingsStore.getState().zoom("out");
    const state = useSettingsStore.getState();
    expect(state.editor.fontSize).toBe(9);
    expect(state.terminal.fontSize).toBe(9);
  });

  it("zoom('out') does not go below minimum of 6", () => {
    useSettingsStore.getState().update("editor", { fontSize: 6 });
    useSettingsStore.getState().update("terminal", { fontSize: 6 });
    useSettingsStore.getState().zoom("out");
    expect(useSettingsStore.getState().editor.fontSize).toBe(6);
    expect(useSettingsStore.getState().terminal.fontSize).toBe(6);
  });

  it("zoom('in') does not go above maximum of 48", () => {
    useSettingsStore.getState().update("editor", { fontSize: 48 });
    useSettingsStore.getState().update("terminal", { fontSize: 48 });
    useSettingsStore.getState().zoom("in");
    expect(useSettingsStore.getState().editor.fontSize).toBe(48);
  });

  it("zoom('reset') restores the default fontSize", () => {
    useSettingsStore.getState().update("editor", { fontSize: 30 });
    useSettingsStore.getState().update("terminal", { fontSize: 30 });
    useSettingsStore.getState().zoom("reset");
    const state = useSettingsStore.getState();
    expect(state.editor.fontSize).toBe(13);
    expect(state.terminal.fontSize).toBe(13);
  });

  it("persists state to localStorage", () => {
    useSettingsStore.getState().update("editor", { fontSize: 20 });
    const raw = localStorage.getItem("code-editor-settings");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.editor.fontSize).toBe(20);
  });
});
