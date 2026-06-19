import { describe, it, expect, beforeEach, vi } from "vitest";

// Monaco Editor requires queryCommandSupported which is not in jsdom
if (typeof document.queryCommandSupported !== "function") {
  document.queryCommandSupported = () => false;
}

vi.mock("monaco-editor", () => ({
  Uri: { file: (p: string) => ({ path: p }) },
  editor: { getModel: () => null, getEditors: () => [], getModels: () => [], setModelMarkers: () => {} },
  MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
  languages: { getLanguages: () => [] },
  Position: class { constructor(public line: number, public column: number) {} },
}));

import { useUiStore } from "@/stores/uiStore";

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState(useUiStore.getInitialState());
});

describe("uiStore", () => {
  it("has initial zones matching DEFAULT_ZONES", () => {
    const state = useUiStore.getState();
    expect(state.zones.left.panelIds).toContain("explorer");
    expect(state.zones.left.activePanelId).toBe("explorer");
    expect(state.zones.left.size).toBe(260);
    expect(state.zones.left.isVisible).toBe(true);

    expect(state.zones.right.panelIds).toHaveLength(3);
    expect(state.zones.right.activePanelId).toBe("outline");
    expect(state.zones.right.size).toBe(260);
    expect(state.zones.right.isVisible).toBe(false);

    expect(state.zones.bottom.panelIds).toContain("terminal");
    expect(state.zones.bottom.activePanelId).toBe("terminal");
    expect(state.zones.bottom.size).toBe(220);
    expect(state.zones.bottom.isVisible).toBe(false);
  });

  it("has correct initial UI state values", () => {
    const state = useUiStore.getState();
    expect(state.theme).toBe("dark");
    expect(state.activePanel).toBe("editor");
    expect(state.sidebarPosition).toBe("left");
    expect(state.menuBarVisible).toBe(true);
    expect(state.activityBarVisible).toBe(true);
    expect(state.statusBarVisible).toBe(true);
  });

  it("togglePanel toggles visibility of an active panel in a zone", () => {
    useUiStore.getState().togglePanel("explorer");
    expect(useUiStore.getState().zones.left.isVisible).toBe(false);

    useUiStore.getState().togglePanel("explorer");
    expect(useUiStore.getState().zones.left.isVisible).toBe(true);
  });

  it("togglePanel sets activePanelId when panel is not the active one", () => {
    useUiStore.getState().setActivePanelInZone("left", "search");
    useUiStore.getState().togglePanel("explorer");
    expect(useUiStore.getState().zones.left.activePanelId).toBe("explorer");
  });

  it("setZoneVisibility sets visibility for a zone", () => {
    useUiStore.getState().setZoneVisibility("left", false);
    expect(useUiStore.getState().zones.left.isVisible).toBe(false);

    useUiStore.getState().setZoneVisibility("left", true);
    expect(useUiStore.getState().zones.left.isVisible).toBe(true);
  });

  it("setActivePanelInZone sets the active panel in a zone", () => {
    useUiStore.getState().setActivePanelInZone("left", "search");
    expect(useUiStore.getState().zones.left.activePanelId).toBe("search");
  });

  it("setActivePanel sets the main active panel", () => {
    useUiStore.getState().setActivePanel("terminal");
    expect(useUiStore.getState().activePanel).toBe("terminal");
  });

  it("setZoneSize clamps sidebar size to min 160", () => {
    useUiStore.getState().setZoneSize("left", 50);
    expect(useUiStore.getState().zones.left.size).toBe(160);
  });

  it("setZoneSize clamps sidebar size to max 480", () => {
    useUiStore.getState().setZoneSize("left", 999);
    expect(useUiStore.getState().zones.left.size).toBe(480);
  });

  it("setZoneSize clamps terminal/bottom size to min 100", () => {
    useUiStore.getState().setZoneSize("bottom", 10);
    expect(useUiStore.getState().zones.bottom.size).toBe(100);
  });

  it("setZoneSize clamps terminal/bottom size to max 600", () => {
    useUiStore.getState().setZoneSize("bottom", 999);
    expect(useUiStore.getState().zones.bottom.size).toBe(600);
  });

  it("setZoneSize allows valid sizes within range", () => {
    useUiStore.getState().setZoneSize("left", 300);
    expect(useUiStore.getState().zones.left.size).toBe(300);

    useUiStore.getState().setZoneSize("bottom", 350);
    expect(useUiStore.getState().zones.bottom.size).toBe(350);
  });

  it("toggleTheme cycles through themes", () => {
    expect(useUiStore.getState().theme).toBe("dark");
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe("light");
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe("catppuccin-mocha");
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe("spiderman");
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe("dark");
  });
});
