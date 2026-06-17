import { Moon, Sun, Palette, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/uiStore";
import { useHotkey } from "@/hooks/useHotkey";
import { cn } from "@/lib/utils";
import type { Theme } from "@/types/ui";

interface ThemeToggleProps {
  className?: string;
}

const THEME_LABELS: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
  "catppuccin-mocha": "Catppuccin Mocha",
  spiderman: "Spiderman",
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  useHotkey({
    combo: "mod+shift+t",
    description: "Toggle theme",
    handler: toggleTheme,
  });

  const nextLabel: Record<Theme, string> = {
    dark: "Light",
    light: "Catppuccin Mocha",
    "catppuccin-mocha": "Spiderman",
    spiderman: "Dark",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Current: ${THEME_LABELS[theme]}, switch to ${nextLabel[theme]}`}
          onClick={toggleTheme}
          className={cn(className)}
        >
          {theme === "spiderman" ? (
            <Bug className="size-4" />
          ) : theme === "catppuccin-mocha" ? (
            <Palette className="size-4" />
          ) : theme === "dark" ? (
            <Moon className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {THEME_LABELS[theme]} → {nextLabel[theme]} (Ctrl+Shift+T)
      </TooltipContent>
    </Tooltip>
  );
}
