import React, { memo, useState } from "react";
import { ChevronRight, Terminal } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useFileStore } from "@/stores/fileStore";
import { useGitStore } from "@/stores/gitStore";
import { useGitDecorations } from "@/hooks/useGitDecorations";
import type { FileNode } from "@/types/file";
import type { GitStatusType } from "@/types/git";
import { cn } from "@/lib/utils";
import { FileIcon } from "./FileIcon";
import { useExplorerActions } from "./useExplorerActions";
import { openTerminalAtPath } from "@/lib/terminal-helpers";
import { useEditorActions } from "@/components/editor/useEditorActions";
import { RenameInput } from "./RenameInput";
import { InsertIndicator } from "./InsertIndicator";
import { DirDropTarget } from "./DirDropTarget";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  parentPath: string;
}

const GIT_BADGE: Record<GitStatusType, { label: string; className: string }> = {
  modified: { label: "M", className: "text-orange-500" },
  added: { label: "A", className: "text-green-500" },
  deleted: { label: "D", className: "text-red-500" },
  untracked: { label: "U", className: "text-muted-foreground" },
  conflict: { label: "C", className: "text-red-500" },
  renamed: { label: "R", className: "text-blue-500" },
};

function parentDir(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (idx <= 0) return path;
  return path.slice(0, idx);
}

export const FileTreeNode = memo(function FileTreeNode({ node, depth, parentPath }: FileTreeNodeProps) {
  const expanded = useFileStore((s) => s.expanded[node.path]) ?? false;
  const selectedFile = useFileStore((s) => s.selectedFile);
  const toggleExpand = useFileStore((s) => s.toggleExpand);
  const selectFile = useFileStore((s) => s.selectFile);
  const gitDecorations = useGitDecorations();
  const gitStatus = gitDecorations.get(node.path);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const { handleNewFile, handleNewFolder, handleRename, handleDelete, handleReveal } =
    useExplorerActions();
  const { openFromExplorer } = useEditorActions();

  const isDir = node.kind === "directory";
  const isSelected = selectedFile === node.path;

  const { listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: node.path,
    data: { path: node.path, name: node.name, kind: node.kind, parentPath },
  });

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const onClick = () => {
    if (isDir) {
      toggleExpand(node.path);
    } else {
      void openFromExplorer(node.path);
    }
    selectFile(node.path);
  };

  const onDoubleClick = () => {
    if (isDir) toggleExpand(node.path, true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "F2" && isSelected) {
      e.preventDefault();
      setRenameTarget(node.path);
    } else if (e.key === "Enter" && isDir) {
      toggleExpand(node.path, !expanded);
    } else if (e.key === "Delete" && isSelected) {
      handleDelete(node.path, isDir, node.name);
    }
  };

  const startCreate = (kind: "file" | "folder") => {
    toggleExpand(node.path, true);
    setCreating(kind);
  };

  const row = (
    <div
      ref={setNodeRef}
      role="treeitem"
      aria-expanded={isDir ? expanded : undefined}
      aria-selected={isSelected}
      data-path={node.path}
      tabIndex={0}
      style={dragStyle}
      {...listeners}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      className={cn(
        "group flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1 text-sm outline-none",
        "hover:bg-accent/60",
        isSelected && "bg-accent text-accent-foreground",
        "focus-visible:ring-1 focus-visible:ring-ring",
        isDragging && "opacity-50",
      isDir && "file-tree-folder",
      )}
    >
      {isDir ? (
        <ChevronRight
          className={cn(
            "file-tree-folder-icon size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      <FileIcon
        name={node.name}
        isDir={isDir}
        open={isDir ? expanded : false}
      />
      {renameTarget === node.path ? (
        <RenameInput
          initialValue={node.name}
          onSubmit={(newName: string) => {
            setRenameTarget(null);
            if (newName && newName !== node.name) {
              void handleRename(node.path, newName);
            }
          }}
          onCancel={() => setRenameTarget(null)}
        />
      ) : (
        <span className="truncate">{node.name}</span>
      )}
      {gitStatus && (
        <span data-git-badge={gitStatus} className={cn("ml-auto text-[10px] font-bold tabular-nums", GIT_BADGE[gitStatus]?.className)}>
          {GIT_BADGE[gitStatus]?.label}
        </span>
      )}
    </div>
  );

  const treeItem = (
    <ContextMenu
      onOpenChange={(open: boolean) => {
        if (open) selectFile(node.path);
      }}
    >
      <ContextMenuTrigger asChild>
        {row}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {isDir && (
          <>
            <ContextMenuItem onSelect={() => startCreate("file")}>
              New File…
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => startCreate("folder")}>
              New Folder…
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => void openTerminalAtPath(node.path)}>
              <Terminal className="size-3.5" />
              Open in Integrated Terminal
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => setRenameTarget(node.path)}>
          Rename
          <span className="ml-auto text-xs text-muted-foreground">F2</span>
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => handleDelete(node.path, isDir, node.name)}
        >
          Delete
          <span className="ml-auto text-xs text-muted-foreground">Del</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => handleReveal(node.path)}>
          Reveal in File Explorer
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!gitStatus}
          onSelect={() => {
            useGitStore.getState().stage([node.path]);
          }}
        >
          Stage Changes
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!gitStatus}
          onSelect={() => {
            useGitStore.getState().getDiff(node.path);
          }}
        >
          View Diff
        </ContextMenuItem>
      </ContextMenuContent>

      {isDir && expanded && (
        <div role="group">
          {creating && (
            <RenameInput
              key={creating}
              initialValue=""
              placeholder={creating === "folder" ? "Folder name" : "File name"}
              onSubmit={async (name: string) => {
                const parent = isDir ? node.path : parentDir(node.path);
                if (!name) {
                  setCreating(null);
                  return;
                }
                try {
                  if (creating === "file") {
                    await handleNewFile(parent, name);
                  } else {
                    await handleNewFolder(parent, name);
                  }
                } catch (err) {
                  console.error(err);
                } finally {
                  setCreating(null);
                }
              }}
              onCancel={() => setCreating(null)}
              autoCreate={creating === "file" ? "file" : "folder"}
              style={{ paddingLeft: (depth + 1) * 12 + 4 }}
            />
          )}
          {node.children?.map((child, index) => (
            <React.Fragment key={child.path}>
              <InsertIndicator parentPath={node.path} index={index} />
              <FileTreeNode
                node={child}
                depth={depth + 1}
                parentPath={node.path}
              />
            </React.Fragment>
          ))}
          <InsertIndicator parentPath={node.path} index={node.children?.length ?? 0} />
        </div>
      )}
    </ContextMenu>
  );

  if (isDir) {
    return <DirDropTarget path={node.path}>{treeItem}</DirDropTarget>;
  }
  return treeItem;
});
