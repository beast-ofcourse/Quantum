/// <reference lib="webworker" />

import type {
  FileEntry,
  FileNode,
  FileTreeWorkerRequest,
  FileTreeWorkerResponse,
} from "@/types/file";

type GlobRule = {
  pattern: string;
  regex: RegExp;
  dirOnly: boolean;
  negate: boolean;
  anchored: boolean;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function compilePattern(raw: string): GlobRule | null {
  let pattern = raw.trim();
  if (!pattern || pattern.startsWith("#")) return null;

  let negate = false;
  if (pattern.startsWith("!")) {
    negate = true;
    pattern = pattern.slice(1);
  }
  pattern = pattern.replace(/^\/+/, "");
  const dirOnly = pattern.endsWith("/");
  if (dirOnly) {
    pattern = pattern.slice(0, -1);
    if (!pattern) return null;
  }

  const anchored = pattern.includes("/");

  let regexSource = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        regexSource += ".*";
        i += 2;
        if (pattern[i] === "/") i += 1;
      } else {
        regexSource += "[^/]*";
        i += 1;
      }
    } else if (ch === "?") {
      regexSource += "[^/]";
      i += 1;
    } else if (ch === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close === -1) {
        regexSource += "\\[";
        i += 1;
      } else {
        regexSource += pattern.slice(i, close + 1);
        i = close + 1;
      }
    } else if (/[.+^$|(){}]/.test(ch)) {
      regexSource += "\\" + ch;
      i += 1;
    } else {
      regexSource += ch;
      i += 1;
    }
  }

  const regex = anchored
    ? new RegExp(`^${regexSource}(?:$|/)`)
    : new RegExp(`(?:^|/)${regexSource}(?:$|/)`);

  return { pattern: raw.trim(), regex, dirOnly, negate, anchored };
}

function parseGitignore(text: string | null): GlobRule[] {
  if (!text) return [];
  const rules: GlobRule[] = [];
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/^\\#/, "#");
    const rule = compilePattern(line);
    if (rule) rules.push(rule);
  }
  return rules;
}

function isIgnored(
  relPath: string,
  isDir: boolean,
  rules: GlobRule[],
): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.regex.test(relPath)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

function relPath(rootPath: string, absPath: string): string {
  const root = rootPath.replace(/[\\/]+$/, "");
  if (absPath === root) return "";
  if (absPath.startsWith(root + "/") || absPath.startsWith(root + "\\")) {
    return absPath.slice(root.length + 1);
  }
  return absPath;
}

function buildTree(
  rootPath: string,
  entries: FileEntry[],
  rules: GlobRule[],
  showHidden: boolean,
): FileNode[] {
  type Bucket = {
    name: string;
    path: string;
    isDir: boolean;
    children: Map<string, Bucket>;
  };
  const rootBucket: Bucket = {
    name: "",
    path: rootPath,
    isDir: true,
    children: new Map(),
  };
  const sep = rootPath.includes("\\") && !rootPath.includes("/") ? "\\" : "/";

  for (const entry of entries) {
    const rel = relPath(rootPath, entry.path);
    if (!rel) continue;
    const parts = rel.split(/[\\/]/);
    if (rel.startsWith(".") && !showHidden) continue;
    if (isIgnored(rel.replace(/[\\/]+/g, "/"), entry.isDir, rules)) continue;

    let cursor = rootBucket;
    let accPath = rootPath;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accPath = accPath + sep + part;
      const isLast = i === parts.length - 1;
      if (!cursor.children.has(part)) {
        cursor.children.set(part, {
          name: part,
          path: accPath,
          isDir: !isLast || entry.isDir,
          children: new Map(),
        });
      }
      cursor = cursor.children.get(part)!;
    }
  }

  const toNode = (bucket: Bucket): FileNode => {
    const node: FileNode = {
      name: bucket.name,
      path: bucket.path,
      kind: bucket.children.size > 0 ? "directory" : "file",
    };
    if (bucket.children.size > 0) {
      const kids: FileNode[] = [];
      for (const child of bucket.children.values()) {
        kids.push(toNode(child));
      }
      kids.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
      node.children = kids;
    }
    return node;
  };

  const result: FileNode[] = [];
  for (const child of rootBucket.children.values()) {
    result.push(toNode(child));
  }
  result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  return result;
}

ctx.addEventListener("message", (event: MessageEvent<FileTreeWorkerRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== "build") return;
  const { requestId, rootPath, entries, gitignore, showHidden } = msg;
  try {
    const rules = parseGitignore(gitignore);
    const tree = buildTree(rootPath, entries, rules, showHidden);
    const res: FileTreeWorkerResponse = { type: "built", requestId, tree };
    ctx.postMessage(res);
  } catch (err) {
    const res: FileTreeWorkerResponse = {
      type: "error",
      requestId,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(res);
  }
});

export {};
