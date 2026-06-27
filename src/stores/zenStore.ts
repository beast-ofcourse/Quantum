import { create } from "zustand";
import { useUiStore } from "@/stores/uiStore";

interface ZenSnapshot {
  leftVisible: boolean;
  rightVisible: boolean;
  bottomVisible: boolean;
  activityBarVisible: boolean;
  statusBarVisible: boolean;
  menuBarVisible: boolean;
}

interface ZenState {
  isZen: boolean;
  snapshot: ZenSnapshot | null;
  toggleZen: () => void;
  exitZen: () => void;
}

export const useZenStore = create<ZenState>((set, get) => ({
  isZen: false,
  snapshot: null,

  toggleZen: () => {
    const { isZen } = get();
    if (isZen) {
      get().exitZen();
      return;
    }

    const ui = useUiStore.getState();
    const snapshot: ZenSnapshot = {
      leftVisible: ui.zones.left.isVisible,
      rightVisible: ui.zones.right.isVisible,
      bottomVisible: ui.zones.bottom.isVisible,
      activityBarVisible: ui.activityBarVisible,
      statusBarVisible: ui.statusBarVisible,
      menuBarVisible: ui.menuBarVisible,
    };

    // Hide everything non-editor
    ui.setZoneVisibility("left", false);
    ui.setZoneVisibility("right", false);
    ui.setZoneVisibility("bottom", false);
    ui.setActivityBarVisible(false);
    ui.setStatusBarVisible(false);
    ui.setMenuBarVisible(false);

    set({ isZen: true, snapshot });
  },

  exitZen: () => {
    const { snapshot } = get();
    if (!snapshot) return;

    const ui = useUiStore.getState();
    ui.setZoneVisibility("left", snapshot.leftVisible);
    ui.setZoneVisibility("right", snapshot.rightVisible);
    ui.setZoneVisibility("bottom", snapshot.bottomVisible);
    ui.setActivityBarVisible(snapshot.activityBarVisible);
    ui.setStatusBarVisible(snapshot.statusBarVisible);
    ui.setMenuBarVisible(snapshot.menuBarVisible);

    set({ isZen: false, snapshot: null });
  },
}));
