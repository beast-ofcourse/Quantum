import { useState, useCallback, useEffect, useRef } from "react";
import { useDebugStore } from "@/stores/debugStore";
import { useFileStore } from "@/stores/fileStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { DebugConfigurationService, createTemplate, getDefaultConfigs, resolveConfigVariables } from "@/lib/debugConfiguration";
import { joinPath } from "@/lib/pathUtils";
import { pathExists } from "@/tauri/fs";

import type { DebugConfiguration, DebugSession } from "@/types/debug";

// ── Component ─────────────────────────────────────────────────

function getSessionStatus(sessions: DebugSession[], id: string | null) {
  if (!id) return "idle";
  const s = sessions.find((x) => x.id === id);
  if (!s) return "idle";
  return s.status;
}

export function RunButton() {
  const sessions = useDebugStore((s) => s.sessions);
  const activeSessionId = useDebugStore((s) => s.activeSessionId);
  const startSession = useDebugStore((s) => s.startSession);
  const stopSession = useDebugStore((s) => s.stopSession);
  const rootPath = useFileStore((s) => s.rootPath);
  const openFile = useEditorStore((s) => s.openFile);

  const [configs, setConfigs] = useState<DebugConfiguration[]>(() => getDefaultConfigs());
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const status = getSessionStatus(sessions, activeSessionId);
  const isDebugging = status !== "idle";
  const activeConfig = configs[selectedIdx];
  const runningSession = sessions.find((s) => s.id === activeSessionId);

  // Load configs when rootPath changes
  useEffect(() => {
    DebugConfigurationService.loadConfigs(rootPath ?? undefined).then((cs) => {
      setConfigs(cs.length > 0 ? cs : getDefaultConfigs());
    });
  }, [rootPath]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [showDropdown]);

  // ── Run selected config in terminal without DAP ────────────
  const handleRunWithoutDebug = useCallback(async () => {
    if (!activeConfig || !rootPath) return;

    const activeTab = useEditorStore.getState().getActiveTab();
    const activeFilePath = activeTab?.path;

    const resolved = resolveConfigVariables(activeConfig, rootPath, activeFilePath);
    const program = resolved.program ?? resolved.cwd ?? rootPath;
    const cwd = resolved.cwd ?? rootPath;
    const runtime = resolved.runtime ?? resolved.type;
    const runtimeArgs = resolved.runtimeArgs ?? [];
    const programArgs = resolved.args ?? [];

    const cmdArgs = [...runtimeArgs, `"${program}"`, ...programArgs];
    const cmd = [runtime, ...cmdArgs].join(" ");
    const commandLine = `${cmd}\n`;

    const ui = useUiStore.getState();
    if (!ui.zones.bottom.isVisible) {
      ui.setZoneVisibility("bottom", true);
    }
    ui.setActivePanel("terminal");

    const ts = useTerminalStore.getState();
    const sessionId = await ts.createSession(undefined, cwd);
    if (!sessionId) {
      useToastStore.getState().addToast("error", "Failed to create terminal session");
      return;
    }

    await new Promise((r) => setTimeout(r, 400));
    await ts.writeStdin(sessionId, commandLine);
  }, [activeConfig, rootPath]);

  // ── Start DAP debugging session ────────────────────────────
  const handleStartDebug = useCallback(async () => {
    if (runningSession) {
      await stopSession(runningSession.id);
      return;
    }
    if (!activeConfig) return;
    const activeTab = useEditorStore.getState().getActiveTab();
    const resolved = resolveConfigVariables(activeConfig, rootPath ?? "", activeTab?.path);
    await startSession(resolved);
  }, [runningSession, activeConfig, rootPath, startSession, stopSession]);

  const handleSelectConfig = useCallback((idx: number) => {
    setSelectedIdx(idx);
    setShowDropdown(false);
  }, []);

  const handleOpenLaunchJson = useCallback(async () => {
    const ws = rootPath;
    if (!ws) return;
    const p = joinPath(joinPath(ws, ".quantum"), "launch.json");
    const exists = await pathExists(p);
    if (!exists) {
      await DebugConfigurationService.saveConfigs(configs);
    }
    await openFile(p);
    setShowDropdown(false);
  }, [rootPath, configs, openFile]);

  const handleEditConfigs = useCallback(() => {
    setShowDropdown(false);
    setShowConfigDialog(true);
  }, []);

  const buttonClass = isDebugging
    ? status === "paused"
      ? "bg-yellow-400 text-black hover:bg-yellow-500"
      : "bg-red-400 text-black hover:bg-red-500"
    : "bg-green-400 text-black hover:bg-green-500";

  const buttonSymbol = isDebugging ? "■" : "▶";

  if (!configs.length) return null;

  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-1 border-l border-border pl-2 pr-1">
        {/* Config dropdown trigger */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown((v) => !v)}
            className="flex items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {activeConfig?.name ?? "Select Config"}
            <svg width="8" height="8" viewBox="0 0 8 8" className="fill-current">
              <path d="M2 3l2 2 2-2z" />
            </svg>
          </button>
          {showDropdown && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-44 rounded-md border border-border bg-popover py-1 shadow-lg">
              {configs.map((cfg, i) => (
                <button
                  key={cfg.name}
                  onClick={() => handleSelectConfig(i)}
                  className={`flex w-full items-center px-3 py-1.5 text-xs hover:bg-accent ${
                    i === selectedIdx ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span className="mr-2 size-1.5 rounded-full bg-green-400" />
                  {cfg.name}
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <button
                onClick={handleRunWithoutDebug}
                className="flex w-full items-center px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Run Without Debug
              </button>
              <button
                onClick={handleEditConfigs}
                className="flex w-full items-center px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Edit Configurations...
              </button>
              <button
                onClick={handleOpenLaunchJson}
                className="flex w-full items-center px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                Open launch.json
              </button>
            </div>
          )}
        </div>

        {/* Play/Stop button */}
        <button
          onClick={handleStartDebug}
          className={`flex size-4 items-center justify-center rounded ${buttonClass} text-[10px] leading-none transition-colors`}
          title={
            isDebugging
              ? "Stop (Shift+F5)"
              : "Start Debugging (F5)"
          }
        >
          {buttonSymbol}
        </button>
      </div>

      {/* Config management dialog */}
      {showConfigDialog && (
        <RunButtonConfigDialog
          configs={configs}
          onClose={() => setShowConfigDialog(false)}
          onSave={async (updated) => {
            setConfigs(updated);
            await DebugConfigurationService.saveConfigs(updated, rootPath ?? undefined);
            setShowConfigDialog(false);
          }}
        />
      )}
    </>
  );
}

/* Inline config editor dialog */
function RunButtonConfigDialog({
  configs,
  onClose,
  onSave,
}: {
  configs: DebugConfiguration[];
  onClose: () => void;
  onSave: (configs: DebugConfiguration[]) => void;
}) {
  const [items, setItems] = useState<DebugConfiguration[]>(configs);
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<DebugConfiguration | null>(null);

  const handleAdd = () => {
    const newCfg = createTemplate("node", `Launch ${items.length + 1}`);
    setItems([...items, newCfg]);
    setEditing(items.length);
    setEditForm(newCfg);
  };

  const handleRemove = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
    if (editing === idx) {
      setEditing(null);
      setEditForm(null);
    }
  };

  const handleStartEdit = (idx: number) => {
    setEditing(idx);
    setEditForm({ ...items[idx] });
  };

  const handleSaveEdit = () => {
    if (editing === null || !editForm) return;
    const updated = [...items];
    updated[editing] = editForm;
    setItems(updated);
    setEditing(null);
    setEditForm(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border border-border bg-background p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Debug Configurations</h3>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="mb-3 max-h-60 space-y-1 overflow-y-auto">
          {items.map((cfg, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1.5">
              {editing === i ? (
                <div className="flex flex-1 flex-col gap-1">
                  <input
                    className="h-6 rounded border border-input bg-background px-1.5 text-xs"
                    value={editForm?.name ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, name: e.target.value } : null))
                    }
                    placeholder="Config name"
                  />
                  <input
                    className="h-6 rounded border border-input bg-background px-1.5 text-xs font-mono"
                    value={editForm?.program ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, program: e.target.value } : null))
                    }
                    placeholder="Program path"
                  />
                </div>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-green-400" />
                  <span className="flex-1 text-xs">{cfg.name}</span>
                  <span className="text-[10px] text-muted-foreground">{cfg.type}</span>
                </>
              )}
              <div className="flex gap-1">
                {editing === i ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditing(null);
                        setEditForm(null);
                      }}
                      className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleStartEdit(i)}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleRemove(i)}
                      className="text-[10px] text-muted-foreground hover:text-red-400"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <button
            onClick={handleAdd}
            className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            + Add Config
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(items)}
              className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
