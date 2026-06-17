import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import type { Tab } from "@/types/editor";

vi.mock("monaco-editor", () => ({
  Uri: { file: (path: string) => ({ path }) },
  editor: {
    getModel: () => null,
    getEditors: () => [],
  },
}));

vi.mock("@/tauri", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/lib/languages", () => ({
  getFileName: (path: string) => path.split("/").pop() ?? path,
  getLanguageFromPath: () => "plaintext",
}));

function makeTab(id: string, overrides: Partial<Tab> = {}): Tab {
  return {
    id,
    path: id,
    name: id.split("/").pop() ?? id,
    language: "plaintext",
    isDirty: false,
    savedContent: "",
    currentContent: "",
    cursor: { line: 1, col: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  useEditorStore.setState({ openTabs: [], activeTabId: null, lastClosedTab: null });
});

describe("editorStore initial state", () => {
  it("starts with empty openTabs", () => {
    expect(useEditorStore.getState().openTabs).toEqual([]);
  });

  it("starts with null activeTabId", () => {
    expect(useEditorStore.getState().activeTabId).toBeNull();
  });
});

describe("editorStore getActiveTab", () => {
  it("returns null when no tabs are open", () => {
    expect(useEditorStore.getState().getActiveTab()).toBeNull();
  });

  it("returns the active tab when openTabs is populated", () => {
    const tabs = [makeTab("/a.ts"), makeTab("/b.ts")];
    useEditorStore.setState({ openTabs: tabs, activeTabId: "/a.ts" });
    const active = useEditorStore.getState().getActiveTab();
    expect(active).not.toBeNull();
    expect(active!.id).toBe("/a.ts");
  });

  it("returns null when activeTabId does not match any tab", () => {
    useEditorStore.setState({ openTabs: [makeTab("/a.ts")], activeTabId: "/nonexistent" });
    expect(useEditorStore.getState().getActiveTab()).toBeNull();
  });
});

describe("editorStore setActiveTab", () => {
  it("sets active tab to an existing tab", () => {
    useEditorStore.setState({ openTabs: [makeTab("/a.ts"), makeTab("/b.ts")] });
    useEditorStore.getState().setActiveTab("/b.ts");
    expect(useEditorStore.getState().activeTabId).toBe("/b.ts");
  });

  it("ignores setting active tab to a non-existent id", () => {
    useEditorStore.setState({ openTabs: [makeTab("/a.ts")], activeTabId: "/a.ts" });
    useEditorStore.getState().setActiveTab("/nonexistent");
    expect(useEditorStore.getState().activeTabId).toBe("/a.ts");
  });
});

describe("editorStore tab lifecycle", () => {
  it("adds a tab via setState and sets it active", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/new.ts")],
      activeTabId: "/new.ts",
    });
    const state = useEditorStore.getState();
    expect(state.openTabs).toHaveLength(1);
    expect(state.activeTabId).toBe("/new.ts");
  });

  it("closes a tab by removing it from openTabs", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/a.ts"), makeTab("/b.ts")],
      activeTabId: "/a.ts",
    });
    useEditorStore.setState((s) => ({
      openTabs: s.openTabs.filter((t) => t.id !== "/a.ts"),
      activeTabId: s.activeTabId === "/a.ts" ? "/b.ts" : s.activeTabId,
    }));
    const state = useEditorStore.getState();
    expect(state.openTabs).toHaveLength(1);
    expect(state.openTabs[0].id).toBe("/b.ts");
  });

  it("handles closing the last tab", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/only.ts")],
      activeTabId: "/only.ts",
    });
    useEditorStore.setState({ openTabs: [], activeTabId: null });
    expect(useEditorStore.getState().openTabs).toHaveLength(0);
    expect(useEditorStore.getState().activeTabId).toBeNull();
  });
});

describe("editorStore cycleTab", () => {
  it("does nothing when only one tab", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/a.ts")],
      activeTabId: "/a.ts",
    });
    useEditorStore.getState().cycleTab(1);
    expect(useEditorStore.getState().activeTabId).toBe("/a.ts");
  });

  it("does nothing when no tabs", () => {
    useEditorStore.getState().cycleTab(1);
    expect(useEditorStore.getState().activeTabId).toBeNull();
  });

  it("cycles forward through tabs", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/a.ts"), makeTab("/b.ts"), makeTab("/c.ts")],
      activeTabId: "/a.ts",
    });
    useEditorStore.getState().cycleTab(1);
    expect(useEditorStore.getState().activeTabId).toBe("/b.ts");
    useEditorStore.getState().cycleTab(1);
    expect(useEditorStore.getState().activeTabId).toBe("/c.ts");
    useEditorStore.getState().cycleTab(1);
    expect(useEditorStore.getState().activeTabId).toBe("/a.ts");
  });

  it("cycles backward through tabs", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/a.ts"), makeTab("/b.ts"), makeTab("/c.ts")],
      activeTabId: "/a.ts",
    });
    useEditorStore.getState().cycleTab(-1);
    expect(useEditorStore.getState().activeTabId).toBe("/c.ts");
    useEditorStore.getState().cycleTab(-1);
    expect(useEditorStore.getState().activeTabId).toBe("/b.ts");
  });

  it("cycles correctly from last to first", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/a.ts"), makeTab("/b.ts")],
      activeTabId: "/b.ts",
    });
    useEditorStore.getState().cycleTab(1);
    expect(useEditorStore.getState().activeTabId).toBe("/a.ts");
  });
});

describe("editorStore updateContent", () => {
  it("updates content and marks tab as dirty", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/a.ts", { savedContent: "original", currentContent: "original" })],
      activeTabId: "/a.ts",
    });
    useEditorStore.getState().updateContent("/a.ts", "modified");
    const tab = useEditorStore.getState().openTabs[0];
    expect(tab.currentContent).toBe("modified");
    expect(tab.isDirty).toBe(true);
  });

  it("resets dirty flag when content matches saved", () => {
    useEditorStore.setState({
      openTabs: [
        makeTab("/a.ts", { savedContent: "text", currentContent: "modified", isDirty: true }),
      ],
      activeTabId: "/a.ts",
    });
    useEditorStore.getState().updateContent("/a.ts", "text");
    expect(useEditorStore.getState().openTabs[0].isDirty).toBe(false);
  });
});

describe("editorStore setCursor", () => {
  it("sets cursor position for a tab", () => {
    useEditorStore.setState({
      openTabs: [makeTab("/a.ts")],
      activeTabId: "/a.ts",
    });
    useEditorStore.getState().setCursor("/a.ts", 10, 5);
    expect(useEditorStore.getState().openTabs[0].cursor).toEqual({ line: 10, col: 5 });
  });
});
