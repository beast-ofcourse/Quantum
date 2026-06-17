export const isTauri = (): boolean => {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
};

export const getPlatformModifier = (): string => {
  if (typeof navigator === "undefined") return "Ctrl";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "Cmd";
  return "Ctrl";
};

export const formatKeybinding = (keybinding: string): string => {
  const modifier = getPlatformModifier();
  return keybinding.replace(/^Ctrl/, modifier);
};
