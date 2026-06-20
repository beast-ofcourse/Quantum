import { useEffect, useRef, useState } from "react";
import { Terminal as TerminalIcon, X, Bug, Maximize2, Minimize2 } from "lucide-react";
import type { Terminal as XTerm } from "@xterm/xterm";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/uiStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { TerminalTabs } from "@/components/terminal/TerminalTabs";
import { Terminal } from "@/components/terminal/Terminal";
import { TerminalEmptyState } from "@/components/terminal/TerminalEmptyState";
import { TerminalContextMenu } from "@/components/terminal/TerminalContextMenu";
import { ProblemsPanel } from "@/components/terminal/ProblemsPanel";
import { OutputPanel } from "@/components/terminal/OutputPanel";
import { DebugConsolePanel } from "@/components/terminal/DebugConsolePanel";


export function BottomPanel() {
  const setBottomVisibility = useUiStore((s) => s.setZoneVisibility);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const loadShells = useTerminalStore((s) => s.loadShells);
  const xtermRef = useRef<XTerm | null>(null);
  const active = sessions.find((s) => s.id === activeSessionId) ?? null;
  const [tab, setTab] = useState<"terminal" | "problems" | "output" | "debug">("terminal");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    void loadShells();
  }, [loadShells]);

  const toggleFullscreen = () => {
    const next = !fullscreen;
    setFullscreen(next);
    useUiStore.getState().setZoneSize("bottom", next ? window.innerHeight - 100 : 220);
  };

  return (
    <section
      aria-label="Bottom panel"
      className="flex h-full w-full flex-col overflow-hidden bg-muted/20"
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <div role="tablist" className="flex items-center gap-1 text-xs">
          <button
            id="tab-terminal"
            role="tab"
            aria-selected={tab === "terminal"}
            aria-controls="terminal-content"
            tabIndex={tab === "terminal" ? 0 : -1}
            onClick={() => setTab("terminal")}
            className={`flex items-center gap-1.5 px-2 py-1 ${
              tab === "terminal"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TerminalIcon className="size-3.5" />
            Terminal
          </button>
          <button
            id="tab-problems"
            role="tab"
            aria-selected={tab === "problems"}
            aria-controls="problems-content"
            tabIndex={tab === "problems" ? 0 : -1}
            onClick={() => setTab("problems")}
            className={`px-2 py-1 ${
              tab === "problems"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Problems
          </button>
          <button
            id="tab-output"
            role="tab"
            aria-selected={tab === "output"}
            aria-controls="output-content"
            tabIndex={tab === "output" ? 0 : -1}
            onClick={() => setTab("output")}
            className={`flex items-center gap-1.5 px-2 py-1 ${
              tab === "output"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Output
          </button>
          <button
            id="tab-debug"
            role="tab"
            aria-selected={tab === "debug"}
            aria-controls="debug-content"
            tabIndex={tab === "debug" ? 0 : -1}
            onClick={() => setTab("debug")}
            className={`flex items-center gap-1.5 px-2 py-1 ${
              tab === "debug"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bug className="size-3.5" />
            Debug Console
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Hide panel"
            onClick={() => setBottomVisibility("bottom", false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>
      {tab === "terminal" ? (
        <div
          id="terminal-content"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          role="tabpanel"
          aria-labelledby="tab-terminal"
          onPointerDown={() => setActivePanel("terminal")}
        >
          <TerminalTabs />
          <div className="flex-1 overflow-hidden">
            {active ? (
              <TerminalContextMenu xtermRef={xtermRef}>
                <Terminal session={active} xtermRef={xtermRef} />
              </TerminalContextMenu>
            ) : (
              <TerminalEmptyState />
            )}
          </div>
        </div>
      ) : null}
      {tab === "problems" ? (
        <div
          id="problems-content"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          role="tabpanel"
          aria-labelledby="tab-problems"
          onPointerDown={() => setActivePanel("terminal")}
        >
          <ProblemsPanel />
        </div>
      ) : null}
      {tab === "output" ? (
        <div
          id="output-content"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          role="tabpanel"
          aria-labelledby="tab-output"
          onPointerDown={() => setActivePanel("terminal")}
        >
          <OutputPanel />
        </div>
      ) : null}
      {tab === "debug" ? (
        <div
          id="debug-content"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          role="tabpanel"
          aria-labelledby="tab-debug"
          onPointerDown={() => setActivePanel("terminal")}
        >
          <DebugConsolePanel />
        </div>
      ) : null}
    </section>
  );
}
