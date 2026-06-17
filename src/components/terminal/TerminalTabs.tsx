import { useTerminalStore } from "@/stores/terminalStore";
import { TerminalTab } from "./TerminalTab";
import { ShellPicker } from "./ShellPicker";

export function TerminalTabs() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);

  return (
    <div
      role="tablist"
      aria-label="Open terminals"
      className="flex h-9 shrink-0 items-center overflow-x-auto overflow-y-hidden border-b border-border bg-muted/20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sessions.map((session) => (
        <TerminalTab
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
        />
      ))}
      <div className="ml-1 flex shrink-0 items-center">
        <ShellPicker />
      </div>
    </div>
  );
}
