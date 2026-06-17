"use client"

import {
  FileText,
  FolderOpen,
  Save,
  X,
  PanelLeft,
  Terminal as TerminalIcon,
  Plus,
  Sun,
  Moon,
  Palette,
  ChevronsLeftRight,
  Layout as LayoutIcon,
  Keyboard,
} from "lucide-react";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ThemeService } from "@/lib/themeService";
import { pickFiles, pickFolder } from "@/tauri";
import { openAndCreateTerminalSession } from "@/lib/terminal-helpers";

export function TitleBarMenus() {
  const toggleZone = useUiStore((s) => s.toggleZone);
  const setZoneVisibility = useUiStore((s) => s.setZoneVisibility);
  const setActivePanel = useUiStore((s) => s.setActivePanel);

  const openFiles = useFileStore((s) => s.openFiles);
  const openFolder = useFileStore((s) => s.openFolder);
  const closeFolder = useFileStore((s) => s.closeFolder);
  const rootPath = useFileStore((s) => s.rootPath);

  const activeTab = useEditorStore((s) => s.getActiveTab());
  const tabsCount = useEditorStore((s) => s.openTabs.length);
  const saveFile = useEditorStore((s) => s.saveFile);
  const closeTab = useEditorStore((s) => s.closeTab);
  const cycleTab = useEditorStore((s) => s.cycleTab);

  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const sidebarPosition = useUiStore((s) => s.sidebarPosition);
  const panelAlignment = useUiStore((s) => s.panelAlignment);
  const menuBarVisible = useUiStore((s) => s.menuBarVisible);
  const activityBarVisible = useUiStore((s) => s.activityBarVisible);
  const statusBarVisible = useUiStore((s) => s.statusBarVisible);
  const setSidebarPosition = useUiStore((s) => s.setSidebarPosition);
  const setPanelAlignment = useUiStore((s) => s.setPanelAlignment);
  const setMenuBarVisible = useUiStore((s) => s.setMenuBarVisible);
  const setActivityBarVisible = useUiStore((s) => s.setActivityBarVisible);
  const setStatusBarVisible = useUiStore((s) => s.setStatusBarVisible);
  const setShortcutCheatSheetOpen = useUiStore((s) => s.setShortcutCheatSheetOpen);
  const minimap = useSettingsStore((s) => s.editor.minimap);

  const onOpenFile = async () => {
    const picked = await pickFiles({ title: "Open File" });
    if (picked && picked.length > 0) {
      await openFiles(picked);
    }
  };

  const onOpenFolder = async () => {
    const picked = await pickFolder();
    if (picked) {
      await openFolder(picked);
      setZoneVisibility("left", true);
    }
  };

  const onSave = () => {
    if (activeTab) void saveFile(activeTab.id);
  };

  const onCloseTab = () => {
    if (activeTab) void closeTab(activeTab.id);
  };

  const onNewTerminal = () => {
    void openAndCreateTerminalSession();
  };

  return (
    <Menubar className="h-full rounded-none border-none bg-transparent p-0">
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-0.5 text-xs data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
          File
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onOpenFile}>
            <FileText className="size-4" />
            Open File…
          </MenubarItem>
          <MenubarItem onClick={onOpenFolder}>
            <FolderOpen className="size-4" />
            Open Folder…
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onSave} disabled={!activeTab}>
            <Save className="size-4" />
            Save
          </MenubarItem>
          <MenubarItem onClick={onCloseTab} disabled={!activeTab}>
            <X className="size-4" />
            Close Editor
          </MenubarItem>
          <MenubarItem onClick={() => cycleTab(1)} disabled={tabsCount < 2}>
            <ChevronsLeftRight className="size-4" />
            Cycle Tabs
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={closeFolder} disabled={!rootPath}>
            <X className="size-4" />
            Close Folder
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 py-0.5 text-xs data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
          View
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => toggleZone("left")}>
            <PanelLeft className="size-4" />
            Toggle Sidebar
          </MenubarItem>
          <MenubarItem
            onClick={() => {
              toggleZone("bottom");
              setActivePanel("terminal");
            }}
          >
            <TerminalIcon className="size-4" />
            Toggle Terminal Panel
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => setShortcutCheatSheetOpen(true)}>
            <Keyboard className="size-4" />
            Key Shortcuts
          </MenubarItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={minimap}
            onCheckedChange={(c) => useSettingsStore.getState().update("editor", { minimap: c })}
          >
            Minimap
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={useSettingsStore.getState().editor.inlayHints}
            onCheckedChange={(c) => useSettingsStore.getState().update("editor", { inlayHints: c })}
          >
            Inlay Hints
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 py-0.5 text-xs data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
          Terminal
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onNewTerminal}>
            <Plus className="size-4" />
            New Terminal
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 py-0.5 text-xs data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
          Layout
        </MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem
            checked={menuBarVisible}
            onCheckedChange={() => setMenuBarVisible(!menuBarVisible)}
          >
            Menu Bar
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={activityBarVisible}
            onCheckedChange={() => setActivityBarVisible(!activityBarVisible)}
          >
            Activity Bar
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={statusBarVisible}
            onCheckedChange={() => setStatusBarVisible(!statusBarVisible)}
          >
            Status Bar
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem
            onClick={() => setSidebarPosition(
              sidebarPosition === "left" ? "right" : "left"
            )}
          >
            <LayoutIcon className="size-4" />
            Toggle Sidebar Position
          </MenubarItem>
          <MenubarSeparator />
          <MenubarRadioGroup
            value={panelAlignment}
            onValueChange={(v) => setPanelAlignment(v as "left" | "center" | "right" | "justify")}
          >
            <MenubarRadioItem value="left">Left</MenubarRadioItem>
            <MenubarRadioItem value="center">Center</MenubarRadioItem>
            <MenubarRadioItem value="right">Right</MenubarRadioItem>
            <MenubarRadioItem value="justify">Justify</MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 py-0.5 text-xs data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
          Theme
        </MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v)}
          >
            {ThemeService.getAllThemes().map((t) => (
              <MenubarRadioItem key={t.name} value={t.name}>
                {t.name === "light" ? <Sun className="size-4" /> :
                 t.name === "dark" ? <Moon className="size-4" /> :
                 t.name === "catppuccin-mocha" ? <Palette className="size-4" /> :
                 <Palette className="size-4" />}
                {t.name === "catppuccin-mocha" ? "Catppuccin Mocha" :
                 t.name.charAt(0).toUpperCase() + t.name.slice(1)}
              </MenubarRadioItem>
            ))}
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
