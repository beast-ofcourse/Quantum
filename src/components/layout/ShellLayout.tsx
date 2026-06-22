import { useEffect, useState, useCallback, useRef } from "react";
import { ActivityBar } from "@/components/layout/ActivityBar";
import { Dock } from "@/components/layout/Dock";
import { EditorArea } from "@/components/layout/EditorArea";

import { Resizer } from "@/components/layout/Resizer";
import { StatusBar } from "@/components/layout/StatusBar";
import { TitleBar } from "@/components/layout/TitleBar";
import { CommandPalette } from "@/components/command/CommandPalette";
import { useSearchStore } from "@/stores/searchStore";
import { ShortcutCheatSheet } from "@/components/command/ShortcutCheatSheet";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { ThemeEditor } from "@/components/theme/ThemeEditor";
import { ToastContainer } from "@/components/extensions/ToastContainer";
import { QuickPickModal } from "@/components/extensions/QuickPickModal";
import { useHotkey } from "@/hooks/useHotkey";
import { getCurrentEditor } from "@/extensions/editorRef";
import { useTerminalHotkeys } from "@/hooks/useTerminalHotkeys";
import { useZoomHotkeys } from "@/hooks/useZoomHotkeys";
import { useUiStore } from "@/stores/uiStore";
import { useFileStore } from "@/stores/fileStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { useThemeManager } from "@/hooks/useThemeManager";
import { useCursorTrail } from "@/hooks/useCursorTrail";
import { pickFiles } from "@/tauri";
import { cn } from "@/lib/utils";
import { formatKeybinding } from "@/lib/platform";
import { registerCommandProvider } from "@/lib/commandRegistry";
import { useToastStore } from "@/stores/toastStore";
import { useModalStore } from "@/stores/modalStore";
import { useDebugStore } from "@/stores/debugStore";
import { DebugConfigurationService } from "@/lib/debugConfiguration";
import { loadSession, saveSession } from "@/lib/sessionRestore";
import { BUILT_IN_PRESET_NAMES } from "@/lib/layoutPresets";
import type { CommandDefinition } from "@/types/commands";

export function ShellLayout() {
  const zones = useUiStore((s) => s.zones);
  const toggleZone = useUiStore((s) => s.toggleZone);
  const setZoneSize = useUiStore((s) => s.setZoneSize);
  const setActivePanelInZone = useUiStore((s) => s.setActivePanelInZone);
  const sidebarPosition = useUiStore((s) => s.sidebarPosition);
  const panelAlignment = useUiStore((s) => s.panelAlignment);
  const bottomMaximized = useUiStore((s) => s.bottomMaximized);

  const activityBarVisible = useUiStore((s) => s.activityBarVisible);
  const statusBarVisible = useUiStore((s) => s.statusBarVisible);

  const [commandOpen, setCommandOpen] = useState(false);
  // QuickOpen removed — unified search bar in TitleBar handles it
  const [settingsOpen, setSettingsOpen] = useState(false);
  const shortcutOpen = useUiStore((s) => s.shortcutCheatSheetOpen);
  const setShortcutOpen = useUiStore((s) => s.setShortcutCheatSheetOpen);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);

  useThemeManager();
  useCursorTrail(".editor-area");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("code-editor-root");
    return () => root.classList.remove("code-editor-root");
  }, []);

  // Session restore: reopen tabs from previous session
  useEffect(() => {
    const session = loadSession();
    if (!session || session.tabs.length === 0) return;

    const store = useEditorStore.getState();
    const addToast = useToastStore.getState().addToast;

    // Sequential to avoid race on shared Zustand state
    (async () => {
      let failures = 0;
      for (const t of session.tabs) {
        try {
          await store.openFile(t.path);
        } catch {
          failures++;
        }
      }

      if (failures > 0) {
        addToast("warn", `${failures} file(s) could not be restored from previous session`);
      }

      // Restore active tab
      if (session.activeTabId) {
        store.setActiveTab(session.activeTabId);
      }
      // Restore cursor positions
      for (const t of session.tabs) {
        store.setCursor(t.path, t.cursor.line, t.cursor.col);
      }
    })();
  }, []);

  // Debounced session save — only on tab structure changes, not keystrokes
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastTabKeyRef = useRef("");
  useEffect(() => {
    const unsub = useEditorStore.subscribe((state) => {
      // Build a key from tab IDs + active tab to detect structural changes
      const key = state.openTabs.map((t) => t.id).join(",") + "|" + state.activeTabId;
      if (key === lastTabKeyRef.current) return;
      lastTabKeyRef.current = key;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveSession(state.openTabs, state.activeTabId);
      }, 1000);
    });
    return () => {
      unsub();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useHotkey({
    combo: "mod+b",
    commandId: "view.toggleSidebar",
    description: "Toggle sidebar",
    handler: () => toggleZone("left"),
  });
  useHotkey({
    combo: "mod+o",
    commandId: "file.open",
    description: "Open file",
    handler: async () => {
      const picked = await pickFiles({ title: "Open File" });
      if (picked && picked.length > 0) {
        await useFileStore.getState().openFiles(picked);
      }
    },
  });
  useHotkey({
    combo: "mod+\\",
    commandId: "editor.splitEditor",
    description: "Toggle split editor",
    handler: () => {
      const tab = useEditorStore.getState().getActiveTab();
      if (tab) useEditorStore.getState().toggleSplitEditor(tab.id);
    },
  });
  useHotkey({
    combo: "mod+p",
    commandId: "view.quickOpen",
    description: "Quick open file",
    handler: () => useSearchStore.getState().focusSearch(""),
  });
  useHotkey({
    combo: "mod+shift+p",
    commandId: "view.commandPalette",
    description: "Search commands",
    handler: () => useSearchStore.getState().focusSearch(">"),
  });
  useHotkey({
    combo: "mod+,",
    commandId: "view.settings",
    description: "Open settings",
    handler: () => setSettingsOpen((p) => !p),
  });
  useHotkey({
    combo: "ctrl+alt+k",
    commandId: "view.shortcuts",
    description: "Open keyboard shortcuts",
    handler: () => useUiStore.getState().setShortcutCheatSheetOpen(!useUiStore.getState().shortcutCheatSheetOpen),
  });
  useTerminalHotkeys();
  useZoomHotkeys();
  useHotkey({
    combo: "mod+.",
    commandId: "editor.quickFix",
    description: "Quick fix",
    handler: () => {
      getCurrentEditor()?.getAction("editor.action.quickFix")?.run();
    },
  });
  useHotkey({
    combo: "alt",
    commandId: "view.toggleMenuBar",
    description: "Toggle menu bar",
    handler: () => {
      const s = useUiStore.getState();
      s.setMenuBarVisible(!s.menuBarVisible);
    },
  });

  // Debug hotkeys
  useHotkey({
    combo: "F5",
    commandId: "debug.start",
    description: "Start/Continue Debugging",
    handler: async () => {
      const store = useDebugStore.getState();
      if (store.activeSessionId) {
        const s = store.sessions.find((s) => s.id === store.activeSessionId);
        if (s && (s.status === "paused" || s.status === "stepping")) {
          await store.continue();
          return;
        }
        if (s && (s.status === "running")) return;
      }
      const configs = await DebugConfigurationService.loadConfigs();
      const cfg = configs.length > 0 ? configs[0] : undefined;
      if (cfg) await store.startSession(cfg);
    },
  });
  useHotkey({
    combo: "mod+F5",
    commandId: "debug.runWithoutDebug",
    description: "Run Without Debugging",
    handler: async () => {
      const store = useDebugStore.getState();
      const configs = await DebugConfigurationService.loadConfigs();
      const cfg = configs.length > 0 ? { ...configs[0], debugOptions: { noDebug: true } } : undefined;
      if (cfg) await store.startSession(cfg);
    },
  });
  useHotkey({
    combo: "shift+F5",
    commandId: "debug.stop",
    description: "Stop Debugging",
    handler: async () => {
      const store = useDebugStore.getState();
      if (store.activeSessionId) {
        await store.stopSession(store.activeSessionId);
      }
    },
  });
  useHotkey({
    combo: "ctrl+shift+d",
    commandId: "view.debug",
    description: "Show Debug",
    handler: () => {
      const ui = useUiStore.getState();
      ui.setActivePanelInZone("left", "debug");
      ui.setZoneVisibility("left", true);
    },
  });

  const registerCommands = useCallback(() => {
    const fileCommands: CommandDefinition[] = [
      {
        id: "file.open",
        label: "Open File",
        category: "File",
        keybinding: formatKeybinding("Ctrl+O"),
        action: async () => {
          const picked = await pickFiles({ title: "Open File" });
          if (picked && picked.length > 0) {
            await useFileStore.getState().openFiles(picked);
          }
        },
      },
      {
        id: "file.save",
        label: "Save",
        category: "File",
        keybinding: formatKeybinding("Ctrl+S"),
        action: () => {
          const tab = useEditorStore.getState().getActiveTab();
          if (tab) void useEditorStore.getState().saveFile(tab.id);
        },
      },
      {
        id: "file.saveAll",
        label: "Save All",
        category: "File",
        action: () => void useEditorStore.getState().saveAll(),
      },
    ];
    const visibilityCommands: CommandDefinition[] = [
      {
        id: "view.toggleMenuBar",
        label: "Toggle Menu Bar",
        category: "View",
        action: () => {
          const s = useUiStore.getState();
          s.setMenuBarVisible(!s.menuBarVisible);
        },
      },
      {
        id: "view.toggleActivityBar",
        label: "Toggle Activity Bar",
        category: "View",
        action: () => {
          const s = useUiStore.getState();
          s.setActivityBarVisible(!s.activityBarVisible);
        },
      },
      {
        id: "view.toggleStatusBar",
        label: "Toggle Status Bar",
        category: "View",
        action: () => {
          const s = useUiStore.getState();
          s.setStatusBarVisible(!s.statusBarVisible);
        },
      },
      {
        id: "view.toggleSidebarPosition",
        label: "Toggle Sidebar Position",
        category: "View",
        action: () => {
          const s = useUiStore.getState();
          s.setSidebarPosition(s.sidebarPosition === "left" ? "right" : "left");
        },
      },
    ];

    const themeCommands: CommandDefinition[] = [
      {
        id: "theme.edit",
        label: "Theme: Open Editor",
        category: "View",
        action: () => setThemeEditorOpen((p) => !p),
      },
    ];

    const viewCommands: CommandDefinition[] = [
      {
        id: "view.toggleSidebar",
        label: "Toggle Sidebar",
        category: "View",
        keybinding: formatKeybinding("Ctrl+B"),
        action: () => toggleZone("left"),
      },
      {
        id: "view.toggleTerminal",
        label: "Toggle Terminal",
        category: "View",
        keybinding: formatKeybinding("Ctrl+`"),
        action: () => toggleZone("bottom"),
      },
      {
        id: "view.explorer",
        label: "Show Explorer",
        category: "View",
        keybinding: formatKeybinding("Ctrl+Shift+E"),
        action: () => {
          setActivePanelInZone("left", "explorer");
          useUiStore.getState().setZoneVisibility("left", true);
          setTimeout(() => {
            const input = document.querySelector<HTMLInputElement>('[data-explorer-search]');
            input?.focus();
            input?.select();
          }, 100);
        },
      },
      {
        id: "view.search",
        label: "Show Search",
        category: "View",
        keybinding: formatKeybinding("Ctrl+Shift+F"),
        action: () => {
          setActivePanelInZone("left", "search");
          useUiStore.getState().setZoneVisibility("left", true);
        },
      },
      {
        id: "view.git",
        label: "Show Source Control",
        category: "View",
        keybinding: formatKeybinding("Ctrl+Shift+G"),
        action: () => {
          setActivePanelInZone("left", "git");
          useUiStore.getState().setZoneVisibility("left", true);
        },
      },
      {
        id: "view.commandPalette",
        label: "Command Palette",
        category: "View",
        keybinding: formatKeybinding("Ctrl+Shift+P"),
        action: () => setCommandOpen((p) => !p),
      },
      {
        id: "view.settings",
        label: "Settings",
        category: "View",
        keybinding: formatKeybinding("Ctrl+,"),
        action: () => setSettingsOpen((p) => !p),
      },
      {
        id: "view.shortcuts",
        label: "Keyboard Shortcuts",
        category: "View",
        keybinding: formatKeybinding("Ctrl+Alt+K"),
        action: () => useUiStore.getState().setShortcutCheatSheetOpen(!useUiStore.getState().shortcutCheatSheetOpen),
      },
    ];
    const terminalCommands: CommandDefinition[] = [
      {
        id: "terminal.new",
        label: "New Terminal",
        category: "Terminal",
        keybinding: formatKeybinding("Ctrl+Shift+`"),
        action: () => void useTerminalStore.getState().createSession(),
      },
      {
        id: "terminal.kill",
        label: "Kill Active Terminal",
        category: "Terminal",
        action: () => {
          const id = useTerminalStore.getState().activeSessionId;
          if (id) void useTerminalStore.getState().closeSession(id);
        },
      },
    ];

    const debugCommands: CommandDefinition[] = [
      {
        id: "debug.start",
        label: "Start/Continue Debugging",
        category: "Debug",
        keybinding: formatKeybinding("F5"),
        action: async () => {
          const store = useDebugStore.getState();
          if (store.activeSessionId) {
            const s = store.sessions.find((s) => s.id === store.activeSessionId);
            if (s && (s.status === "paused" || s.status === "stepping")) {
              await store.continue();
              return;
            }
            if (s && (s.status === "running")) return;
          }
          const configs = await DebugConfigurationService.loadConfigs();
          const cfg = configs.length > 0 ? configs[0] : undefined;
          if (cfg) await store.startSession(cfg);
        },
      },
      {
        id: "debug.runWithoutDebug",
        label: "Run Without Debugging",
        category: "Debug",
        keybinding: formatKeybinding("Ctrl+F5"),
        action: async () => {
          const store = useDebugStore.getState();
          const configs = await DebugConfigurationService.loadConfigs();
          const cfg = configs.length > 0 ? { ...configs[0], debugOptions: { noDebug: true } } : undefined;
          if (cfg) await store.startSession(cfg);
        },
      },
      {
        id: "debug.stop",
        label: "Stop Debugging",
        category: "Debug",
        keybinding: formatKeybinding("Shift+F5"),
        action: async () => {
          const store = useDebugStore.getState();
          if (store.activeSessionId) {
            await store.stopSession(store.activeSessionId);
          }
        },
      },
      {
        id: "view.debug",
        label: "Show Debug",
        category: "View",
        keybinding: formatKeybinding("Ctrl+Shift+D"),
        action: () => {
          const ui = useUiStore.getState();
          ui.setActivePanelInZone("left", "debug");
          ui.setZoneVisibility("left", true);
        },
      },
    ];

    const layoutCommands: CommandDefinition[] = [
      {
        id: "layout.preset.default",
        label: "Layout: Default",
        category: "Layout",
        action: () => {
          useUiStore.getState().loadPreset("Default");
          useToastStore.getState().addToast("info", "Layout preset 'Default' applied");
        },
      },
      {
        id: "layout.preset.minimal",
        label: "Layout: Minimal",
        category: "Layout",
        action: () => {
          useUiStore.getState().loadPreset("Minimal");
          useToastStore.getState().addToast("info", "Layout preset 'Minimal' applied");
        },
      },
      {
        id: "layout.preset.gitReview",
        label: "Layout: Git Review",
        category: "Layout",
        action: () => {
          useUiStore.getState().loadPreset("Git Review");
          useToastStore.getState().addToast("info", "Layout preset 'Git Review' applied");
        },
      },
      {
        id: "layout.preset.save",
        label: "Layout: Save Preset",
        category: "Layout",
        action: async () => {
          const name = await useModalStore.getState().openInput("Enter a name for this layout preset:");
          if (name) {
            useUiStore.getState().savePreset(name);
            useToastStore.getState().addToast("info", `Layout preset '${name}' saved`);
          }
        },
      },
      {
        id: "layout.preset.load",
        label: "Layout: Load Preset",
        category: "Layout",
        action: async () => {
          const customNames = Object.keys(useUiStore.getState().savedPresets);
          const allNames = [...BUILT_IN_PRESET_NAMES, ...customNames];
          if (allNames.length === 0) {
            useToastStore.getState().addToast("info", "No saved presets available");
            return;
          }
          const selected = await useModalStore.getState().openQuickPick(allNames, "Select a layout preset to load:");
          if (selected) {
            useUiStore.getState().loadPreset(selected);
            useToastStore.getState().addToast("info", `Layout preset '${selected}' applied`);
          }
        },
      },
      {
        id: "layout.preset.delete",
        label: "Layout: Delete Preset",
        category: "Layout",
        action: async () => {
          const customNames = Object.keys(useUiStore.getState().savedPresets);
          if (customNames.length === 0) {
            useToastStore.getState().addToast("info", "No custom presets to delete");
            return;
          }
          const selected = await useModalStore.getState().openQuickPick(customNames, "Select a preset to delete:");
          if (selected) {
            useUiStore.getState().deletePreset(selected);
            useToastStore.getState().addToast("info", `Layout preset '${selected}' deleted`);
          }
        },
      },
    ];

    const unreg1 = registerCommandProvider(() => fileCommands);
    const unreg2 = registerCommandProvider(() => viewCommands);
    const unreg3 = registerCommandProvider(() => terminalCommands);
    const unreg4 = registerCommandProvider(() => layoutCommands);
    const unreg5 = registerCommandProvider(() => themeCommands);
    const unreg6 = registerCommandProvider(() => visibilityCommands);
    const unreg7 = registerCommandProvider(() => debugCommands);

    return () => {
      unreg1();
      unreg2();
      unreg3();
      unreg4();
      unreg5();
      unreg6();
      unreg7();
    };
  }, [toggleZone, setActivePanelInZone]);

  useEffect(() => {
    const cleanup = registerCommands();
    return cleanup;
  }, [registerCommands, setThemeEditorOpen]);

  const isSidebarRight = sidebarPosition === "right";

  const sidebarSection = (
    <>
      {!isSidebarRight && activityBarVisible && (
        <div className="flex">
          <ActivityBar />
        </div>
      )}
      {zones.left.isVisible && (
        <>
          {isSidebarRight && (
            <Resizer
              orientation="vertical"
              ariaLabel="Resize sidebar"
              invert
              onResize={(delta) =>
                setZoneSize("left", zones.left.size + delta)
              }
            />
          )}
          <div
            className="flex shrink-0 flex-col overflow-hidden"
            style={{ width: zones.left.size }}
          >
            <Dock zone="left" />
          </div>
          {!isSidebarRight && (
            <Resizer
              orientation="vertical"
              ariaLabel="Resize sidebar"
              onResize={(delta) =>
                setZoneSize("left", zones.left.size + delta)
              }
            />
          )}
        </>
      )}
      {isSidebarRight && activityBarVisible && (
        <div className="flex">
          <ActivityBar />
        </div>
      )}
    </>
  );

  const secondarySection = (
    <>
      {zones.right.isVisible && (
        <>
          <Resizer
            orientation="vertical"
            ariaLabel="Resize right panel"
            onResize={(delta) =>
              setZoneSize("right", zones.right.size - delta)
            }
          />
          <div
            className="flex shrink-0 flex-col overflow-hidden"
            style={{ width: zones.right.size }}
          >
            <Dock zone="right" />
          </div>
        </>
      )}
    </>
  );

  const panelAlignClass =
    panelAlignment === "left"
      ? "mr-auto w-2/3"
      : panelAlignment === "center"
        ? "mx-auto max-w-4xl"
        : panelAlignment === "right"
          ? "ml-auto w-2/3"
          : "w-full";

  const isBottomMaximized = zones.bottom.isVisible && bottomMaximized;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground shell-container">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        {isSidebarRight ? secondarySection : sidebarSection}

        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "flex min-h-0 flex-1",
              zones.bottom.isVisible && "flex-col",
            )}
          >
            {/* Editor area: hidden when bottom panel is maximized */}
            {!isBottomMaximized && (
              <div
                className={cn(
                  "min-h-0 min-w-0 flex-1 editor-area",
                  zones.bottom.isVisible && "flex-1",
                )}
              >
                <EditorArea />
              </div>
            )}

            {zones.bottom.isVisible && (
              <>
                {/* Resizer: hidden when maximized since there's nothing to resize against */}
                {!isBottomMaximized && (
                  <Resizer
                    orientation="horizontal"
                    ariaLabel="Resize terminal panel"
                    onResize={(delta) =>
                      setZoneSize("bottom", zones.bottom.size - delta)
                    }
                  />
                )}
                <div
                  className={cn(
                    "min-h-0 overflow-hidden",
                    panelAlignClass,
                    isBottomMaximized && "flex-1",
                  )}
                  style={
                    isBottomMaximized
                      ? { flex: "1 1 0%" }
                      : {
                          flex: `0 1 ${zones.bottom.size}px`,
                          maxHeight: zones.bottom.size,
                        }
                  }
                >
                  <Dock zone="bottom" />
                </div>
              </>
            )}
          </div>

          {statusBarVisible && <StatusBar />}
        </div>

        {isSidebarRight ? sidebarSection : secondarySection}
      </div>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      <ShortcutCheatSheet open={shortcutOpen} onClose={() => setShortcutOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ThemeEditor open={themeEditorOpen} onClose={() => setThemeEditorOpen(false)} />
      <ToastContainer />
      <QuickPickModal />
    </div>
  );
}
