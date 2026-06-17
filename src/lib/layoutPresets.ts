import type { DockState } from "@/types/panelRegistry";

export interface PresetZones {
  left: DockState;
  right: DockState;
  bottom: DockState;
}

export const BUILT_IN_PRESETS: Record<string, () => PresetZones> = {
  "Default": () => ({
    left: {
      panelIds: ["explorer", "search", "git", "extensions"],
      activePanelId: "explorer",
      size: 260,
      isVisible: true,
    },
    right: {
      panelIds: [],
      activePanelId: null,
      size: 260,
      isVisible: false,
    },
    bottom: {
      panelIds: ["terminal", "problems", "output", "debug-console"],
      activePanelId: "terminal",
      size: 220,
      isVisible: true,
    },
  }),

  "Minimal": () => ({
    left: { panelIds: [], activePanelId: null, size: 260, isVisible: false },
    right: { panelIds: [], activePanelId: null, size: 260, isVisible: false },
    bottom: { panelIds: [], activePanelId: null, size: 220, isVisible: false },
  }),

  "Git Review": () => ({
    left: { panelIds: ["explorer"], activePanelId: "explorer", size: 220, isVisible: true },
    right: { panelIds: ["git"], activePanelId: "git", size: 300, isVisible: true },
    bottom: { panelIds: [], activePanelId: null, size: 220, isVisible: false },
  }),
};

export const BUILT_IN_PRESET_NAMES: string[] = Object.keys(BUILT_IN_PRESETS);
