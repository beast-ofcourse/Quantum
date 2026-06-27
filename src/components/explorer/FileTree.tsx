import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { FolderOpen, RefreshCw, Eye, EyeOff, X, FileText, FilePlus, FolderPlus, MoreHorizontal, AlertTriangle } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileTreeSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFileStore } from "@/stores/fileStore";
import { useHotkey } from "@/hooks/useHotkey";
import { pickFiles, pickFolder } from "@/tauri";
import { FileTreeNode } from "./FileTreeNode";
import { FileIcon } from "./FileIcon";
import { useExplorerActions } from "./useExplorerActions";
import { RenameInput } from "./RenameInput";
import type { FileNode, FileNodeKind } from "@/types/file";
import { cn } from "@/lib/utils";

const customCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  if (collisions.length <= 1) return collisions;
  const sorted = [...collisions].sort((a, b) => {
    const aIsDir = typeof a.id === "string" && a.id.startsWith("dir::");
    const bIsDir = typeof b.id === "string" && b.id.startsWith("dir::");
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return 0;
  });
  return sorted;
};

function findNode(tree: FileNode[], path: string): FileNode | undefined {
  for (const node of tree) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

function getChildNames(
  parentPath: string,
  tree: FileNode[],
  customOrder: Record<string, string[]>,
): string[] {
  const order = customOrder[parentPath];
  if (order && order.length > 0) {
    return [...order];
  }
  const parent = findNode(tree, parentPath);
  if (!parent?.children || parent.children.length === 0) return [];
  const sorted = [...parent.children].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  return sorted.map((c) => c.name);
}

function filterTree(tree: FileNode[], query: string): FileNode[] {
  if (!query) return tree;
  const q = query.toLowerCase();
  function matches(node: FileNode): boolean {
    if (node.name.toLowerCase().includes(q)) return true;
    if (node.children) return node.children.some(matches);
    return false;
  }
  return tree.filter(matches).map((node) => {
    if (node.children) {
      return { ...node, children: filterTree(node.children, query) };
    }
    return node;
  });
}

interface FlatNode {
  path: string;
  name: string;
  kind: FileNodeKind;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isDirectory: boolean;
  node: FileNode;
}

const ITEM_HEIGHT = 28;
const OVERSCAN = 10;

function flattenTree(node: FileNode, expandedSet: Set<string>, depth: number): FlatNode[] {
  const result: FlatNode[] = [];
  result.push({
    path: node.path,
    name: node.name,
    kind: node.kind,
    depth,
    isExpanded: expandedSet.has(node.path),
    hasChildren: node.kind === "directory" && !!node.children && node.children.length > 0,
    isDirectory: node.kind === "directory",
    node,
  });
  if (node.kind === "directory" && expandedSet.has(node.path) && node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child, expandedSet, depth + 1));
    }
  }
  return result;
}

function parentPath(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (idx <= 0) return "";
  return path.slice(0, idx);
}

export function FileTree() {
  const rootPath = useFileStore((s) => s.rootPath);
  const fileTree = useFileStore((s) => s.fileTree);
  const loading = useFileStore((s) => s.loading);
  const error = useFileStore((s) => s.error);
  const showHidden = useFileStore((s) => s.showHidden);
  const openFolder = useFileStore((s) => s.openFolder);
  const openFiles = useFileStore((s) => s.openFiles);
  const closeFolder = useFileStore((s) => s.closeFolder);
  const refreshTree = useFileStore((s) => s.refreshTree);
  const toggleHidden = useFileStore((s) => s.toggleHidden);
  const expandedRecord = useFileStore((s) => s.expanded);
  const treeTruncated = useFileStore((s) => s.treeTruncated);
  const { handleNewFile, handleNewFolder } = useExplorerActions();
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [activeDragData, setActiveDragData] = useState<{ name: string; kind: FileNodeKind; path: string } | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  useEffect(() => {
    if (searchVisible) {
      const input = document.querySelector<HTMLInputElement>("[data-explorer-search]");
      input?.focus();
    }
  }, [searchVisible]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onSearchChange = (value: string) => {
    setFilterQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 150);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { name: string; kind: FileNodeKind; path: string } | undefined;
    if (data) {
      setActiveDragData({ name: data.name, kind: data.kind, path: data.path });
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragData(null);

      try {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;
        const activeData = active.data.current as
          | { path: string; name: string; kind: string; parentPath: string }
          | undefined;

        if (!activeData) return;

        const state = useFileStore.getState();

        // Dropped on a directory → move into it
        if (overId.startsWith("dir::")) {
          const dirPath = overId.slice(5);
          if (activeData.kind === "directory") {
            if (
              activeData.path === dirPath ||
              dirPath.startsWith(activeData.path + "\\") ||
              dirPath.startsWith(activeData.path + "/")
            ) {
              return;
            }
          }
          await state.moveItem(activeId, dirPath);
          return;
        }

        // Dropped on an insertion point → reorder / move+reorder
        if (overId.startsWith("ins::")) {
          const parts = overId.split("::");
          const rawLast = parts[parts.length - 1];
          const index = rawLast === "end" ? Infinity : parseInt(rawLast, 10);
          const targetParent = parts.slice(1, -1).join("::");

          const tree = state.fileTree;

          // If moving to a different parent, first do the filesystem move, then reorder
          if (activeData.parentPath !== targetParent) {
            // Do the filesystem move first
            await state.moveItem(activeId, targetParent);

            // Then update custom order for source parent (remove the name)
            const srcNames = getChildNames(activeData.parentPath, tree, state.customOrder).filter(
              (n) => n !== activeData.name,
            );
            state.reorderItems(activeData.parentPath, srcNames);
          }

          // Reorder in target parent
          const freshState = useFileStore.getState();
          const targetNames = getChildNames(targetParent, freshState.fileTree, freshState.customOrder);
          const nameIndex = targetNames.indexOf(activeData.name);
          if (nameIndex !== -1) {
            targetNames.splice(nameIndex, 1);
          }
          const adjustedIndex = nameIndex !== -1 && nameIndex < index ? index - 1 : index;
          const insertAt = Math.min(Math.max(adjustedIndex, 0), targetNames.length);
          targetNames.splice(insertAt, 0, activeData.name);
          freshState.reorderItems(targetParent, targetNames);
          return;
        }
      } catch (err) {
        console.error("[FileTree] drag end failed:", err);
        useFileStore.setState({
          error: err instanceof Error ? err.message : "Drag-and-drop failed",
        });
      }
    },
    [],
  );

  const onOpenFolder = async () => {
    const picked = await pickFolder();
    if (picked) await openFolder(picked);
  };

  const onOpenFile = async () => {
    const picked = await pickFiles({ title: "Open File" });
    if (picked && picked.length > 0) {
      await openFiles(picked);
    }
  };

  const startCreate = (kind: "file" | "folder") => {
    setCreating(kind);
  };

  const handleCreateSubmit = async (name: string) => {
    if (!rootPath || !name) {
      setCreating(null);
      return;
    }
    try {
      if (creating === "file") {
        await handleNewFile(rootPath, name);
      } else {
        await handleNewFolder(rootPath, name);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(null);
    }
  };

  useHotkey({
    combo: "mod+k",
    description: "Open folder",
    handler: () => void onOpenFolder(),
  });

  useHotkey({
    combo: "mod+n",
    description: "New file",
    handler: () => { if (rootPath) startCreate("file"); },
  });

  useHotkey({
    combo: "mod+shift+n",
    description: "New folder",
    handler: () => { if (rootPath) startCreate("folder"); },
  });

  useHotkey({
    combo: "mod+shift+e",
    description: "Focus explorer search",
    handler: () => {
      setSearchVisible(true);
    },
  });

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => useFileStore.setState({ error: null }), 5000);
      return () => clearTimeout(id);
    }
  }, [error]);

  const displayTree = useMemo(() => filterTree(fileTree, debouncedQuery), [fileTree, debouncedQuery]);

  const expandedSet = useMemo(
    () => new Set(Object.keys(expandedRecord ?? {}).filter((k) => expandedRecord?.[k])),
    [expandedRecord],
  );

  const flatNodes = useMemo(() => {
    if (!displayTree || displayTree.length === 0) return [];
    const result: FlatNode[] = [];
    for (const node of displayTree) {
      result.push(...flattenTree(node, expandedSet, 0));
    }
    return result;
  }, [displayTree, expandedSet]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalHeight = flatNodes.length * ITEM_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(flatNodes.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
  const visibleNodes = flatNodes.slice(startIdx, endIdx);

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <FolderOpen className="size-10 opacity-50" />
        <p className="leading-relaxed">
          No folder opened.
          <br />
          Open a folder to start exploring.
        </p>
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="outline" onClick={onOpenFile}>
            <FileText className="size-3.5" />
            Open File…
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenFolder}>
            <FolderOpen className="size-3.5" />
            Open Folder…
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/70">Ctrl+O / Ctrl+K</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-7 shrink-0 items-center justify-end gap-0.5 px-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="New file"
              onClick={() => startCreate("file")}
            >
              <FilePlus className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New File</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="New folder"
              onClick={() => startCreate("folder")}
            >
              <FolderPlus className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New Folder</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="min-w-36">
            <DropdownMenuItem onClick={() => void refreshTree()} disabled={loading}>
              <RefreshCw className={cn("mr-2 size-3", loading && "animate-spin")} />
              Refresh
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleHidden}>
              {showHidden ? <EyeOff className="mr-2 size-3" /> : <Eye className="mr-2 size-3" />}
              {showHidden ? "Hide hidden files" : "Show hidden files"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={closeFolder}>
              <X className="mr-2 size-3" />
              Close folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {treeTruncated && (
        <div className="flex items-center gap-1 border-b border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3 shrink-0" />
          <span>Too many files — showing first ~20,000 entries. Use search or open a subfolder.</span>
        </div>
      )}

      <div className={cn("relative border-b border-border px-2 py-1", !searchVisible && !filterQuery && "hidden")}>
        <Input
          value={filterQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search files\u2026"
          className="h-7 text-xs"
          data-explorer-search
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFilterQuery("");
              setDebouncedQuery("");
              setSearchVisible(false);
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      {loading && fileTree.length === 0 ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-1">
          <FileTreeSkeleton />
        </div>
      ) : debouncedQuery && displayTree.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground">
            <p>No files match &ldquo;{debouncedQuery}&rdquo;</p>
          </div>
        </div>
      ) : fileTree.length === 0 && !loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground">
            <p>Empty folder</p>
            <div className="flex gap-1.5">
              <Button size="xs" variant="outline" onClick={() => startCreate("file")}>
                <FilePlus className="mr-1 size-3" />
                New File
              </Button>
              <Button size="xs" variant="outline" onClick={() => startCreate("folder")}>
                <FolderPlus className="mr-1 size-3" />
                New Folder
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {creating && (
            <div className="shrink-0 border-b border-border px-1 py-1">
              <RenameInput
                key={creating}
                initialValue=""
                placeholder={creating === "folder" ? "Folder name" : "File name"}
                onSubmit={handleCreateSubmit}
                onCancel={() => setCreating(null)}
                autoCreate={creating === "file" ? "file" : "folder"}
              />
            </div>
          )}
          {(() => {
            const treeContent = (
              <div
                ref={scrollRef}
                role="tree"
                aria-label="File Explorer"
                className="flex-1 overflow-y-auto overflow-x-hidden"
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              >
                <div style={{ height: totalHeight, position: "relative" }}>
                  {visibleNodes.map((flat, i) => {
                    const nodeIndex = startIdx + i;
                    return (
                      <div
                        key={flat.path}
                        style={{
                          position: "absolute",
                          top: nodeIndex * ITEM_HEIGHT,
                          left: 0,
                          right: 0,
                          height: ITEM_HEIGHT,
                        }}
                      >
                        <FileTreeNode
                          node={{ ...flat.node, children: undefined }}
                          depth={flat.depth}
                          parentPath={parentPath(flat.path)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );

            if (debouncedQuery) return treeContent;

            return (
              <DndContext
                sensors={sensors}
                collisionDetection={customCollisionDetection}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {treeContent}
                <DragOverlay dropAnimation={null}>
                  {activeDragData ? (
                    <div className="flex items-center gap-1.5 rounded-md bg-accent/80 px-2 py-1 text-sm shadow-lg backdrop-blur-sm">
                      <FileIcon
                        name={activeDragData.name}
                        isDir={activeDragData.kind === "directory"}
                      />
                      <span>{activeDragData.name}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            );
          })()}
        </>
      )}
    </div>
  );
}
