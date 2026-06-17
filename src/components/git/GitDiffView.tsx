import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ChevronDown, ChevronRight, Columns2, AlignJustify, X,
  ArrowUpToLine, ArrowDownToLine, CheckSquare,
  Search, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGitStore } from "@/stores/gitStore";
import { cn } from "@/lib/utils";
import { DiffSkeleton } from "@/components/ui/skeleton";
import type { DiffHunk, DiffLine } from "@/types/git";

interface Props {
  path: string;
  staged: boolean;
  onClose: () => void;
}

function lineClass(type: string, selected: boolean, highlighted: boolean): string {
  return cn(
    "flex leading-5 whitespace-pre-wrap cursor-pointer transition-colors",
    type === "added" && "bg-green-500/10 text-green-400/90",
    type === "removed" && "bg-red-500/10 text-red-400/90",
    type === "context" && "text-foreground/70",
    selected && "ring-1 ring-inset ring-blue-400/60 bg-blue-500/10",
    highlighted && "bg-yellow-500/15",
  );
}

function HunkLine({
  line,
  selected,
  highlighted,
  isSearchMatch,
  onClick,
}: {
  line: DiffLine;
  selected: boolean;
  highlighted: boolean;
  isSearchMatch: boolean;
  onClick: () => void;
}) {
  const oldStr = line.oldLineNumber !== null ? String(line.oldLineNumber) : "";
  const newStr = line.newLineNumber !== null ? String(line.newLineNumber) : "";
  const content = isSearchMatch ? (
    <span className="font-bold">{line.content}</span>
  ) : (
    line.content
  );
  return (
    <div className={lineClass(line.type, selected, highlighted)} onClick={onClick}>
      <span className="w-[52px] shrink-0 text-right tabular-nums text-foreground/40 select-none">
        {oldStr && <span className="mr-1">{oldStr}</span>}
      </span>
      <span className="w-[52px] shrink-0 text-right tabular-nums text-foreground/40 select-none border-r border-border/40 mr-2 pr-2">
        {newStr && <span>{newStr}</span>}
      </span>
      <span className="flex-1 text-[13px] leading-relaxed">{content}</span>
    </div>
  );
}

function HunkBlock({
  hunk,
  collapsed,
  selectedLines,
  searchQuery,
  currentMatchIdx,
  matchIndices,
  onToggleCollapse,
  onToggleLine,
  onStage,
  onUnstage,
  staged,
  hunkIdx,
}: {
  hunk: DiffHunk;
  collapsed: boolean;
  selectedLines: Set<number>;
  searchQuery: string;
  currentMatchIdx: number;
  matchIndices: number[];
  onToggleCollapse: () => void;
  onToggleLine: (lineIdx: number) => void;
  onStage: () => void;
  onUnstage: () => void;
  staged: boolean;
  hunkIdx: number;
}) {
  const headerLabel = hunk.sectionHeader
    ? `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@ ${hunk.sectionHeader}`
    : `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;

  return (
    <div className="border-b border-border/40" id={`hunk-${hunkIdx}`}>
      <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 sticky top-0 z-10">
        <button
          onClick={onToggleCollapse}
          className="p-0.5 hover:bg-muted rounded"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <span className="flex-1 text-[11px] font-mono text-blue-400/70 truncate">
          {headerLabel}
        </span>
        {staged ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={onUnstage}
            className="h-6 text-[11px] gap-1 text-orange-400 hover:text-orange-300"
          >
            <ArrowDownToLine className="size-3" />
            Unstage
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={onStage}
            className="h-6 text-[11px] gap-1 text-green-400 hover:text-green-300"
          >
            <ArrowUpToLine className="size-3" />
            Stage
          </Button>
        )}
        {!staged && selectedLines.size > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onStage}
            className="h-6 text-[11px] gap-1 text-blue-400 hover:text-blue-300"
          >
            <CheckSquare className="size-3" />
            Stage {selectedLines.size} line{selectedLines.size > 1 ? "s" : ""}
          </Button>
        )}
      </div>
      {!collapsed && (
        <div className="px-2 py-1">
          {hunk.lines.map((line, idx) => {
            const globalLineIdx = matchIndices.indexOf(idx);
            const isCurrentMatch = globalLineIdx === currentMatchIdx && currentMatchIdx >= 0;
            return (
              <HunkLine
                key={idx}
                line={line}
                selected={selectedLines.has(idx)}
                highlighted={isCurrentMatch}
                isSearchMatch={searchQuery !== "" && line.content.toLowerCase().includes(searchQuery.toLowerCase())}
                onClick={() => onToggleLine(idx)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GitDiffView({ path, staged, onClose }: Props) {
  const diffHunkCache = useGitStore((s) => s.diffHunkCache);
  const getDiffHunks = useGitStore((s) => s.getDiffHunks);
  const stageHunk = useGitStore((s) => s.stageHunk);
  const unstageHunk = useGitStore((s) => s.unstageHunk);
  const stageLines = useGitStore((s) => s.stageLines);
  const error = useGitStore((s) => s.error);

  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<"inline" | "side-by-side">("inline");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selectedLines, setSelectedLines] = useState<Map<number, Set<number>>>(new Map());
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(-1);

  const cacheKey = `${staged ? "staged:" : ""}${path}`;
  const hunks = diffHunkCache[cacheKey];

  useEffect(() => {
    if (!hunks) {
      setLoading(true);
      getDiffHunks(path, staged).finally(() => setLoading(false));
    }
  }, [path, staged, cacheKey, hunks, getDiffHunks]);

  const toggleCollapse = useCallback((hunkIndex: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(hunkIndex)) next.delete(hunkIndex);
      else next.add(hunkIndex);
      return next;
    });
  }, []);

  const toggleLine = useCallback((hunkIndex: number, lineIdx: number) => {
    setSelectedLines((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(hunkIndex) || []);
      if (set.has(lineIdx)) set.delete(lineIdx);
      else set.add(lineIdx);
      if (set.size === 0) next.delete(hunkIndex);
      else next.set(hunkIndex, set);
      return next;
    });
  }, []);

  const handleStageHunk = useCallback(async (hunkIndex: number) => {
    setActionLoading(true);
    await stageHunk(path, hunkIndex);
    setActionLoading(false);
    containerRef.current?.focus();
  }, [path, stageHunk, containerRef]);

  const handleUnstageHunk = useCallback(async (hunkIndex: number) => {
    setActionLoading(true);
    await unstageHunk(path, hunkIndex);
    setActionLoading(false);
    containerRef.current?.focus();
  }, [path, unstageHunk, containerRef]);

  const handleStageSelected = useCallback(async () => {
    if (selectedLines.size === 0) return;
    setActionLoading(true);
    const selections = Array.from(selectedLines.entries()).map(([hunkIndex, lineIndices]) => ({
      hunkIndex,
      lineIndices: Array.from(lineIndices),
    }));
    await stageLines(path, selections);
    setSelectedLines(new Map());
    setActionLoading(false);
    containerRef.current?.focus();
  }, [path, selectedLines, stageLines, containerRef]);

  const allMatchIndices = useMemo(() => {
    if (!searchQuery || !hunks) return new Map<number, number[]>();
    const q = searchQuery.toLowerCase();
    const map = new Map<number, number[]>();
    for (const hunk of hunks) {
      const indices: number[] = [];
      hunk.lines.forEach((line, idx) => {
        if (line.content.toLowerCase().includes(q)) indices.push(idx);
      });
      if (indices.length > 0) map.set(hunk.index, indices);
    }
    return map;
  }, [searchQuery, hunks]);

  const totalMatches = useMemo(() => {
    let count = 0;
    for (const indices of allMatchIndices.values()) count += indices.length;
    return count;
  }, [allMatchIndices]);

  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const next = (currentMatch + 1) % totalMatches;
    setCurrentMatch(next);
    let cumulative = 0;
    for (const [hunkIdx, indices] of allMatchIndices) {
      if (cumulative + indices.length > next) {
        setCollapsed((prev) => {
          const c = new Set(prev);
          c.delete(hunkIdx);
          return c;
        });
        setTimeout(() => {
          document.getElementById(`hunk-${hunkIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        break;
      }
      cumulative += indices.length;
    }
  }, [currentMatch, totalMatches, allMatchIndices]);

  const goToPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    const prev = (currentMatch - 1 + totalMatches) % totalMatches;
    setCurrentMatch(prev);
    let cumulative = 0;
    for (const [hunkIdx, indices] of allMatchIndices) {
      if (cumulative + indices.length > prev) {
        setCollapsed((prevC) => {
          const c = new Set(prevC);
          c.delete(hunkIdx);
          return c;
        });
        setTimeout(() => {
          document.getElementById(`hunk-${hunkIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        break;
      }
      cumulative += indices.length;
    }
  }, [currentMatch, totalMatches, allMatchIndices]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!hunks || hunks.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
          <span className="text-xs font-medium text-foreground">
            Diff: {path.split("/").pop()}
            {staged && <span className="ml-2 text-green-500">(staged)</span>}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={onClose}>
              <X className="size-3" />
            </Button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No changes
        </div>
      </div>
    );
  }

  const totalSelected = Array.from(selectedLines.values()).reduce((sum, s) => sum + s.size, 0);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "F3" || (e.key === "g" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      if (e.shiftKey) goToPrevMatch();
      else goToNextMatch();
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "Enter" && !staged) {
      e.preventDefault();
      const firstExpanded = hunks?.find((h) => !collapsed.has(h.index));
      if (firstExpanded) handleStageHunk(firstExpanded.index);
    }
    if (mod && e.key === "Backspace" && staged) {
      e.preventDefault();
      const firstExpanded = hunks?.find((h) => !collapsed.has(h.index));
      if (firstExpanded) handleUnstageHunk(firstExpanded.index);
    }
  }, [hunks, collapsed, staged, handleStageHunk, handleUnstageHunk, goToNextMatch, goToPrevMatch]);

  return (
    <div ref={containerRef} className="flex h-full flex-col" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="flex h-auto shrink-0 flex-col border-b border-border">
        <div className="flex h-9 items-center justify-between px-3">
          <span className="text-xs font-medium text-foreground">
            Diff: {path.split("/").pop()}
            {staged && <span className="ml-2 text-green-500">(staged)</span>}
            {hunks && <span className="ml-2 text-muted-foreground">({hunks.length} hunk{hunks.length > 1 ? "s" : ""})</span>}
          </span>
          <div className="flex items-center gap-1">
            {totalSelected > 0 && (
              <Button
                variant="secondary"
                size="xs"
                onClick={handleStageSelected}
                disabled={actionLoading}
                className="h-6 text-[11px] gap-1"
              >
                <CheckSquare className="size-3" />
                Stage selected ({totalSelected})
              </Button>
            )}
            <Button
              variant={mode === "inline" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setMode("inline")}
              title="Inline view"
            >
              <AlignJustify className="size-3" />
            </Button>
            <Button
              variant={mode === "side-by-side" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setMode("side-by-side")}
              title="Side by side"
            >
              <Columns2 className="size-3" />
            </Button>
            <Button variant="ghost" size="xs" onClick={onClose}>
              <X className="size-3" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-1 px-3 pb-1.5">
          <Search className="size-3 text-muted-foreground shrink-0" />
          <Input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentMatch(-1); }}
            placeholder="Search diff..."
            className="h-7 text-xs border-0 px-0 focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) goToPrevMatch();
                else goToNextMatch();
              }
            }}
          />
          {searchQuery && (
            <>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {totalMatches > 0 ? `${currentMatch + 1}/${totalMatches}` : "0/0"}
              </span>
              <Button variant="ghost" size="xs" onClick={goToPrevMatch} disabled={totalMatches === 0} className="h-6">
                <ArrowUp className="size-3" />
              </Button>
              <Button variant="ghost" size="xs" onClick={goToNextMatch} disabled={totalMatches === 0} className="h-6">
                <ArrowDown className="size-3" />
              </Button>
              <Button variant="ghost" size="xs" onClick={() => { setSearchQuery(""); setCurrentMatch(-1); }} className="h-6">
                <X className="size-3" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs">
        {loading ? (
          <DiffSkeleton />
        ) : !hunks ? (
          <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
            No diff available.
          </div>
        ) : mode === "side-by-side" ? (
          sideBySideView(hunks, collapsed, selectedLines, toggleLine, searchQuery, currentMatch, allMatchIndices)
        ) : (
          hunks.map((hunk) => (
            <HunkBlock
              key={hunk.index}
              hunk={hunk}
              collapsed={collapsed.has(hunk.index)}
              selectedLines={selectedLines.get(hunk.index) || new Set()}
              searchQuery={searchQuery}
              currentMatchIdx={currentMatch}
              matchIndices={allMatchIndices.get(hunk.index) || []}
              onToggleCollapse={() => toggleCollapse(hunk.index)}
              onToggleLine={(lineIdx) => toggleLine(hunk.index, lineIdx)}
              onStage={() => handleStageHunk(hunk.index)}
              onUnstage={() => handleUnstageHunk(hunk.index)}
              staged={staged}
              hunkIdx={hunk.index}
            />
          ))
        )}
      </div>
    </div>
  );
}

function sideBySideView(
  hunks: DiffHunk[],
  collapsed: Set<number>,
  selectedLines: Map<number, Set<number>>,
  toggleLine: (hunkIndex: number, lineIdx: number) => void,
  _searchQuery: string,
  currentMatchIdx: number,
  allMatchIndices: Map<number, number[]>,
) {
  const removed: { hunkIdx: number; lineIdx: number; line: DiffLine }[] = [];
  const added: { hunkIdx: number; lineIdx: number; line: DiffLine }[] = [];

  for (const hunk of hunks) {
    if (collapsed.has(hunk.index)) continue;
    for (let i = 0; i < hunk.lines.length; i++) {
      const line = hunk.lines[i];
      if (line.type === "removed") {
        removed.push({ hunkIdx: hunk.index, lineIdx: i, line });
      } else if (line.type === "added") {
        added.push({ hunkIdx: hunk.index, lineIdx: i, line });
      } else {
        removed.push({ hunkIdx: hunk.index, lineIdx: i, line });
        added.push({ hunkIdx: hunk.index, lineIdx: i, line });
      }
    }
  }

  const isCurrentMatch = (hunkIdx: number, lineIdx: number) => {
    const indices = allMatchIndices.get(hunkIdx);
    if (!indices) return false;
    const globalIdx = indices.indexOf(lineIdx);
    return globalIdx >= 0 && globalIdx === currentMatchIdx;
  };

  return (
    <div className="flex w-full h-full">
      <div className="w-1/2 overflow-auto border-r border-border p-2">
        {removed.map((item, i) => (
          <div
            key={`r-${i}`}
            className={lineClass(item.line.type, selectedLines.get(item.hunkIdx)?.has(item.lineIdx) ?? false, isCurrentMatch(item.hunkIdx, item.lineIdx))}
            onClick={() => toggleLine(item.hunkIdx, item.lineIdx)}
          >
            <span className="w-[52px] shrink-0 text-right tabular-nums text-foreground/40 select-none">
              {item.line.oldLineNumber !== null ? String(item.line.oldLineNumber) : ""}
            </span>
            <span className="flex-1 ml-2 text-[13px]">{item.line.content}</span>
          </div>
        ))}
      </div>
      <div className="w-1/2 overflow-auto p-2">
        {added.map((item, i) => (
          <div
            key={`a-${i}`}
            className={lineClass(item.line.type, selectedLines.get(item.hunkIdx)?.has(item.lineIdx) ?? false, isCurrentMatch(item.hunkIdx, item.lineIdx))}
            onClick={() => toggleLine(item.hunkIdx, item.lineIdx)}
          >
            <span className="w-[52px] shrink-0 text-right tabular-nums text-foreground/40 select-none">
              {item.line.newLineNumber !== null ? String(item.line.newLineNumber) : ""}
            </span>
            <span className="flex-1 ml-2 text-[13px]">{item.line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
