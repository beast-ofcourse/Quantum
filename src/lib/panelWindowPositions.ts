import type { PanelId } from "@/types/panelRegistry";

interface PanelWindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STORAGE_KEY = "quantum-panel-window-geometry";

function getStore(): Record<string, PanelWindowGeometry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setStore(data: Record<string, PanelWindowGeometry>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function savePanelWindowPos(panelId: PanelId, geo: PanelWindowGeometry): void {
  const store = getStore();
  store[panelId] = geo;
  setStore(store);
}

export function loadPanelWindowPos(panelId: PanelId): PanelWindowGeometry | null {
  const store = getStore();
  return store[panelId] ?? null;
}

export function clearPanelWindowPos(panelId: PanelId): void {
  const store = getStore();
  delete store[panelId];
  setStore(store);
}
