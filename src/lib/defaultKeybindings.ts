export interface DefaultKeybinding {
  combo: string;
  description: string;
  category: string;
}

export const DEFAULT_KEYBINDINGS: Record<string, DefaultKeybinding> = {
  "file.open": { combo: "mod+o", description: "Open File", category: "File" },
  "file.save": { combo: "mod+s", description: "Save", category: "File" },
  "file.saveAll": { combo: "", description: "Save All", category: "File" },
  "file.openFolder": { combo: "mod+k", description: "Open Folder", category: "File" },
  "file.closeEditor": { combo: "mod+w", description: "Close Editor", category: "File" },
  "file.cycleTabs": { combo: "mod+tab", description: "Cycle Tabs", category: "File" },
  "view.toggleSidebar": { combo: "mod+b", description: "Toggle Sidebar", category: "View" },
  "view.toggleTerminal": { combo: "mod+`", description: "Toggle Terminal", category: "View" },
  "view.commandPalette": { combo: "mod+shift+p", description: "Command Palette", category: "View" },
  "view.settings": { combo: "mod+,", description: "Settings", category: "View" },
  "view.shortcuts": { combo: "mod+alt+k", description: "Keyboard Shortcuts", category: "View" },
  "view.search": { combo: "mod+shift+f", description: "Search", category: "View" },
  "view.git": { combo: "mod+shift+g", description: "Source Control", category: "View" },
  "view.explorer": { combo: "mod+shift+e", description: "Show Explorer", category: "View" },
  "view.toggleMenuBar": { combo: "alt", description: "Toggle Menu Bar", category: "View" },
  "view.toggleActivityBar": { combo: "", description: "Toggle Activity Bar", category: "View" },
  "view.toggleStatusBar": { combo: "", description: "Toggle Status Bar", category: "View" },
  "view.toggleSidebarPosition": { combo: "", description: "Toggle Sidebar Position", category: "View" },
  "terminal.new": { combo: "mod+shift+`", description: "New Terminal", category: "Terminal" },
  "theme.edit": { combo: "", description: "Theme: Open Editor", category: "View" },
};

export function getDefaultCombo(commandId: string): string {
  return DEFAULT_KEYBINDINGS[commandId]?.combo ?? "";
}
