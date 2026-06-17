import { useRef, useCallback, useEffect, useState } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { SearchAddon } from "@xterm/addon-search";
import { useTerminalStore } from "@/stores/terminalStore";
import { useUiStore } from "@/stores/uiStore";
import { TerminalTabs } from "@/components/terminal/TerminalTabs";
import { Terminal } from "@/components/terminal/Terminal";
import { TerminalEmptyState } from "@/components/terminal/TerminalEmptyState";
import { TerminalContextMenu } from "@/components/terminal/TerminalContextMenu";
import { TerminalSearchOverlay } from "@/components/terminal/TerminalSearchOverlay";

export function TerminalPanel() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const loadShells = useTerminalStore((s) => s.loadShells);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const xtermRef = useRef<XTerm | null>(null);
  const active = sessions.find((s) => s.id === activeSessionId) ?? null;

  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearchOpen = useCallback((addon: SearchAddon) => {
    setSearchAddon(addon);
    setSearchOpen(true);
  }, []);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchAddon(null);
  }, []);

  useEffect(() => {
    void loadShells();
  }, [loadShells]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TerminalTabs />
      <div
        className="relative flex-1 overflow-hidden"
        onPointerDown={() => setActivePanel("terminal")}
      >
        {active ? (
          <TerminalContextMenu xtermRef={xtermRef}>
            <Terminal session={active} xtermRef={xtermRef} onSearchOpen={handleSearchOpen} />
            {searchOpen && (
              <TerminalSearchOverlay searchAddon={searchAddon} onClose={handleSearchClose} />
            )}
          </TerminalContextMenu>
        ) : (
          <TerminalEmptyState />
        )}
      </div>
    </div>
  );
}
