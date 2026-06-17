import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";
import { ThemeService } from "@/lib/themeService";
import type { ThemeDefinition } from "@/types/theme";

export function useThemeManager() {
  const themeName = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const isBuiltin = ThemeService.isBuiltin(themeName);

  useEffect(() => {
    ThemeService.applyTheme(themeName);
  }, [themeName]);

  return {
    currentTheme: themeName,
    availableThemes: ThemeService.getAllThemes() as ThemeDefinition[],
    setTheme,
    isBuiltin,
  };
}
