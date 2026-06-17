import type { RefObject } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

interface TerminalContextMenuProps {
  xtermRef: RefObject<XTerm | null>;
  children: React.ReactNode;
  className?: string;
}

export function TerminalContextMenu({
  xtermRef,
  children,
  className,
}: TerminalContextMenuProps) {
  const copy = async () => {
    const term = xtermRef.current;
    if (!term) return;
    const sel = term.getSelection();
    if (!sel) return;
    try {
      await navigator.clipboard.writeText(sel);
    } catch (err) {
      console.error("[Terminal] copy failed:", err);
    }
  };

  const paste = async () => {
    const term = xtermRef.current;
    if (!term) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) term.paste(text);
    } catch (err) {
      console.error("[Terminal] paste failed:", err);
    }
  };

  const selectAll = () => {
    xtermRef.current?.selectAll();
  };

  const clear = () => {
    xtermRef.current?.clear();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("h-full w-full", className)}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem onSelect={() => void copy()}>Copy</ContextMenuItem>
        <ContextMenuItem onSelect={() => void paste()}>Paste</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={selectAll}>Select All</ContextMenuItem>
        <ContextMenuItem onSelect={clear}>Clear</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
