import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  GitCommit, Search, RefreshCw, X, ArrowLeft,
  GitBranch, Tag, Globe, Copy, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useGitStore } from "@/stores/gitStore";
import { cn } from "@/lib/utils";
import { RebaseEditor } from "./RebaseEditor";
import { CherryPickDialog } from "./CherryPickDialog";
import { RevertDialog } from "./RevertDialog";
import { GraphSkeleton } from "@/components/ui/skeleton";
import type { GraphNode, GraphRef } from "@/types/git";

const COL_WIDTH = 24;
const ROW_HEIGHT = 32;
const NODE_RADIUS = 4;

interface LayoutPos {
  x: number;
  y: number;
  column: number;
}

function computeLayout(nodes: GraphNode[]): Map<string, LayoutPos> {
  const columns = new Map<string, number>();
  let nextCol = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.parents.length === 0) {
      if (!columns.has(node.hash)) {
        columns.set(node.hash, nextCol++);
      }
    } else {
      const fp = node.parents[0];
      if (columns.has(fp)) {
        columns.set(node.hash, columns.get(fp)!);
      } else if (!columns.has(node.hash)) {
        columns.set(node.hash, nextCol++);
      }
      for (let p = 1; p < node.parents.length; p++) {
        if (!columns.has(node.parents[p])) {
          columns.set(node.parents[p], nextCol++);
        }
      }
    }
  }

  const positions = new Map<string, LayoutPos>();
  for (let i = 0; i < nodes.length; i++) {
    const col = columns.get(nodes[i].hash) ?? 0;
    positions.set(nodes[i].hash, {
      x: col * COL_WIDTH + COL_WIDTH,
      y: i * ROW_HEIGHT + ROW_HEIGHT,
      column: col,
    });
  }
  return positions;
}

interface EdgePath {
  from: { x: number; y: number };
  to: { x: number; y: number };
  style: "solid" | "merge" | "dotted";
  color: string;
}

const BRANCH_COLORS = [
  "#60a5fa", "#a78bfa", "#f472b6", "#34d399", "#fbbf24",
  "#fb923c", "#f87171", "#2dd4bf", "#818cf8", "#e879f9",
];

function computeEdges(
  nodes: GraphNode[],
  positions: Map<string, LayoutPos>,
): EdgePath[] {
  const edges: EdgePath[] = [];
  for (const node of nodes) {
    const pos = positions.get(node.hash);
    if (!pos) continue;
    for (let p = 0; p < node.parents.length; p++) {
      const parentPos = positions.get(node.parents[p]);
      if (!parentPos) continue;
      const color = BRANCH_COLORS[pos.column % BRANCH_COLORS.length];
      if (p === 0) {
        if (pos.column === parentPos.column) {
          edges.push({ from: pos, to: parentPos, style: "solid", color });
        } else {
          edges.push({ from: pos, to: parentPos, style: "dotted", color });
        }
      } else {
        const mergeColor = BRANCH_COLORS[parentPos.column % BRANCH_COLORS.length];
        edges.push({ from: pos, to: parentPos, style: "merge", color: mergeColor });
      }
    }
  }
  return edges;
}

function edgePath(d: EdgePath): string {
  if (d.style === "solid") {
    return `M ${d.from.x} ${d.from.y - NODE_RADIUS} L ${d.to.x} ${d.to.y + NODE_RADIUS}`;
  }
  if (d.style === "dotted") {
    const midX = (d.from.x + d.to.x) / 2;
    return `M ${d.from.x} ${d.from.y} L ${midX} ${d.from.y} L ${midX} ${d.to.y} L ${d.to.x} ${d.to.y}`;
  }
  const midY = (d.from.y + d.to.y) / 2;
  return `M ${d.from.x} ${d.from.y - NODE_RADIUS} C ${d.from.x} ${midY}, ${d.to.x} ${midY}, ${d.to.x} ${d.to.y + NODE_RADIUS}`;
}

function RefBadge({ ref }: { ref: GraphRef }) {
  const colors: Record<string, string> = {
    head: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    branch: "bg-green-500/20 text-green-400 border-green-500/40",
    tag: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    remote: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  };
  const icons: Record<string, React.ReactNode> = {
    head: <GitBranch className="size-2.5" />,
    branch: <GitBranch className="size-2.5" />,
    tag: <Tag className="size-2.5" />,
    remote: <Globe className="size-2.5" />,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-mono leading-none whitespace-nowrap",
        colors[ref.refType] ?? "bg-gray-500/20 text-gray-400",
      )}
    >
      {icons[ref.refType] ?? null}
      <span className="truncate max-w-[100px]">{ref.name}</span>
    </span>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function GitGraphView() {
  const graphData = useGitStore((s) => s.graphData);
  const graphLoading = useGitStore((s) => s.graphLoading);
  const selectedCommitHash = useGitStore((s) => s.selectedCommitHash);
  const commitDetail = useGitStore((s) => s.commitDetail);
  const commitDetailLoading = useGitStore((s) => s.commitDetailLoading);
  const fetchGraph = useGitStore((s) => s.fetchGraph);
  const selectCommit = useGitStore((s) => s.selectCommit);
  const getCommitDetail = useGitStore((s) => s.getCommitDetail);
  const checkout = useGitStore((s) => s.checkout);
  const createBranch = useGitStore((s) => s.createBranch);
  const createTag = useGitStore((s) => s.createTag);
  const refreshBranches = useGitStore((s) => s.refreshBranches);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [rebaseTarget, setRebaseTarget] = useState<string | undefined>();
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [cherryPickHash, setCherryPickHash] = useState<string | undefined>();
  const [cherryPickOpen, setCherryPickOpen] = useState(false);
  const [revertHash, setRevertHash] = useState<string | undefined>();
  const [revertOpen, setRevertOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [listHeight, setListHeight] = useState(400);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(timer);
  }, [search]);

  // Track scroll container height for virtualized list
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setListHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodes = graphData?.nodes ?? [];
  const refs = graphData?.refs ?? [];

  const authors = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) set.add(n.author);
    return Array.from(set).sort();
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (n) =>
          n.message.toLowerCase().includes(q) ||
          n.hash.toLowerCase().includes(q) ||
          n.author.toLowerCase().includes(q),
      );
    }
    if (authorFilter !== "all") {
      result = result.filter((n) => n.author === authorFilter);
    }
    return result;
  }, [nodes, debouncedSearch, authorFilter]);

  const allPositions = useMemo(() => computeLayout(nodes), [nodes]);
  // Recalculate y-positions for filtered nodes (keep columns from full layout)
  const filteredPositions = useMemo(() => {
    const map = new Map<string, LayoutPos>();
    for (let i = 0; i < filteredNodes.length; i++) {
      const hash = filteredNodes[i].hash;
      const origPos = allPositions.get(hash);
      if (origPos) {
        map.set(hash, {
          x: origPos.x,
          y: (i + 1) * ROW_HEIGHT,
          column: origPos.column,
        });
      }
    }
    return map;
  }, [filteredNodes, allPositions]);

  // Recompute edges for the filtered set only
  const filteredEdges = useMemo(
    () => computeEdges(filteredNodes, filteredPositions),
    [filteredNodes, filteredPositions],
  );

  // Virtualization: which nodes are visible in the current viewport?
  const OVERSCAN = 10;
  const totalHeight = (filteredNodes.length + 1) * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor((scrollTop - ROW_HEIGHT) / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(filteredNodes.length, Math.ceil((scrollTop + listHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleNodes = filteredNodes.slice(startIdx, endIdx);
  const visibleEdges = useMemo(
    () => {
      if (filteredNodes.length === 0) return [];
      const viewTop = (startIdx + 1) * ROW_HEIGHT - OVERSCAN * ROW_HEIGHT;
      const viewBottom = (endIdx + 1) * ROW_HEIGHT + OVERSCAN * ROW_HEIGHT;
      return filteredEdges.filter(
        (e) => (e.from.y >= viewTop && e.from.y <= viewBottom) || (e.to.y >= viewTop && e.to.y <= viewBottom),
      );
    },
    [filteredEdges, startIdx, endIdx],
  );

  const handleNodeClick = useCallback(
    (hash: string) => {
      selectCommit(hash);
      getCommitDetail(hash);
    },
    [selectCommit, getCommitDetail],
  );

  const selectNextCommit = useCallback((dir: 1 | -1) => {
    if (filteredNodes.length === 0) return;
    const currentIdx = selectedCommitHash
      ? filteredNodes.findIndex((n) => n.hash === selectedCommitHash)
      : -1;
    let nextIdx = currentIdx + dir;
    if (nextIdx < 0) nextIdx = filteredNodes.length - 1;
    if (nextIdx >= filteredNodes.length) nextIdx = 0;
    const next = filteredNodes[nextIdx];
    if (next) handleNodeClick(next.hash);
  }, [filteredNodes, selectedCommitHash, handleNodeClick]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectNextCommit(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectNextCommit(-1);
    } else if (e.key === "Enter" && selectedCommitHash) {
      e.preventDefault();
      handleNodeClick(selectedCommitHash);
    } else if (e.key === "Escape") {
      selectCommit(null);
    }
  }, [selectNextCommit, selectedCommitHash, handleNodeClick, selectCommit]);

  const selectedNode = selectedCommitHash
    ? nodes.find((n) => n.hash === selectedCommitHash)
    : null;

  const nodeRefs = useMemo(() => {
    const map = new Map<string, GraphRef[]>();
    for (const ref of refs) {
      const list = map.get(ref.hash) ?? [];
      list.push(ref);
      map.set(ref.hash, list);
    }
    return map;
  }, [refs]);

  const handleCheckout = useCallback(
    async (hash: string) => {
      await checkout(hash);
      await refreshBranches();
      fetchGraph();
    },
    [checkout, refreshBranches, fetchGraph],
  );

  const handleCreateBranch = useCallback(
    async (hash: string) => {
      const name = prompt("Branch name:");
      if (name) {
        await createBranch(name, hash);
        await refreshBranches();
      }
    },
    [createBranch, refreshBranches],
  );

  const handleCopyHash = useCallback((hash: string) => {
    navigator.clipboard.writeText(hash).catch(() => {});
  }, []);

  const handleCherryPick = useCallback((hash: string) => {
    setCherryPickHash(hash);
    setCherryPickOpen(true);
  }, []);

  const handleRevert = useCallback((hash: string) => {
    setRevertHash(hash);
    setRevertOpen(true);
  }, []);

  const handleCreateTag = useCallback(async (hash: string) => {
    const name = prompt("Tag name:");
    if (name) await createTag(name, "", hash, true);
  }, [createTag]);

  const handleRebase = useCallback((hash: string) => {
    setRebaseTarget(hash);
    setRebaseOpen(true);
  }, []);

  const maxCol = allPositions.size > 0
    ? Math.max(1, ...Array.from(allPositions.values()).map((p) => p.column + 1))
    : 1;
  const graphWidth = Math.min(maxCol * COL_WIDTH + 20, 200);

  if (graphLoading && !graphData) {
    return <GraphSkeleton />;
  }

  return (
    <div className="flex h-full flex-col" tabIndex={0} onKeyDown={handleKeyDown}>
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <GitCommit className="size-3.5" />
          Graph
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => fetchGraph()}
          disabled={graphLoading}
        >
          <RefreshCw className={cn("size-3", graphLoading && "animate-spin")} />
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Search className="size-3 text-muted-foreground shrink-0" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter commits..."
          className="h-7 text-xs border-0 px-0 focus-visible:ring-0 flex-1"
        />
        {search && (
          <Button variant="ghost" size="xs" onClick={() => setSearch("")}>
            <X className="size-3" />
          </Button>
        )}
        {authors.length > 1 && (
          <Select value={authorFilter} onValueChange={setAuthorFilter}>
            <SelectTrigger className="h-7 w-auto text-xs gap-1 border-0 px-1">
              <User className="size-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All authors</SelectItem>
              {authors.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedCommitHash && selectedNode ? (
        <div className="flex flex-1 flex-col">
          <div className="flex h-8 items-center gap-2 border-b border-border px-3">
            <Button variant="ghost" size="xs" onClick={() => { selectCommit(null); }}>
              <ArrowLeft className="size-3" />
            </Button>
            <span className="text-xs font-medium">Commit Details</span>
          </div>
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {selectedNode.hash.slice(0, 8)}
                </code>
                <Button variant="ghost" size="xs" onClick={() => handleCopyHash(selectedNode.hash)} title="Copy hash">
                  <Copy className="size-3" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GitBranch className="size-3" />
                {selectedNode.author}
                <span className="text-muted-foreground/60">
                  {new Date(selectedNode.date).toLocaleString()}
                </span>
              </div>
              {nodeRefs.has(selectedNode.hash) && (
                <div className="flex flex-wrap gap-1">
                  {nodeRefs.get(selectedNode.hash)!.map((ref) => (
                    <RefBadge key={ref.name} ref={ref} />
                  ))}
                </div>
              )}
              {commitDetailLoading ? (
                <div className="text-xs text-muted-foreground">Loading...</div>
              ) : commitDetail ? (
                <>
                  {commitDetail.stats.length > 0 && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        Files changed
                      </span>
                      {commitDetail.stats.map((s) => (
                        <div key={s.path} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 truncate">{s.path}</span>
                          <span className="text-green-400">+{s.added}</span>
                          <span className="text-red-400">-{s.deleted}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80 max-h-48 overflow-auto rounded bg-muted/50 p-2">
                    {commitDetail.message || selectedNode.message}
                  </pre>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">No details</div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleCheckout(selectedNode.hash)}>
                  Checkout
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleCreateBranch(selectedNode.hash)}>
                  Create Branch
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {filteredNodes.length === 0 && !graphLoading ? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
              No commits found.
            </div>
          ) : (
            <div
              ref={scrollRef}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              className="flex-1 overflow-auto"
            >
              <div className="flex" style={{ minWidth: graphWidth + 400, position: 'relative', height: totalHeight }}>
                <div className="shrink-0" style={{ position: 'absolute', top: 0, left: 0, width: graphWidth, height: '100%' }}>
                  <svg width={graphWidth} height={totalHeight}>
                    {visibleEdges.map((e, i) => (
                      <path
                        key={i}
                        d={edgePath(e)}
                        fill="none"
                        stroke={e.color}
                        strokeWidth={e.style === "dotted" ? 1 : 1.5}
                        strokeDasharray={e.style === "dotted" ? "3,3" : undefined}
                        opacity={0.5}
                      />
                    ))}
                    {visibleNodes.map((node) => {
                      const pos = filteredPositions.get(node.hash);
                      if (!pos) return null;
                      const isSelected = node.hash === selectedCommitHash;
                      return (
                        <circle
                          key={`node-${node.hash}`}
                          cx={pos.x}
                          cy={pos.y}
                          r={isSelected ? NODE_RADIUS + 2 : NODE_RADIUS}
                          fill={node.parents.length > 1 ? "#a78bfa" : "#60a5fa"}
                          stroke={isSelected ? "#fff" : "transparent"}
                          strokeWidth={isSelected ? 1.5 : 0}
                          className="cursor-pointer"
                          onClick={() => handleNodeClick(node.hash)}
                        />
                      );
                    })}
                  </svg>
                </div>
                <div className="min-w-0" style={{ position: 'absolute', top: 0, left: graphWidth, right: 0, height: '100%' }}>
                  {visibleNodes.map((node, i) => {
                    const idx = startIdx + i;
                    const isSelected = node.hash === selectedCommitHash;
                    const refList = nodeRefs.get(node.hash) ?? [];
                    return (
                      <ContextMenu key={node.hash}>
                        <ContextMenuTrigger asChild>
                          <div
                            className={cn(
                              "flex items-center gap-2 px-2 cursor-pointer border-b border-border/40 hover:bg-accent/20 transition-colors",
                              isSelected && "bg-accent/30",
                            )}
                            style={{ position: 'absolute', top: (idx + 1) * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
                            onClick={() => handleNodeClick(node.hash)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium truncate">
                                  {node.message.split('\n')[0]}
                                </span>
                                {refList.length > 0 && (
                                  <div className="flex gap-1 flex-wrap shrink-0">
                                    {refList.map((ref) => (
                                      <RefBadge key={ref.name} ref={ref} />
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{node.author}</span>
                                <span>{formatDate(node.date)}</span>
                                <code className="text-muted-foreground/60">{node.hash.slice(0, 7)}</code>
                              </div>
                            </div>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => handleNodeClick(node.hash)}>
                            View Details
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => handleCopyHash(node.hash)}>
                            Copy Hash
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleCheckout(node.hash)}>
                            Checkout
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleCreateBranch(node.hash)}>
                            Create Branch
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => handleCherryPick(node.hash)}>
                            Cherry-pick
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleRevert(node.hash)}>
                            Revert
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => handleCreateTag(node.hash)}>
                            Create Tag
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => handleRebase(node.hash)}>
                            Rebase onto this commit...
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <RebaseEditor target={rebaseTarget} open={rebaseOpen} onOpenChange={setRebaseOpen} />
      <CherryPickDialog open={cherryPickOpen} onOpenChange={setCherryPickOpen} defaultHash={cherryPickHash} />
      <RevertDialog open={revertOpen} onOpenChange={setRevertOpen} defaultHash={revertHash} />
    </div>
  );
}
