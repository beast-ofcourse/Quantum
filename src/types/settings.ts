export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
  minimap: boolean;
  minimapScale: number;
  formatOnSave: boolean;
  breadcrumbs: boolean;
  lineNumbers: "on" | "off" | "relative";
  inlayHints: boolean;
}

export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
}

export interface SearchSettings {
  excludePatterns: string[];
  maxResults: number;
}

export interface AppSettings {
  general: {
    autoSave: boolean;
    autoSaveDelay: number;
  };
  editor: EditorSettings;
  terminal: TerminalSettings;
  search: SearchSettings;
}
