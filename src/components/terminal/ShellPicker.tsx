import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTerminalStore } from "@/stores/terminalStore";

export function ShellPicker() {
  const shells = useTerminalStore((s) => s.shells);
  const defaultShellId = useTerminalStore((s) => s.defaultShellId);
  const setDefault = useTerminalStore((s) => s.setDefaultShell);
  const createSession = useTerminalStore((s) => s.createSession);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="New terminal"
          title="New terminal"
          className="shrink-0"
        >
          <Plus className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>New Terminal</DropdownMenuLabel>
        {shells.map((shell) => (
          <DropdownMenuItem
            key={shell.id}
            onSelect={() => void createSession(shell.id)}
          >
            {shell.label}
          </DropdownMenuItem>
        ))}
        {shells.length === 0 ? (
          <DropdownMenuItem disabled>No shells detected</DropdownMenuItem>
        ) : null}
        {shells.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Default Shell</DropdownMenuLabel>
            {shells.map((shell) => (
              <DropdownMenuItem
                key={`default-${shell.id}`}
                onSelect={() => setDefault(shell.id)}
              >
                <span className="ml-4">{shell.label}</span>
                {shell.id === defaultShellId ? (
                  <Check className="ml-auto size-3.5" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
