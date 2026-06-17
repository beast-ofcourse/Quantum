export interface ThemeDefinition {
  name: string;
  type: "dark" | "light";
  colors: Partial<Record<string, string>>;
  tokenColors?: TokenColorEntry[];
  terminal?: Record<string, string>;
  semanticHighlighting?: boolean;
}

export interface TokenColorEntry {
  name?: string;
  scope: string | string[];
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
}

export type ThemeColorKey = string;
