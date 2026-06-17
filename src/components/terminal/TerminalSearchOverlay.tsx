import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { SearchAddon } from "@xterm/addon-search";

interface TerminalSearchOverlayProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
}

export function TerminalSearchOverlay({ searchAddon, onClose }: TerminalSearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [resultIndex, setResultIndex] = useState(0);
  const [resultCount, setResultCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(
    (q: string, incremental = false) => {
      if (!searchAddon || !q) {
        setResultCount(0);
        setResultIndex(0);
        searchAddon?.clearActiveSearch();
        return;
      }
      const count = searchAddon.findOptions(q, { incremental, regex: false, caseSensitive: false, wholeWord: false });
      setResultCount(count);
      setResultIndex(count > 0 ? searchAddon.activeMatchIndex ?? 0 : 0);
    },
    [searchAddon],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      doSearch(val, true);
    },
    [doSearch],
  );

  const findNext = useCallback(() => {
    if (!searchAddon || !query) return;
    searchAddon.findNext(query, { regex: false, caseSensitive: false, wholeWord: false });
    setResultIndex(searchAddon.activeMatchIndex ?? 0);
  }, [searchAddon, query]);

  const findPrev = useCallback(() => {
    if (!searchAddon || !query) return;
    searchAddon.findPrevious(query, { regex: false, caseSensitive: false, wholeWord: false });
    setResultIndex(searchAddon.activeMatchIndex ?? 0);
  }, [searchAddon, query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) findPrev();
        else findNext();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        searchAddon?.clearActiveSearch();
        onClose();
      }
    },
    [findNext, findPrev, searchAddon, onClose],
  );

  return (
    <div
      className="absolute top-0 right-0 z-50 flex items-center gap-1.5 bg-[#1e1e1e] border border-[#333] px-2 py-1.5 text-xs shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <svg className="h-3 w-3 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Find…"
        className="w-40 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground"
      />
      {query && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
          {resultCount > 0 ? `${resultIndex + 1}/${resultCount}` : "0/0"}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        <button
          onClick={findPrev}
          disabled={!query || resultCount === 0}
          className="p-0.5 rounded hover:bg-[#333] disabled:opacity-30 text-muted-foreground"
          title="Previous match (Shift+Enter)"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          onClick={findNext}
          disabled={!query || resultCount === 0}
          className="p-0.5 rounded hover:bg-[#333] disabled:opacity-30 text-muted-foreground"
          title="Next match (Enter)"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      <button
        onClick={() => { searchAddon?.clearActiveSearch(); onClose(); }}
        className="p-0.5 rounded hover:bg-[#333] text-muted-foreground ml-1"
        title="Close (Esc)"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
