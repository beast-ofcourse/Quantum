import * as monaco from "@/lib/monaco-entry";
import type { editor } from "@/lib/monaco-entry";
import type { ThemeDefinition } from "@/types/theme";
import { BUILTIN_THEMES } from "@/lib/builtinThemes";

const BUILTIN_NAMES = new Set(BUILTIN_THEMES.map((t) => t.name));
const registeredMonacoThemes = new Set<string>();
const customCSSVars = new Set<string>();

const MONACO_COLOR_KEYS = [
  "editor.background", "editor.foreground",
  "editorLineNumber.foreground", "editorLineNumber.activeForeground",
  "editorCursor.foreground", "editor.selectionBackground",
  "editor.lineHighlightBackground", "editorIndentGuide.background1",
  "editorIndentGuide.activeBackground1", "editorWidget.background",
  "editorWidget.border", "editorSuggestWidget.background",
  "editorSuggestWidget.border", "editorSuggestWidget.selectedBackground",
];

export class ThemeService {
  private static themes: Map<string, ThemeDefinition> = new Map();

  static init(): void {
    if (ThemeService.themes.size > 0) return;
    for (const t of BUILTIN_THEMES) {
      ThemeService.themes.set(t.name, t);
      const def = t;
      const base = def.type === "dark" ? "vs-dark" as const : "vs" as const;
      const themeId = `quantum-${def.name}`;
      const colors: Record<string, string> = {};
      for (const key of MONACO_COLOR_KEYS) {
        const val = def.colors[key];
        if (val) colors[key] = val;
      }
      const themeData: editor.IStandaloneThemeData = {
        base,
        inherit: true,
        rules: [],
        colors,
      };
      monaco.editor.defineTheme(themeId, themeData);
      registeredMonacoThemes.add(themeId);
    }
  }

  static registerTheme(def: ThemeDefinition): void {
    ThemeService.themes.set(def.name, def);
  }

  static getAllThemes(): ThemeDefinition[] {
    ThemeService.init();
    return Array.from(ThemeService.themes.values());
  }

  static getTheme(name: string): ThemeDefinition | undefined {
    ThemeService.init();
    return ThemeService.themes.get(name);
  }

  static isBuiltin(name: string): boolean {
    return BUILTIN_NAMES.has(name);
  }

  static applyTheme(name: string): void {
    ThemeService.init();
    const def = ThemeService.getTheme(name) ?? ThemeService.getTheme("dark")!;
    if (!def) return;

    const root = document.documentElement;

    for (const key of customCSSVars) {
      root.style.removeProperty(key);
    }
    customCSSVars.clear();

    if (ThemeService.isBuiltin(name)) {
      root.classList.remove("dark", "catppuccin-mocha", "spiderman");
      if (name !== "light") {
        root.classList.add(name);
      }
      root.style.colorScheme = def.type;
    } else {
      root.classList.remove("dark", "catppuccin-mocha", "spiderman");
      root.style.colorScheme = def.type;
      const vars = ThemeService.toCSSVars(def);
      for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value);
        customCSSVars.add(key);
      }
    }

    ThemeService.applyMonacoTheme(def);
  }

  static toCSSVars(def: ThemeDefinition): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(def.colors)) {
      if (value) {
        const cssName = key.replace(/\./g, "-");
        vars[`--${cssName}`] = value;
      }
    }
    return vars;
  }

  static applyMonacoTheme(def: ThemeDefinition): void {
    const base = def.type === "dark" ? "vs-dark" as const : "vs" as const;
    const themeId = `quantum-${def.name}`;

    const colors: Record<string, string> = {};
    for (const key of MONACO_COLOR_KEYS) {
      const val = def.colors[key];
      if (val) colors[key] = val;
    }

    const themeData: editor.IStandaloneThemeData = {
      base,
      inherit: true,
      rules: (def.tokenColors ?? []).flatMap((tc) => {
        const scopes = Array.isArray(tc.scope) ? tc.scope : [tc.scope];
        return scopes.map((s) => ({
          token: s,
          foreground: tc.settings.foreground,
          background: tc.settings.background,
          fontStyle: tc.settings.fontStyle,
        }));
      }),
      colors,
    };

    if (registeredMonacoThemes.has(themeId)) {
      monaco.editor.defineTheme(themeId, themeData);
    } else {
      monaco.editor.defineTheme(themeId, themeData);
      registeredMonacoThemes.add(themeId);
    }

    monaco.editor.setTheme(themeId);
  }

  static toMonacoThemeId(name: string): string {
    return `quantum-${name}`;
  }

  static getTerminalTheme(name: string): Record<string, string> | undefined {
    const def = ThemeService.getTheme(name);
    return def?.terminal;
  }
}

ThemeService.init();
