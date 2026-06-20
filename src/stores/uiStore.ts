import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FocusPanel, Theme } from "@/types/ui";
import type { DockZone, PanelId, Zones } from "@/types/panelRegistry";
import type { PresetZones } from "@/lib/layoutPresets";
import { DEFAULT_ZONES, getPanel } from "@/lib/panelRegistry";
import { BUILT_IN_PRESETS, BUILT_IN_PRESET_NAMES } from "@/lib/layoutPresets";
import { ThemeService } from "@/lib/themeService";

export const PANEL_CONSTRAINTS = {
  sidebar: { minSize: 160, maxSize: 480, defaultSize: 260 } as const,
  terminal: { minSize: 100, maxSize: 600, defaultSize: 220 } as const,
} as const;

interface UiState {
  zones: Zones;
  detachedWindows: Record<PanelId, string>;
  savedPresets: Record<string, PresetZones>;

  activePanel: FocusPanel;
  theme: Theme;

  sidebarPosition: "left" | "right";
  panelAlignment: "left" | "center" | "right" | "justify";
  menuBarVisible: boolean;
  activityBarVisible: boolean;
  statusBarVisible: boolean;
  shortcutCheatSheetOpen: boolean;

  setZoneVisibility: (zone: DockZone, visible: boolean) => void;
  toggleZone: (zone: DockZone) => void;
  setZoneSize: (zone: DockZone, size: number) => void;
  setActivePanelInZone: (zone: DockZone, panelId: PanelId) => void;
  movePanel: (panelId: PanelId, from: DockZone, to: DockZone) => void;
  togglePanel: (panelId: PanelId) => void;

  removePanelFromDock: (panelId: PanelId, zone: DockZone) => void;
  attachPanelToDock: (panelId: PanelId, zone: DockZone) => void;

  registerDetachedWindow: (panelId: PanelId, label: string) => void;
  unregisterDetachedWindow: (panelId: PanelId) => void;

  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;

  setActivePanel: (panel: FocusPanel) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  setSidebarPosition: (pos: "left" | "right") => void;
  setPanelAlignment: (align: "left" | "center" | "right" | "justify") => void;
  setMenuBarVisible: (v: boolean) => void;
  setActivityBarVisible: (v: boolean) => void;
  setStatusBarVisible: (v: boolean) => void;
  setShortcutCheatSheetOpen: (v: boolean) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const ZONE_CONSTRAINTS: Record<DockZone, { minSize: number; maxSize: number }> = {
  left: { minSize: 160, maxSize: 480 },
  right: { minSize: 160, maxSize: 480 },
  bottom: { minSize: 100, maxSize: 600 },
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      zones: {
        left: { ...DEFAULT_ZONES.left, panelIds: [...DEFAULT_ZONES.left.panelIds] },
        right: { ...DEFAULT_ZONES.right, panelIds: [...DEFAULT_ZONES.right.panelIds] },
        bottom: { ...DEFAULT_ZONES.bottom, panelIds: [...DEFAULT_ZONES.bottom.panelIds] },
      },

      detachedWindows: {},

      savedPresets: {},

      activePanel: "editor",
      theme: "dark",
      sidebarPosition: "left",
      panelAlignment: "justify",
      menuBarVisible: true,
      activityBarVisible: true,
      statusBarVisible: true,
      shortcutCheatSheetOpen: false,

      setZoneVisibility: (zone, visible) =>
        set((s) => ({
          zones: {
            ...s.zones,
            [zone]: { ...s.zones[zone], isVisible: visible },
          },
        })),

      toggleZone: (zone) =>
        set((s) => ({
          zones: {
            ...s.zones,
            [zone]: { ...s.zones[zone], isVisible: !s.zones[zone].isVisible },
          },
        })),

      setZoneSize: (zone, size) =>
        set((s) => {
          const c = ZONE_CONSTRAINTS[zone];
          return {
            zones: {
              ...s.zones,
              [zone]: {
                ...s.zones[zone],
                size: clamp(size, c.minSize, c.maxSize),
              },
            },
          };
        }),

      setActivePanelInZone: (zone, panelId) =>
        set((s) => ({
          zones: {
            ...s.zones,
            [zone]: { ...s.zones[zone], activePanelId: panelId },
          },
        })),

      movePanel: (panelId, from, to) =>
        set((s) => {
          if (from === to) return s;

          const fromDock = s.zones[from];
          const toDock = s.zones[to];

          const newFromIds = fromDock.panelIds.filter((id) => id !== panelId);
          const newToIds = [...toDock.panelIds, panelId];

          const newFromActive =
            fromDock.activePanelId === panelId
              ? newFromIds.length > 0
                ? newFromIds[newFromIds.length - 1]
                : null
              : fromDock.activePanelId;

          const newToActive = toDock.activePanelId ?? panelId;

          const newZones = { ...s.zones };

          newZones[from] = {
            ...fromDock,
            panelIds: newFromIds,
            activePanelId: newFromActive,
            isVisible: newFromIds.length > 0,
          };

          newZones[to] = {
            ...toDock,
            panelIds: newToIds,
            activePanelId: newToActive,
            isVisible: true,
          };

          return { zones: newZones };
        }),

      togglePanel: (panelId) =>
        set((s) => {
          const zones = s.zones;
          for (const zone of ["left", "right", "bottom"] as DockZone[]) {
            const dock = zones[zone];
            if (dock.panelIds.includes(panelId)) {
              const isActive = dock.activePanelId === panelId && dock.isVisible;
              return {
                zones: {
                  ...zones,
                  [zone]: {
                    ...dock,
                    activePanelId: panelId,
                    isVisible: !isActive,
                  },
                },
              };
            }
          }
          const def = getPanel(panelId);
          if (!def) return s;
          const target = def.defaultZone;
          const targetDock = zones[target];
          return {
            zones: {
              ...zones,
              [target]: {
                ...targetDock,
                panelIds: [...targetDock.panelIds, panelId],
                activePanelId: panelId,
                isVisible: true,
              },
            },
          };
        }),

      removePanelFromDock: (panelId, zone) =>
        set((s) => {
          const dock = s.zones[zone];
          const newIds = dock.panelIds.filter((id) => id !== panelId);
          const newActive = dock.activePanelId === panelId
            ? newIds.length > 0 ? newIds[newIds.length - 1] : null
            : dock.activePanelId;
          return {
            zones: {
              ...s.zones,
              [zone]: { ...dock, panelIds: newIds, activePanelId: newActive, isVisible: newIds.length > 0 },
            },
          };
        }),

      attachPanelToDock: (panelId, zone) =>
        set((s) => {
          const dock = s.zones[zone];
          if (dock.panelIds.includes(panelId)) return s;
          return {
            zones: {
              ...s.zones,
              [zone]: { ...dock, panelIds: [...dock.panelIds, panelId], activePanelId: dock.activePanelId ?? panelId, isVisible: true },
            },
          };
        }),

      registerDetachedWindow: (panelId, label) =>
        set((s) => ({ detachedWindows: { ...s.detachedWindows, [panelId]: label } })),

      unregisterDetachedWindow: (panelId) =>
        set((s) => {
          const { [panelId]: _unused, ...rest } = s.detachedWindows;
          void _unused;
          return { detachedWindows: rest };
        }),

      savePreset: (name) =>
        set((s) => {
          const { left, right, bottom } = s.zones;
          return { savedPresets: { ...s.savedPresets, [name]: { left, right, bottom } } };
        }),

      loadPreset: (name) => {
        const preset = BUILT_IN_PRESETS[name]?.() ?? useUiStore.getState().savedPresets[name];
        if (preset) {
          set({ zones: { left: { ...preset.left, panelIds: [...preset.left.panelIds] }, right: { ...preset.right, panelIds: [...preset.right.panelIds] }, bottom: { ...preset.bottom, panelIds: [...preset.bottom.panelIds] } } });
        }
      },

      deletePreset: (name) =>
        set((s) => {
          if (BUILT_IN_PRESET_NAMES.includes(name)) return s;
          const { [name]: _unused, ...rest } = s.savedPresets;
          void _unused;
          return { savedPresets: rest };
        }),

      setActivePanel: (panel) => set({ activePanel: panel }),

      setTheme: (theme) => {
        set({ theme });
        ThemeService.applyTheme(theme);
      },

      toggleTheme: () => {
        const order: Theme[] = ["dark", "light", "catppuccin-mocha", "spiderman"];
        const current = useUiStore.getState().theme;
        const idx = order.indexOf(current);
        const next = order[(idx + 1) % order.length];
        set({ theme: next });
        ThemeService.applyTheme(next);
      },

      setSidebarPosition: (pos) => set({ sidebarPosition: pos }),
      setPanelAlignment: (align) => set({ panelAlignment: align }),
      setMenuBarVisible: (v) => set({ menuBarVisible: v }),
      setActivityBarVisible: (v) => set({ activityBarVisible: v }),
      setStatusBarVisible: (v) => set({ statusBarVisible: v }),
      setShortcutCheatSheetOpen: (v) => set({ shortcutCheatSheetOpen: v }),
    }),
    {
      name: "code-editor:ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        zones: state.zones,
        theme: state.theme,
        savedPresets: state.savedPresets,
        sidebarPosition: state.sidebarPosition,
        panelAlignment: state.panelAlignment,
        menuBarVisible: state.menuBarVisible,
        activityBarVisible: state.activityBarVisible,
        statusBarVisible: state.statusBarVisible,
      }),
    },
  ),
);
