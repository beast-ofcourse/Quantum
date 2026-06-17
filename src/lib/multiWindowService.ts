import type { PanelId, DockZone } from "@/types/panelRegistry";
import { useUiStore } from "@/stores/uiStore";
import { getPanel } from "@/lib/panelRegistry";
import { loadPanelWindowPos, savePanelWindowPos, clearPanelWindowPos } from "@/lib/panelWindowPositions";

interface DetachResult {
  success: boolean;
  label?: string;
}

let appUrl: string | null = null;

function getAppUrl(): string {
  if (appUrl) return appUrl;
  appUrl = `${window.location.origin}${window.location.pathname}`;
  return appUrl;
}

export async function detachPanel(panelId: PanelId, fromZone: DockZone): Promise<DetachResult> {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    if (!WebviewWindow) return { success: false };
  } catch {
    return { success: false };
  }

  const def = getPanel(panelId);
  if (!def) return { success: false };

  const state = useUiStore.getState();
  state.removePanelFromDock(panelId, fromZone);

  const saved = loadPanelWindowPos(panelId);
  const label = `panel-${panelId}`;

  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const webview = new WebviewWindow(label, {
      url: `${getAppUrl()}?panel=${panelId}`,
      title: def.title,
      width: saved?.width ?? 500,
      height: saved?.height ?? 400,
      x: saved?.x,
      y: saved?.y,
      center: !saved,
      decorations: false,
    });

    webview.once("tauri://created", () => {
      state.registerDetachedWindow(panelId, label);
    });

    webview.once("tauri://error", () => {
      state.attachPanelToDock(panelId, fromZone);
    });

    return { success: true, label };
  } catch {
    state.attachPanelToDock(panelId, fromZone);
    return { success: false };
  }
}

export async function attachPanel(panelId: PanelId, toZone: DockZone): Promise<boolean> {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

    const label = `panel-${panelId}`;
    try {
      const win = await WebviewWindow.getByLabel(label);
      if (win) await win.close();
    } catch {
      // window might not exist
    }

    clearPanelWindowPos(panelId);
    useUiStore.getState().attachPanelToDock(panelId, toZone);
    useUiStore.getState().unregisterDetachedWindow(panelId);
    return true;
  } catch {
    return false;
  }
}

export async function focusDetachedPanel(panelId: PanelId): Promise<void> {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = `panel-${panelId}`;
    const win = await WebviewWindow.getByLabel(label);
    if (win) {
      await win.setFocus();
    } else {
      useUiStore.getState().unregisterDetachedWindow(panelId);
      useUiStore.getState().togglePanel(panelId);
    }
  } catch {
    useUiStore.getState().unregisterDetachedWindow(panelId);
    useUiStore.getState().togglePanel(panelId);
  }
}

export async function setupPanelWindowGeometryTracking(panelId: PanelId): Promise<() => void> {
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = getCurrentWebviewWindow();

    const unlistenResized = await win.onResized(({ payload }) => {
      const saved = loadPanelWindowPos(panelId);
      savePanelWindowPos(panelId, {
        x: saved?.x ?? 0,
        y: saved?.y ?? 0,
        width: payload.width,
        height: payload.height,
      });
    });

    const unlistenMoved = await win.onMoved(({ payload }) => {
      const saved = loadPanelWindowPos(panelId);
      savePanelWindowPos(panelId, {
        x: payload.x,
        y: payload.y,
        width: saved?.width ?? 500,
        height: saved?.height ?? 400,
      });
    });

    return () => {
      unlistenResized();
      unlistenMoved();
    };
  } catch {
    return () => {};
  }
}

export async function listenForAppClose(): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<void>("app-closing", async () => {
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        await getCurrentWebviewWindow().close();
      } catch { /* window might not exist */ }
    });
    return unlisten;
  } catch {
    return () => {};
  }
}

export async function emitAppClosing(): Promise<void> {
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().emit("app-closing");
  } catch { /* window might not exist */ }
}
