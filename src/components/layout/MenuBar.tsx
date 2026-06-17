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
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Keyboard } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ThemeService } from "@/lib/themeService";
import { pickFiles, pickFolder } from "@/tauri";
import { openAndCreateTerminalSession } from "@/lib/terminal-helpers";
import { ShortcutKey } from "./ShortcutKey";

export function MenuBar() {
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
  const setShortcutCheatSheetOpen = useUiStore((s) => s.setShortcutCheatSheetOpen);
  const setSidebarPosition = useUiStore((s) => s.setSidebarPosition);
  const setPanelAlignment = useUiStore((s) => s.setPanelAlignment);
  const setMenuBarVisible = useUiStore((s) => s.setMenuBarVisible);
  const setActivityBarVisible = useUiStore((s) => s.setActivityBarVisible);
  const setStatusBarVisible = useUiStore((s) => s.setStatusBarVisible);
  const minimap = useSettingsStore((s) => s.editor.minimap);
  const inlayHints = useSettingsStore((s) => s.editor.inlayHints);

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
    <Menubar className="rounded-none border-b border-border bg-muted/30">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onOpenFile}>
            <FileText className="size-4" />
            Open File…
            <MenubarShortcut><ShortcutKey commandId="file.open" /></MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onOpenFolder}>
            <FolderOpen className="size-4" />
            Open Folder…
            <MenubarShortcut><ShortcutKey commandId="file.openFolder" /></MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onSave} disabled={!activeTab}>
            <Save className="size-4" />
            Save
            <MenubarShortcut><ShortcutKey commandId="file.save" /></MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onCloseTab} disabled={!activeTab}>
            <X className="size-4" />
            Close Editor
            <MenubarShortcut><ShortcutKey commandId="file.closeEditor" /></MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cycleTab(1)} disabled={tabsCount < 2}>
            <ChevronsLeftRight className="size-4" />
            Cycle Tabs
            <MenubarShortcut><ShortcutKey commandId="file.cycleTabs" /></MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={closeFolder} disabled={!rootPath}>
            <X className="size-4" />
            Close Folder
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => toggleZone("left")}>
            <PanelLeft className="size-4" />
            Toggle Sidebar
            <MenubarShortcut><ShortcutKey commandId="view.toggleSidebar" /></MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            onClick={() => {
              toggleZone("bottom");
              setActivePanel("terminal");
            }}
          >
            <TerminalIcon className="size-4" />
            Toggle Terminal Panel
            <MenubarShortcut><ShortcutKey commandId="view.toggleTerminal" /></MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => setShortcutCheatSheetOpen(true)}>
            <Keyboard className="size-4" />
            Key Shortcuts
            <MenubarShortcut><ShortcutKey commandId="view.shortcuts" /></MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={minimap}
            onCheckedChange={(c) => useSettingsStore.getState().update("editor", { minimap: c })}
          >
            Minimap
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={inlayHints}
            onCheckedChange={(c) => useSettingsStore.getState().update("editor", { inlayHints: c })}
          >
            Inlay Hints
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Terminal</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onNewTerminal}>
            <Plus className="size-4" />
            New Terminal
            <MenubarShortcut><ShortcutKey commandId="terminal.new" /></MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>
          <LayoutIcon className="size-4" />
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
            <MenubarShortcut>
              {sidebarPosition === "left" ? "Right" : "Left"}
            </MenubarShortcut>
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
        <MenubarTrigger>Theme</MenubarTrigger>
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
