export type Theme = "light" | "dark" | "catppuccin-mocha" | "spiderman" | (string & {});

export type FocusPanel = "editor" | "explorer" | "terminal";

export type SidebarView = "explorer" | "search" | "git" | "extensions" | `ext:${string}`;

export interface PanelConstraints {
  minSize: number;
  maxSize: number;
  defaultSize: number;
}
