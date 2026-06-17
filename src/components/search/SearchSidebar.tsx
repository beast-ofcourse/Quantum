import { useState, useCallback, useRef, useMemo } from "react";
import {
  Search,
  X,
  Replace,
  ArrowUp,
  ArrowDown,
  File,
  Loader2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { searchInFiles, replaceInFiles } from "@/tauri/search";
import type { SearchMatch } from "@/tauri/search";
import { cn } from "@/lib/utils";
import { getFileName } from "@/lib/languages";

interface SearchOptionsState {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

function MatchHighlight({ text, query, useRegex }: { text: string; query: string; useRegex: boolean }) {
  if (!query.trim()) return <>{text}</>;
  try {
    const pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = text.split(regex);
    if (parts.length === 1) return <>{text}</>;
    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="rounded-sm bg-amber-400/30 text-foreground">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

function getRoot() {
  const root = useFileStore.getState().rootPath;
  const cleanRoot = root?.replace(/[/\\]+$/, "") ?? "";
  const sep =
    typeof process !== "undefined" && process.platform === "win32" ? "\\" : "/";
  return { root, cleanRoot, sep };
}

function resolvePath(match: SearchMatch) {
  const { cleanRoot, sep } = getRoot();
  if (!cleanRoot) return match.path;
  const cleanPath = match.path.replace(/^[/\\]+/, "");
  return `${cleanRoot}${sep}${cleanPath}`;
}

export function SearchSidebar() {
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [searchOpts, setSearchOpts] = useState<SearchOptionsState>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootPath = useFileStore((s) => s.rootPath);
  const openFile = useEditorStore((s) => s.openFile);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const exclude = useSettingsStore((s) => s.search.excludePatterns);
  const maxResults = useSettingsStore((s) => s.search.maxResults);

  const doSearch = useCallback(
    async (q: string, opts: SearchOptionsState) => {
      if (!q.trim() || !rootPath) {
        setResults([]);
        setActiveIndex(-1);
        setError(null);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const matches = await searchInFiles(rootPath, q, {
          excludePatterns: exclude,
          maxResults,
          caseSensitive: opts.caseSensitive,
          wholeWord: opts.wholeWord,
          useRegex: opts.useRegex,
        });
        setResults(matches);
        setActiveIndex(matches.length > 0 ? 0 : -1);
        setCollapsedFiles(new Set());
      } catch (err) {
        setResults([]);
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSearching(false);
      }
    },
    [rootPath, exclude, maxResults],
  );

  const scheduleSearch = useCallback(
    (q: string, opts: SearchOptionsState) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(q, opts), 300);
    },
    [doSearch],
  );

  const handleQueryChange = (q: string) => {
    setQuery(q);
    scheduleSearch(q, searchOpts);
  };

  const toggleOpt = (key: keyof SearchOptionsState) => {
    const next = { ...searchOpts, [key]: !searchOpts[key] };
    setSearchOpts(next);
    if (query.trim()) doSearch(query, next);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setError(null);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    inputRef.current?.focus();
  };

  const handleOpen = useCallback(
    (match: SearchMatch) => {
      openFile(resolvePath(match));
      setActiveTab(resolvePath(match));
    },
    [openFile, setActiveTab],
  );

  const [replacing, setReplacing] = useState(false);
  const handleReplaceAll = useCallback(async () => {
    if (!query.trim() || !rootPath || results.length === 0) return;
    setReplacing(true);
    try {
      const count = await replaceInFiles(rootPath, query, replaceText, {
        excludePatterns: exclude,
        caseSensitive: searchOpts.caseSensitive,
        wholeWord: searchOpts.wholeWord,
        useRegex: searchOpts.useRegex,
      });
      setResults([]);
      setError(`Replaced ${count} occurrence${count !== 1 ? "s" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setReplacing(false);
    }
  }, [query, replaceText, rootPath, results.length, exclude, searchOpts]);

  const toggleCollapseFile = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const navigateResult = (dir: -1 | 1) => {
    if (results.length === 0) return;
    setActiveIndex((prev) => {
      const next = prev + dir;
      if (next < 0) return results.length - 1;
      if (next >= results.length) return 0;
      return next;
    });
  };

  const fileGroups = useMemo(() => {
    const groups = new Map<string, SearchMatch[]>();
    for (const m of results) {
      const list = groups.get(m.path) ?? [];
      list.push(m);
      groups.set(m.path, list);
    }
    return groups;
  }, [results]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="space-y-2 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search files…"
            className="h-8 pl-7 pr-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (query.trim()) doSearch(query, searchOpts);
                if (e.shiftKey) navigateResult(-1);
                else navigateResult(1);
              }
              if (e.key === "Escape") handleClear();
            }}
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ToggleBtn
            active={searchOpts.caseSensitive}
            label="Aa"
            tooltip="Match Case"
            onClick={() => toggleOpt("caseSensitive")}
          />
          <ToggleBtn
            active={searchOpts.wholeWord}
            label="ab"
            tooltip="Match Whole Word"
            onClick={() => toggleOpt("wholeWord")}
          />
          <ToggleBtn
            active={searchOpts.useRegex}
            label=".*"
            tooltip="Use Regular Expression"
            onClick={() => toggleOpt("useRegex")}
          />

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="xs"
            className={cn("gap-1 text-xs", showReplace && "text-foreground")}
            onClick={() => setShowReplace(!showReplace)}
          >
            <Replace className="size-3" />
            Replace
          </Button>

          {results.length > 0 && (
            <>
              <Button variant="ghost" size="icon-xs" onClick={() => navigateResult(-1)}>
                <ArrowUp className="size-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => navigateResult(1)}>
                <ArrowDown className="size-3" />
              </Button>
            </>
          )}
        </div>

        {showReplace && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace with…"
                className="h-8 pl-2 pr-2 text-xs"
              />
            </div>
            {results.length > 0 && (
              <Button
                variant="outline"
                size="xs"
                className="shrink-0 text-xs gap-1"
                onClick={handleReplaceAll}
                disabled={replacing}
              >
                {replacing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Replace className="size-3" />
                )}
                {replacing ? "..." : "All"}
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div
          className={cn(
            "px-3 py-2 text-xs border-t border-border",
            error.startsWith("Replaced")
              ? "text-foreground bg-muted/50"
              : "text-destructive",
          )}
        >
          {error}
        </div>
      )}

      <ScrollArea className="flex-1">
        {searching ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Searching…
          </div>
        ) : query && results.length === 0 && !error ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">No results found.</p>
        ) : query && results.length > 0 ? (
          <div className="pb-2">
            {query && results.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
                <span>
                  {results.length} result{results.length !== 1 ? "s" : ""} in {fileGroups.size} file
                  {fileGroups.size !== 1 ? "s" : ""}
                </span>
                {collapsedFiles.size > 0 && (
                  <button
                    onClick={() => setCollapsedFiles(new Set())}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Expand all
                  </button>
                )}
              </div>
            )}
            {Array.from(fileGroups.entries()).map(([filePath, matches]) => {
              const isCollapsed = collapsedFiles.has(filePath);
              return (
                <div key={filePath}>
                  <button
                    onClick={() => toggleCollapseFile(filePath)}
                    className="flex w-full items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground hover:bg-muted/50"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="size-3 shrink-0" />
                    ) : (
                      <ChevronDown className="size-3 shrink-0" />
                    )}
                    <File className="size-3 shrink-0" />
                    <span className="truncate font-medium">{getFileName(filePath)}</span>
                    <span className="shrink-0 ml-auto tabular-nums">{matches.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div>
                      {matches.map((match) => {
                        const globalIdx = results.indexOf(match);
                        return (
                          <button
                            key={`${match.path}:${match.line}:${match.column}`}
                            onClick={() => {
                              handleOpen(match);
                              setActiveIndex(globalIdx);
                            }}
                            className={cn(
                              "flex w-full items-start gap-1.5 px-3 py-0.5 text-left text-xs hover:bg-muted/50",
                              activeIndex === globalIdx && "bg-muted",
                            )}
                          >
                            <span
                              className={cn(
                                "shrink-0 tabular-nums",
                                activeIndex === globalIdx
                                  ? "text-foreground"
                                  : "text-muted-foreground/60",
                              )}
                            >
                              {match.line}
                            </span>
                            <span className="truncate text-foreground/80">
                              <MatchHighlight
                                text={match.lineContent.trim()}
                                query={query}
                                useRegex={searchOpts.useRegex}
                              />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}

function ToggleBtn({
  active,
  label,
  tooltip,
  onClick,
}: {
  active: boolean;
  label: string;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={cn(
        "flex size-6 items-center justify-center rounded-md text-xs font-mono leading-none transition-colors",
        active
          ? "bg-accent text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
      )}
    >
      {label}
    </button>
  );
}
