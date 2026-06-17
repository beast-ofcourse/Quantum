import type { ComponentType } from "react";

export type DockZone = "left" | "right" | "bottom";

export type PanelId = string;

export interface DockState {
  panelIds: PanelId[];
  activePanelId: PanelId | null;
  size: number;
  isVisible: boolean;
}

export interface Zones {
  left: DockState;
  right: DockState;
  bottom: DockState;
}

export interface PanelDefinition {
  id: PanelId;
  title: string;
  icon: ComponentType<{ className?: string }>;
  component: ComponentType;
  defaultZone: DockZone;
  showInActivityBar?: boolean;
}
