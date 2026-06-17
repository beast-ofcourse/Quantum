import { GitBranch, Save, AlertCircle, Bell, Terminal as TerminalIcon, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { useGitStore } from "@/stores/gitStore";
import { ThemeService } from "@/lib/themeService";
import { useExtensionStatusBarStore } from "@/stores/extensionStatusBarStore";
import { useDiagnosticStore } from "@/stores/diagnosticStore";
import { cn } from "@/lib/utils";
import { useMemo, useCallback, useState, useEffect } from "react";
import { getAllCommands } from "@/lib/commandRegistry";

export function StatusBar() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleZone = useUiStore((s) => s.toggleZone);
  const setActivePanelInZone = useUiStore((s) => s.setActivePanelInZone);
  const setZoneVisibility = useUiStore((s) => s.setZoneVisibility);
  const active = useEditorStore((s) => s.getActiveTab());
  const save = useEditorStore((s) => s.saveFile);
  const defaultShell = useTerminalStore((s) =>
    s.shells.find((sh) => sh.id === s.defaultShellId),
  );
  const gitBranch = useGitStore((s) => s.currentBranch);
  const gitStatus = useGitStore((s) => s.status);
  const isRepo = useGitStore((s) => s.isRepo);
  const rebaseStatus = useGitStore((s) => s.rebaseStatus);

  const errorCount = useDiagnosticStore((s) => s.errorCount);
  const warningCount = useDiagnosticStore((s) => s.warningCount);
  const extStatusItems = useExtensionStatusBarStore((s) => s.items);

  const leftExtItems = useMemo(
    () =>
      extStatusItems
        .filter((i) => i.visible && i.alignment === "left")
        .sort((a, b) => b.priority - a.priority),
    [extStatusItems],
  );
  const rightExtItems = useMemo(
    () =>
      extStatusItems
        .filter((i) => i.visible && i.alignment === "right")
        .sort((a, b) => b.priority - a.priority),
    [extStatusItems],
  );

  const lastClosedTab = useEditorStore((s) => s.lastClosedTab);
  const setLastClosedTab = useEditorStore((s) => s.setLastClosedTab);
  const openFile = useEditorStore((s) => s.openFile);
  const [showUndo, setShowUndo] = useState(false);

  useEffect(() => {
    if (lastClosedTab) {
      setShowUndo(true);
      const timer = setTimeout(() => {
        setShowUndo(false);
        setLastClosedTab(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastClosedTab, setLastClosedTab]);

  const handleUndoClose = useCallback(() => {
    if (!lastClosedTab) return;
    void openFile(lastClosedTab.path);
    setShowUndo(false);
    setLastClosedTab(null);
  }, [lastClosedTab, openFile, setLastClosedTab]);

  const branchLabel = isRepo && gitBranch ? gitBranch : "main";
  const stagedCount = gitStatus?.staged.length ?? 0;
  const unstagedCount = (gitStatus?.unstaged.length ?? 0) + (gitStatus?.untracked.length ?? 0);

  const openGitView = useCallback(() => {
    setActivePanelInZone("left", "git");
    setZoneVisibility("left", true);
  }, [setActivePanelInZone, setZoneVisibility]);

  const handleExtItemClick = useCallback((commandId?: string) => {
    if (!commandId) return;
    const cmd = getAllCommands().find((c) => c.id === commandId);
    cmd?.action();
  }, []);

  return (
    <footer
      aria-label="Status bar"
      className="flex h-5 shrink-0 items-center justify-between border-t border-border px-2 text-[11px] text-muted-foreground"
    >
      <div className="flex h-full items-center gap-1">
        <StatusItem
          icon={<GitBranch className="size-3" />}
          label={branchLabel}
          onClick={openGitView}
          hint="Open Source Control"
        />
        {rebaseStatus?.inProgress && (
          <StatusItem
            label={`Rebasing (${rebaseStatus.current}/${rebaseStatus.total})`}
            onClick={openGitView}
            className="text-amber-500"
          />
        )}
        {isRepo && gitStatus && (
          <span className="flex items-center gap-1">
            {stagedCount > 0 && (
              <StatusItem label={`●${stagedCount}`} onClick={openGitView} className="text-green-500" />
            )}
            {unstagedCount > 0 && (
              <StatusItem label={`○${unstagedCount}`} onClick={openGitView} className="text-orange-500" />
            )}
            {gitStatus.ahead > 0 && (
              <StatusItem label={`↑${gitStatus.ahead}`} />
            )}
            {gitStatus.behind > 0 && (
              <StatusItem label={`↓${gitStatus.behind}`} />
            )}
          </span>
        )}
        {leftExtItems.map((item) => (
          <StatusItem key={item.id} label={item.text} hint={item.tooltip} onClick={item.command ? () => handleExtItemClick(item.command) : undefined} />
        ))}
        {showUndo && lastClosedTab && (
          <StatusItem
            icon={<Undo2 className="size-3" />}
            label={`Closed ${lastClosedTab.name}`}
            onClick={handleUndoClose}
            className="text-blue-500 hover:text-blue-400"
          />
        )}
        <StatusItem label={active?.encoding ?? "UTF-8"} />
        <StatusItem label="LF" />
        <StatusItem label={active?.language ?? "Plain Text"} />
        <StatusItem
          label={
            active
              ? `Ln ${active.cursor.line}, Col ${active.cursor.col}`
              : "Ln 1, Col 1"
          }
        />
      </div>
      <div className="flex h-full items-center gap-1">
        {rightExtItems.map((item) => (
          <StatusItem key={item.id} label={item.text} hint={item.tooltip} onClick={item.command ? () => handleExtItemClick(item.command) : undefined} />
        ))}
        {active && (
          <StatusItem
            icon={<Save className="size-3" />}
            label={active.isDirty ? "Save" : "Saved"}
            onClick={() => void save(active.id)}
            hint="Ctrl+S"
            highlight={active.isDirty}
          />
        )}
        <StatusItem
          label="Toggle Sidebar"
          onClick={() => toggleZone("left")}
          hint="Ctrl+B"
        />
        <StatusItem
          icon={<TerminalIcon className="size-3" />}
          label={defaultShell ? defaultShell.label : "Shell"}
          onClick={() => toggleZone("bottom")}
          hint="Ctrl+`"
        />
        <StatusItem
          label={ThemeService.getTheme(theme)?.name ?? theme}
          onClick={toggleTheme}
          hint="Ctrl+Shift+T"
        />
        {theme === "spiderman" && (errorCount + warningCount) > 0 && (
          <span
            className="flex items-center gap-1 px-1"
            title="Spidey-Sense is tingling!"
          >
            <span
              className={cn(
                "inline-block size-2 rounded-full",
                errorCount > 0
                  ? "animate-ping bg-red-500 shadow-[0_0_4px_#E23636]"
                  : "animate-pulse bg-red-400",
              )}
            />
            <span className="text-[10px] text-muted-foreground">Spidey-Sense</span>
          </span>
        )}
        <StatusItem icon={<AlertCircle className="size-3" />} label={String(errorCount + warningCount)} onClick={() => { setActivePanelInZone("bottom", "problems"); setZoneVisibility("bottom", true); }} hint="Open Problems" />
        <StatusItem icon={<Bell className="size-3" />} />
      </div>
    </footer>
  );
}

interface StatusItemProps {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  hint?: string;
  className?: string;
  highlight?: boolean;
}

function StatusItem({
  label,
  icon,
  onClick,
  hint,
  className,
  highlight,
}: StatusItemProps) {
  const interactive = Boolean(onClick);
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={onClick}
      disabled={!interactive}
      title={hint}
      className={cn(
        "h-full gap-1 rounded-none px-2 text-[11px] font-normal",
        interactive && "hover:bg-accent hover:text-foreground",
        highlight && "text-primary",
        className,
      )}
    >
      {icon}
      {label}
    </Button>
  );
}
