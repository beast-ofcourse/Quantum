import type React from "react";

export interface CommandDefinition {
  id: string;
  label: string;
  category: CommandCategory;
  keybinding?: string;
  icon?: React.ReactNode;
  action: () => void;
  enabled?: boolean;
}

export type CommandCategory =
  | "File"
  | "Edit"
  | "View"
  | "Terminal"
  | "Git"
  | "Debug"
  | "Help"
  | "Settings"
  | "Extension"
  | "Layout";
