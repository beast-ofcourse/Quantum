import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Search, File, Terminal, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fuzzyFilter } from "@/lib/fuzzySearch";
import { getAllCommands } from "@/lib/commandRegistry";
import { useFileStore } from "@/stores/fileStore";
import { useEditorStore } from "@/stores/editorStore";
import { useKeybindingStore } from "@/stores/keybindingStore";
import { getPlatformModifier } from "@/lib/platform";
import { getCurrentEditor, getMonacoModule } from "@/extensions/editorRef";
import type { FileNode } from "@/types/file";
import type * as monaco from "@/lib/monaco-entry";

type Mode = "files" | "commands" | "symbols" | "goto";

interface FlatFile {
  path: string;
  name: string;
  dir: string;
}

interface SymbolInfo {
  name: string;
  kind: string;
  range: monaco.IRange;
}

function flattenTree(nodes: FileNode[], root: string): FlatFile[] {
  const result: FlatFile[] = [];
  const sep = root.includes("\\") ? "\\" : "/";
  function walk(list: FileNode[]) {
    for (const n of list) {
      if (n.kind !== "directory") {
        const rel = n.path.startsWith(root) ? n.path.slice(root.length + 1) : n.path;
        const lastSep = rel.lastIndexOf(sep);
        result.push({
          path: n.path,
          name: n.name,
          dir: lastSep > 0 ? rel.slice(0, lastSep) : "",
        });
      }
      if (n.children) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

function parseMode(query: string): { mode: Mode; text: string } {
  if (query.startsWith(">")) return { mode: "commands", text: query.slice(1).trim() };
  if (query.startsWith("@")) return { mode: "symbols", text: query.slice(1).trim() };
  if (query.startsWith(":")) return { mode: "goto", text: query.slice(1).trim() };
  return { mode: "files", text: query.trim() };
}

function formatComboDisplay(combo: string): string {
  const mod = getPlatformModifier();
  return combo
    .replace("mod", mod)
    .split("+")
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join("+");
}

const SYMBOL_ICONS: Record<string, string> = {
  Function: "ƒ",
  Method: "ƒ",
  Class: "C",
  Interface: "I",
  Module: "M",
  Variable: "v",
  Constant: "c",
  Property: "p",
  Enum: "E",
  Array: "a",
};

interface QuickOpenProps {
  open: boolean;
  initialMode?: Mode;
  onClose: () => void;
}

export function QuickOpen({ open, initialMode, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [loadingSymbols, setLoadingSymbols] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const symbolCache = useRef<SymbolInfo[]>([]);

  const fileTree = useFileStore((s) => s.fileTree);
  const rootPath = useFileStore((s) => s.rootPath);
  const openFile = useEditorStore((s) => s.openFile);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const overrides = useKeybindingStore((s) => s.overrides);
  const activeTab = useEditorStore((s) => s.getActiveTab());

  const allCommands = useMemo(() => getAllCommands(), []);

  const enrichedCommands = useMemo(
    () =>
      allCommands.map((cmd) => {
        const override = overrides[cmd.id];
        const effective = override ? formatComboDisplay(override) : cmd.keybinding;
        return { ...cmd, keybinding: effective || undefined };
      }),
    [allCommands, overrides],
  );

  const allFiles = useMemo(() => rootPath ? flattenTree(fileTree, rootPath) : [], [fileTree, rootPath]);

  useEffect(() => {
    if (open) {
      setQuery(initialMode === "commands" ? ">" : "");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialMode]);

  const { mode, text } = useMemo(() => parseMode(query), [query]);

  useEffect(() => {
    if (mode !== "symbols" || !open) return;
    setLoadingSymbols(true);
    const editor = getCurrentEditor();
    const monacoMod = getMonacoModule();
    if (!editor || !monacoMod) { setLoadingSymbols(false); return; }
    const model = editor.getModel();
    if (!model) { setLoadingSymbols(false); return; }
    const mm = monacoMod;
    const langs = mm.languages as unknown as { executeDocumentSymbolProvider: (uri: monaco.Uri | monaco.editor.ITextModel) => Promise<monaco.languages.DocumentSymbol[] | undefined> };
    langs.executeDocumentSymbolProvider(model.uri).then((result) => {
      if (!result) { setLoadingSymbols(false); return; }
      const items: SymbolInfo[] = [];
      function walk(symbols: monaco.languages.DocumentSymbol[]) {
        for (const s of symbols) {
          items.push({ name: s.name, kind: mm.languages.SymbolKind[s.kind] ?? "Symbol", range: s.range });
          if (s.children) walk(s.children);
        }
      }
      walk(result);
      symbolCache.current = items;
      setSymbols(items);
      setLoadingSymbols(false);
    }).catch(() => setLoadingSymbols(false));
  }, [mode, open]);

  const filteredFiles = useMemo(
    () => text ? fuzzyFilter(allFiles, text, (f) => `${f.name} ${f.dir}`) : allFiles,
    [allFiles, text],
  );

  const filteredCommands = useMemo(
    () => text ? fuzzyFilter(enrichedCommands, text, (c) => `${c.category} ${c.label}`) : enrichedCommands.filter((c) => c.keybinding),
    [enrichedCommands, text],
  );

  const filteredSymbols = useMemo(
    () => text ? fuzzyFilter(symbols, text, (s) => s.name) : symbols,
    [symbols, text],
  );

  const modeLabel = useMemo(() => {
    switch (mode) {
      case "files": return "Files";
      case "commands": return "Commands";
      case "symbols": return "Symbols";
      case "goto": return "Go to Line";
    }
  }, [mode]);

  const gotoLine = useMemo(() => {
    if (mode !== "goto") return null;
    const num = parseInt(text, 10);
    return isNaN(num) ? null : num;
  }, [mode, text]);

  const handleSelect = useCallback(
    (idx: number) => {
      if (mode === "files") {
        const item = filteredFiles[idx];
        if (!item) return;
        void openFile(item.path).then(() => setActiveTab(item.path));
      } else if (mode === "commands") {
        const cmd = filteredCommands[idx];
        if (cmd) { cmd.action(); }
      } else if (mode === "symbols") {
        const sym = filteredSymbols[idx];
        if (!sym) return;
        const editor = getCurrentEditor();
        if (editor) {
          editor.revealRangeInCenter(sym.range);
          editor.setPosition({ lineNumber: sym.range.startLineNumber, column: sym.range.startColumn });
          editor.focus();
        }
      } else if (mode === "goto" && gotoLine) {
        const editor = getCurrentEditor();
        if (editor) {
          editor.revealLineInCenter(gotoLine);
          editor.setPosition({ lineNumber: gotoLine, column: 1 });
          editor.focus();
        }
      }
      onClose();
    },
    [mode, filteredFiles, filteredCommands, filteredSymbols, gotoLine, openFile, setActiveTab, onClose],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        const len = mode === "files" ? filteredFiles.length
          : mode === "commands" ? filteredCommands.length
            : mode === "symbols" ? filteredSymbols.length
              : gotoLine ? 1 : 0;
        if (len === 0) return;
        e.preventDefault();
        setActiveIdx((p) => Math.min(p + 1, len - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((p) => Math.max(p - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        handleSelect(activeIdx);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, mode, filteredFiles, filteredCommands, filteredSymbols, gotoLine, activeIdx, handleSelect, onClose]);

  if (!open) return null;

  const resultCount = mode === "files" ? filteredFiles.length
    : mode === "commands" ? filteredCommands.length
      : mode === "symbols" ? filteredSymbols.length
        : gotoLine ? 1 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-popover shadow-2xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            placeholder="Search files... (type > for commands, @ for symbols, : for line)"
            className="h-10 border-0 bg-transparent pl-9 pr-2 text-sm shadow-none focus-visible:ring-0"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {modeLabel}
          </span>
        </div>

        <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
          {resultCount > 0 ? `${resultCount} result${resultCount !== 1 ? "s" : ""}` : mode === "goto" && !gotoLine ? "Enter a line number" : "No results"}
          {mode === "goto" && gotoLine && activeTab && ` — Line ${gotoLine} in ${activeTab.name}`}
        </div>

        <ScrollArea className="max-h-80">
          {mode === "files" && (
            <div className="py-1">
              {filteredFiles.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {rootPath ? "No matching files" : "Open a folder to search files"}
                </p>
              ) : (
                filteredFiles.map((file, i) => (
                  <button
                    key={file.path}
                    onClick={() => handleSelect(i)}
                    className={cn(
                      "flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-muted",
                      activeIdx === i && "bg-muted",
                    )}
                  >
                    <File className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{file.name}</span>
                    {file.dir && (
                      <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground/60 max-w-[120px]">
                        {file.dir}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "commands" && (
            <div className="py-1">
              {filteredCommands.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No matching commands</p>
              ) : (
                filteredCommands.map((cmd, i) => (
                  <button
                    key={cmd.id}
                    onClick={() => handleSelect(i)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm hover:bg-muted",
                      activeIdx === i && "bg-muted",
                    )}
                  >
                    <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{cmd.label}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/60">{cmd.category}</span>
                    {cmd.keybinding && (
                      <kbd className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {cmd.keybinding}
                      </kbd>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "symbols" && (
            <div className="py-1">
              {loadingSymbols ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading symbols...</p>
              ) : filteredSymbols.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {symbols.length === 0 ? "No symbols available in current file" : "No matching symbols"}
                </p>
              ) : (
                filteredSymbols.map((sym, i) => (
                  <button
                    key={`${sym.name}:${sym.range.startLineNumber}`}
                    onClick={() => handleSelect(i)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm hover:bg-muted",
                      activeIdx === i && "bg-muted",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center rounded bg-muted-foreground/10 text-[9px] font-mono text-muted-foreground">
                      {SYMBOL_ICONS[sym.kind] ?? "?"}
                    </span>
                    <span className="truncate">{sym.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">Line {sym.range.startLineNumber}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "goto" && (
            <div className="py-1">
              {gotoLine ? (
                <button
                  onClick={() => handleSelect(0)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted",
                    "bg-muted",
                  )}
                >
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>Go to Line <kbd className="rounded border border-border bg-background px-1 font-mono text-xs">{gotoLine}</kbd></span>
                </button>
              ) : (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Type a line number</p>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
