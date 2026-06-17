import type { FileNode } from "@/types/file";

/**
 * Detect the path separator used in a path string.
 */
export function detectSeparator(path: string): "\\" | "/" {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

/**
 * Join a parent path with a child name using the correct separator.
 */
export function joinPath(parent: string, name: string): string {
  return parent.replace(/[\\/]+$/, "") + detectSeparator(parent) + name;
}

/**
 * Return the parent directory of a path, or null if there is no parent.
 */
export function parentPath(path: string): string | null {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (idx === -1) return null;
  // Root path — no parent
  if (path.length === 1 && (path[0] === '/' || path[0] === '\\')) return null;
  if (idx === 0) return path.slice(0, 1);
  if (/^[A-Z]:[\\/]$/i.test(path)) return null;
  if (/^[A-Z]:[\\/]/i.test(path) && idx === 2) return path.slice(0, 3);
  return path.slice(0, idx);
}

/**
 * Return the last component of a path (file name or directory name).
 */
export function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (idx === -1) return path;
  return path.slice(idx + 1);
}

/**
 * Return the root folder name from a root path (for display purposes).
 */
export function nameFromRoot(rootPath: string): string {
  return basename(rootPath) || rootPath;
}

/**
 * Validate a file/folder name. Throws on invalid names.
 */
export function validateName(name: string): void {
  if (!name || name === "." || name === "..") {
    throw new Error("Invalid name");
  }
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new Error("Name cannot contain path separators or NUL");
  }
}

/**
 * Apply custom ordering to a file tree, preserving the sort order
 * specified by the user for each directory.
 */
export function applyCustomOrder(
  tree: FileNode[],
  customOrder: Record<string, string[]>,
): FileNode[] {
  return tree.map((node) => {
    if (node.kind === "directory" && node.children) {
      const order = customOrder[node.path];
      let orderedChildren: FileNode[];
      if (order && order.length > 0) {
        const childMap = new Map<string, FileNode>();
        const unordered: FileNode[] = [];
        for (const child of node.children) {
          if (order.includes(child.name)) {
            childMap.set(child.name, child);
          } else {
            unordered.push(child);
          }
        }
        orderedChildren = [];
        for (const name of order) {
          const child = childMap.get(name);
          if (child) {
            orderedChildren.push(child);
            childMap.delete(name);
          }
        }
        unordered.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { numeric: true });
        });
        orderedChildren.push(...unordered);
      } else {
        orderedChildren = [...node.children];
      }
      orderedChildren = applyCustomOrder(orderedChildren, customOrder);
      return { ...node, children: orderedChildren };
    }
    return node;
  });
}

const IS_WINDOWS =
  typeof navigator !== "undefined" && /win/i.test(navigator.platform ?? "");

/**
 * Return the deepest directory that is an ancestor of every path in the list.
 * For a single file, returns its parent directory. Returns null when no
 * common directory exists (e.g. files on different drives).
 */
export function findCommonParent(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const norm = IS_WINDOWS ? (s: string) => s.toLowerCase() : (s: string) => s;
  const splitParts = (p: string): string[] => p.split(/[\\/]+/).filter(Boolean);
  const sep = (p: string) =>
    p.includes("\\") && !p.includes("/") ? "\\" : "/";

  const firstParts = splitParts(paths[0]);
  if (firstParts.length === 0) return null;

  let commonLen = firstParts.length;
  for (let i = 1; i < paths.length; i++) {
    const parts = splitParts(paths[i]);
    let j = 0;
    while (
      j < commonLen &&
      j < parts.length &&
      norm(firstParts[j]) === norm(parts[j])
    ) {
      j++;
    }
    commonLen = j;
    if (commonLen === 0) return null;
  }

  // For a single input path, the deepest common directory is its parent
  // (drop the last path segment). For multiple inputs the deepest common
  // directory is what we already computed.
  const finalLen = paths.length === 1 ? commonLen - 1 : commonLen;
  if (finalLen <= 0) return null;

  // Reconstruct the common prefix with proper separators and drive letter handling
  const sepChar = sep(paths[0]);
  const driveMatch = paths[0].match(/^([A-Za-z]:)/);
  const isAbsolute = paths[0].startsWith("/") || paths[0].startsWith("\\") || !!driveMatch;

  // The first part is a drive letter (e.g., "C:") â€” handle it separately
  if (driveMatch && finalLen === 1) {
    return driveMatch[1] + sepChar;
  }

  // Build the path starting from index 1 (skip drive letter if present)
  // because drive letters need a separator prefix differently
  const startIdx = driveMatch ? 1 : 0;
  const joined = firstParts.slice(startIdx, finalLen).join(sepChar);

  if (driveMatch) {
    return driveMatch[1] + sepChar + joined;
  }

  return isAbsolute ? sepChar + joined : joined;
}
