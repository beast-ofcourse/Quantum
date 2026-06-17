import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppSettings } from "@/types/settings";

interface SettingsStore extends AppSettings {
  update: <K extends keyof AppSettings>(
    section: K,
    values: Partial<AppSettings[K]>,
  ) => void;
  reset: () => void;
  zoom: (direction: "in" | "out" | "reset") => void;
}

const DEFAULTS: AppSettings = {
  general: { autoSave: false, autoSaveDelay: 1000 },
  editor: {
    fontSize: 13,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    tabSize: 2,
    wordWrap: "off",
    minimap: true,
    minimapScale: 1,
    formatOnSave: false,
    breadcrumbs: true,
    lineNumbers: "on",
    inlayHints: true,
  },
  terminal: {
    fontSize: 13,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  },
  search: { excludePatterns: ["node_modules", ".git", "dist", "build"], maxResults: 1000 },
};

const ZOOM_STEP = 1;
const ZOOM_MIN = 6;
const ZOOM_MAX = 48;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update: (section, values) =>
        set((s) => ({ [section]: { ...s[section], ...values } })),
      reset: () => set(DEFAULTS),
      zoom: (direction) =>
        set((s) => {
          const current = s.editor.fontSize;
          let next: number;
          if (direction === "in") next = Math.min(current + ZOOM_STEP, ZOOM_MAX);
          else if (direction === "out") next = Math.max(current - ZOOM_STEP, ZOOM_MIN);
          else next = DEFAULTS.editor.fontSize;
          return {
            editor: { ...s.editor, fontSize: next },
            terminal: { ...s.terminal, fontSize: next },
          };
        }),
    }),
    {
      name: "code-editor-settings",
      merge: (persisted, current) => {
        const p = persisted as Partial<SettingsStore> | undefined;
        if (!p) return current;
        // Deep merge each section so new defaults survive for existing users
        return {
          ...current,
          ...p,
          general: { ...current.general, ...p.general },
          editor: { ...current.editor, ...p.editor },
          terminal: { ...current.terminal, ...p.terminal },
          search: { ...current.search, ...p.search },
        };
      },
    },
  ),
);
