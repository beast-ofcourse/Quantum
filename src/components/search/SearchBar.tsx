import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Search, File, Terminal, ArrowRight, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fuzzyFilter } from "@/lib/fuzzySearch";
import { getAllCommands } from "@/lib/commandRegistry";
import { useFileStore } from "@/stores/fileStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSearchStore, type SearchMode, type SearchResult } from "@/stores/searchStore";
import { searchInFiles } from "@/tauri/search";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKeybindingStore } from "@/stores/keybindingStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getCurrentEditor, getMonacoModule } from "@/extensions/editorRef";
import { getPlatformModifier } from "@/lib/platform";
import type { FileNode } from "@/types/file";
import type * as monaco from "monaco-editor";

interface FlatFile {
  path: string;
  name: string;
  dir: string;
}

interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
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

function detectMode(query: string): { mode: SearchMode; text: string } {
  if (query.startsWith(">")) return { mode: "commands", text: query.slice(1) };
  if (query.startsWith("@")) return { mode: "symbols", text: query.slice(1) };
  if (query.startsWith(":")) return { mode: "goto", text: query.slice(1) };
  if (query.startsWith("%")) return { mode: "fulltext", text: query.slice(1) };
  return { mode: "files", text: query };
}

const MODE_LABELS: Record<SearchMode, string> = {
  files: "Files",
  commands: "Commands",
  symbols: "Symbols",
  fulltext: "Full-Text",
  goto: "Go to Line",
};

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

function formatQuery(text: string): string {
  return text.trim();
}

export function SearchBar() {
  const {
    query,
    results,
    activeIndex,
    isDropdownOpen,
    isLoading,
    setQuery,
    setResults,
    setActiveIndex,
    setDropdownOpen,
    setIsLoading,
    reset,
  } = useSearchStore();

  const [symbolCache, setSymbolCache] = useState<SymbolInfo[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fileTree = useFileStore((s) => s.fileTree);
  const rootPath = useFileStore((s) => s.rootPath);
  const openFile = useEditorStore((s) => s.openFile);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const overrides = useKeybindingStore((s) => s.overrides);
  const exclude = useSettingsStore((s) => s.search.excludePatterns);
  const maxResults = useSettingsStore((s) => s.search.maxResults);

  const { mode, text } = useMemo(() => detectMode(query), [query]);

  const allFiles = useMemo(() => (rootPath ? flattenTree(fileTree, rootPath) : []), [fileTree, rootPath]);
  const allCommands = useMemo(() => getAllCommands(), []);

  const enrichedCommands = useMemo(
    () =>
      allCommands.map((cmd) => {
        const override = overrides[cmd.id];
        const effective = override ? override : cmd.keybinding;
        return { ...cmd, keybinding: effective || undefined };
      }),
    [allCommands, overrides],
  );

  // Load symbols on demand
  useEffect(() => {
    if (mode !== "symbols" || !isDropdownOpen) return;
    setIsLoading(true);
    const editor = getCurrentEditor();
    const monacoMod = getMonacoModule();
    if (!editor || !monacoMod) {
      setIsLoading(false);
      setSymbolCache([]);
      return;
    }
    const model = editor.getModel();
    if (!model) {
      setIsLoading(false);
      setSymbolCache([]);
      return;
    }
    const mm = monacoMod as unknown as {
      languages: {
        executeDocumentSymbolProvider: (
          uri: monaco.Uri | monaco.editor.ITextModel,
        ) => Promise<monaco.languages.DocumentSymbol[] | undefined>;
        SymbolKind: Record<number, string>;
      };
    };
    mm.languages
      .executeDocumentSymbolProvider(model.uri)
      .then((result) => {
        if (!result) {
          setSymbolCache([]);
          setIsLoading(false);
          return;
        }
        const items: SymbolInfo[] = [];
        function walk(symbols: monaco.languages.DocumentSymbol[]) {
          for (const s of symbols) {
            items.push({ name: s.name, kind: mm.languages.SymbolKind[s.kind] ?? "Symbol", line: s.range.startLineNumber });
            if (s.children) walk(s.children);
          }
        }
        walk(result);
        setSymbolCache(items);
        setIsLoading(false);
      })
      .catch(() => {
        setSymbolCache([]);
        setIsLoading(false);
      });
  }, [mode, isDropdownOpen, setIsLoading]);

  // Compute results based on mode and query
  useEffect(() => {
    if (!isDropdownOpen || !query) {
      setResults([]);
      return;
    }

    const q = formatQuery(text);

    switch (mode) {
      case "files": {
        const filtered = q ? fuzzyFilter(allFiles, q, (f) => `${f.name} ${f.dir}`) : allFiles;
        setResults(filtered.map((f) => ({ type: "file" as const, ...f })));
        break;
      }
      case "commands": {
        if (!q) {
          setResults(enrichedCommands.map((c) => ({ type: "command" as const, ...c, icon: undefined })));
          return;
        }
        const filtered = fuzzyFilter(enrichedCommands, q, (c) => `${c.category} ${c.label}`);
        setResults(filtered.map((c) => ({ type: "command" as const, ...c, icon: undefined })));
        break;
      }
      case "symbols": {
        if (!q) {
          setResults(symbolCache.map((s) => ({ type: "symbol" as const, ...s })));
          return;
        }
        const filtered = fuzzyFilter(symbolCache, q, (s) => s.name);
        setResults(filtered.map((s) => ({ type: "symbol" as const, ...s })));
        break;
      }
      case "goto": {
        const line = parseInt(q, 10);
        if (isNaN(line)) {
          setResults([]);
          return;
        }
        setResults([{ type: "goto" as const, line }]);
        break;
      }
      case "fulltext": {
        if (!q || !rootPath) {
          if (!q) setResults([]);
          return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setIsLoading(true);
        debounceRef.current = setTimeout(async () => {
          try {
            const matches = await searchInFiles(rootPath, q, {
              excludePatterns: exclude,
              maxResults,
            });
            setResults(matches.map((m) => ({ type: "fulltext" as const, match: m })));
          } catch {
            setResults([]);
          } finally {
            setIsLoading(false);
          }
        }, 300);
        return () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
        };
      }
    }
  }, [mode, text, allFiles, enrichedCommands, symbolCache, isDropdownOpen, query, rootPath, exclude, maxResults, setResults, setIsLoading]);

  const handleSelect = useCallback(
    (idx: number) => {
      const item = results[idx];
      if (!item) return;

      switch (item.type) {
        case "file":
          void openFile(item.path).then(() => setActiveTab(item.path));
          break;
        case "command":
          item.action();
          break;
        case "symbol":
          {
            const editor = getCurrentEditor();
            if (editor) {
              editor.revealLineInCenter(item.line);
              editor.setPosition({ lineNumber: item.line, column: 1 });
              editor.focus();
            }
          }
          break;
        case "fulltext":
          void openFile(item.match.path).then(() => setActiveTab(item.match.path));
          break;
        case "goto":
          {
            const editor = getCurrentEditor();
            if (editor) {
              editor.revealLineInCenter(item.line);
              editor.setPosition({ lineNumber: item.line, column: 1 });
              editor.focus();
            }
          }
          break;
      }

      setDropdownOpen(false);
      inputRef.current?.blur();
    },
    [results, openFile, setActiveTab, setDropdownOpen],
  );

  // Keyboard handlers
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex(Math.min(activeIndex + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex(Math.max(activeIndex - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results.length > 0) handleSelect(activeIndex);
          break;
        case "Escape":
          e.preventDefault();
          if (query) {
            reset();
          } else {
            setDropdownOpen(false);
            inputRef.current?.blur();
          }
          break;
      }
    },
    [activeIndex, results, handleSelect, query, reset, setActiveIndex, setDropdownOpen],
  );

  // Click outside to close
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [isDropdownOpen, setDropdownOpen]);

  const resultCount = results.length;
  const noRootMsg = !rootPath && mode === "files" && isDropdownOpen;
  const emptyMsg = query && results.length === 0 && !isLoading && mode !== "goto";

  return (
    <div ref={containerRef} className="relative flex-shrink-0" style={{ minWidth: 200, maxWidth: 400 }}>
      <div
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 transition-all duration-150",
          isDropdownOpen
            ? "border-ring/50 ring-[2px] ring-ring/20"
            : "border-border hover:border-muted-foreground/30",
        )}
      >
        <Search className="size-3 shrink-0 text-muted-foreground/60" />
        {mode !== "files" && (
          <span className="text-[10px] font-mono font-semibold text-muted-foreground/50 shrink-0">
            {query[0]}
          </span>
        )}
        <input
          ref={inputRef}
          data-search-bar-input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isDropdownOpen) setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
        />
        {isLoading && <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground/50" />}
        {query && !isLoading && (
          <button onClick={() => reset()} className="shrink-0 text-muted-foreground/40 hover:text-foreground">
            <X className="size-3" />
          </button>
        )}
        {!query && (
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-border bg-background/50 px-1.5 py-0.5 text-[9px] text-muted-foreground/50 sm:flex">
            <span>{getPlatformModifier() === "Cmd" ? "⌘" : "Ctrl"}</span>
            <span>P</span>
          </kbd>
        )}
      </div>

      {isDropdownOpen && (
        <div className="absolute left-1/2 top-full z-50 mt-1 w-[90vw] max-w-[500px] -translate-x-1/2">
          <div className="overflow-hidden rounded-lg border border-border bg-popover shadow-2xl">
            {/* Header */}
            <div className="border-b border-border px-3 py-1.5">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground/80">
                  {MODE_LABELS[mode]}
                </span>
                {resultCount > 0 && (
                  <span>
                    {resultCount} result{resultCount !== 1 ? "s" : ""}
                  </span>
                )}
                {mode === "files" && !rootPath && <span>Open a folder to search files</span>}
              </div>
            </div>

            {/* Results */}
            <ScrollArea className="max-h-[320px]">
              {isLoading && mode !== "fulltext" && mode !== "symbols" ? null : null}
              {isLoading && mode === "fulltext" && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Searching...
                </div>
              )}
              {isLoading && mode === "symbols" && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Loading symbols...
                </div>
              )}
              {emptyMsg && !isLoading && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {mode === "commands"
                    ? "No matching commands"
                    : mode === "symbols"
                      ? symbolCache.length === 0
                        ? "No symbols in current file"
                        : "No matching symbols"
                      : mode === "fulltext"
                        ? "No results found"
                        : "No matching files"}
                </p>
              )}
              {noRootMsg && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Open a folder to search files</p>
              )}

              {resultCount > 0 && (
                <div className="py-1">
                  {results.map((item, i) => (
                    <button
                      key={itemKey(item, i)}
                      onClick={() => handleSelect(i)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-4 py-1.5 text-left text-xs hover:bg-accent/50",
                        activeIndex === i && "bg-accent",
                      )}
                    >
                      {item.type === "file" && (
                        <>
                          <File className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{item.name}</span>
                          {item.dir && (
                            <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground/50 max-w-[120px]">
                              {item.dir}
                            </span>
                          )}
                        </>
                      )}
                      {item.type === "command" && (
                        <>
                          <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{item.label}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground/50">{item.category}</span>
                          {item.keybinding && (
                            <kbd className="shrink-0 rounded border border-border bg-background/50 px-1.5 py-0.5 text-[9px] text-muted-foreground/60">
                              {item.keybinding}
                            </kbd>
                          )}
                        </>
                      )}
                      {item.type === "symbol" && (
                        <>
                          <span className="flex size-4 shrink-0 items-center justify-center rounded bg-muted-foreground/10 text-[9px] font-mono text-muted-foreground">
                            {SYMBOL_ICONS[item.kind] ?? "?"}
                          </span>
                          <span className="truncate">{item.name}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">
                            Line {item.line}
                          </span>
                        </>
                      )}
                      {item.type === "fulltext" && (
                        <>
                          <File className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{item.match.path}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground/50">
                            :{item.match.line}
                          </span>
                        </>
                      )}
                      {item.type === "goto" && (
                        <>
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                          <span>
                            Go to Line{" "}
                            <kbd className="rounded border border-border bg-background/50 px-1 font-mono text-xs">
                              {item.line}
                            </kbd>
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border px-3 py-1.5">
              <div className="flex gap-3 text-[9px] text-muted-foreground/50">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>Esc Close</span>
                <span className="ml-auto">Type &gt; @ : % for modes</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function itemKey(item: SearchResult, _i: number): string {
  switch (item.type) {
    case "file": return `f:${item.path}`;
    case "command": return `c:${item.id}`;
    case "symbol": return `s:${item.name}:${item.line}`;
    case "fulltext": return `ft:${item.match.path}:${item.match.line}:${item.match.column}`;
    case "goto": return `g:${item.line}`;
  }
}
