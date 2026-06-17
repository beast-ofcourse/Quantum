/// <reference lib="webworker" />

import type {
  GitCommit,
  GitStatus,
  LogOptions,
} from "@/types/git";

export interface GitWorkerRequest {
  type: "status" | "diff" | "diff_hunks" | "log" | "branches" | "blame" | "remotes" | "stashes" | "submodules" | "tags" | "branch_compare" | "stash_show" | "worktrees" | "bisect_log" | "invalidate";
  requestId: string;
  root: string;
  path?: string;
  staged?: boolean;
  logOptions?: LogOptions;
  base?: string;
  head?: string;
  index?: number;
  cacheType?: string;
}

export interface GitWorkerResponse {
  type: "result" | "error";
  requestId: string;
  result?: unknown;
  error?: string;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const lruCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_MAX = 100;

const CACHE_TTL: Record<string, number> = {
  status: 2_000,
  graph: 30_000,
  tags: 30_000,
  remotes: 30_000,
  worktrees: 30_000,
  bisect_log: 30_000,
  branch_compare: 15_000,
  stashes: 10_000,
  stash_show: 10_000,
  diff_hunks: 0,
};

function cacheType(key: string): string {
  return key.split(":")[0];
}

function cacheGet<T>(key: string): T | null {
  const entry = lruCache.get(key);
  if (!entry) return null;
  const ttl = CACHE_TTL[cacheType(key)] ?? 5_000;
  if (ttl > 0 && Date.now() - entry.ts > ttl) {
    lruCache.delete(key);
    return null;
  }
  lruCache.delete(key);
  lruCache.set(key, entry);
  return entry.data as T;
}

function cacheSet(key: string, data: unknown): void {
  if (lruCache.size >= CACHE_MAX) {
    const first = lruCache.keys().next().value;
    if (first) lruCache.delete(first);
  }
  lruCache.set(key, { data, ts: Date.now() });
}

function cacheInvalidate(type: string): void {
  const prefix = `${type}:`;
  for (const key of lruCache.keys()) {
    if (key.startsWith(prefix)) lruCache.delete(key);
  }
}

let gitModule: typeof import("@/tauri/git") | null = null;
let modulePromise: Promise<void> | null = null;

async function ensureModule(): Promise<typeof import("@/tauri/git")> {
  if (gitModule) return gitModule;
  if (!modulePromise) {
    modulePromise = import("@/tauri/git").then((m) => {
      gitModule = m;
    });
  }
  await modulePromise;
  return gitModule!;
}

ctx.addEventListener("message", async (event: MessageEvent<GitWorkerRequest>) => {
  const msg = event.data;
  if (!msg || !msg.type) return;
  const { requestId, root, type, path, staged, logOptions } = msg;

  try {
    const mod = await ensureModule();
    let result: unknown;

    switch (type) {
      case "status": {
        const cacheKey = `status:${root}`;
        const cached = cacheGet<GitStatus>(cacheKey);
        if (cached) {
          result = cached;
        } else {
          const status = await mod.gitStatus(root);
          cacheSet(cacheKey, status);
          result = status;
        }
        break;
      }
      case "diff": {
        result = await mod.gitDiff(root, path, staged);
        break;
      }
      case "diff_hunks": {
        const cacheKey = `diff_hunks:${root}:${path ?? ""}:${staged ?? false}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          result = cached;
        } else {
          const hunks = await mod.gitDiffHunks(root, path, staged);
          cacheSet(cacheKey, hunks);
          result = hunks;
        }
        break;
      }
      case "log": {
        const cacheKey = `log:${root}:${JSON.stringify(logOptions)}`;
        const cached = cacheGet<GitCommit[]>(cacheKey);
        if (cached) {
          result = cached;
        } else {
          const commits = await mod.gitLog(root, logOptions);
          cacheSet(cacheKey, commits);
          result = commits;
        }
        break;
      }
      case "branches": {
        result = await mod.gitBranchList(root);
        break;
      }
      case "blame": {
        result = await mod.gitBlame(root, path ?? "");
        break;
      }
      case "remotes": {
        result = await mod.gitRemoteList(root);
        break;
      }
      case "stashes": {
        result = await mod.gitStashList(root);
        break;
      }
      case "submodules": {
        result = await mod.gitSubmoduleStatus(root);
        break;
      }
      case "tags": {
        const cacheKey = `tags:${root}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          result = cached;
        } else {
          const tags = await mod.gitTagList(root);
          cacheSet(cacheKey, tags);
          result = tags;
        }
        break;
      }
      case "branch_compare": {
        const cacheKey = `branch_compare:${root}:${msg.base ?? ""}:${msg.head ?? ""}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          result = cached;
        } else {
          const compare = await mod.gitBranchCompare(root, msg.base ?? "", msg.head ?? "");
          cacheSet(cacheKey, compare);
          result = compare;
        }
        break;
      }
      case "stash_show": {
        const cacheKey = `stash_show:${root}:${msg.index ?? 0}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          result = cached;
        } else {
          const hunks = await mod.gitStashShow(root, msg.index ?? 0);
          cacheSet(cacheKey, hunks);
          result = hunks;
        }
        break;
      }
      case "worktrees": {
        const cacheKey = `worktrees:${root}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          result = cached;
        } else {
          const list = await mod.gitWorktreeList(root);
          cacheSet(cacheKey, list);
          result = list;
        }
        break;
      }
      case "bisect_log": {
        const cacheKey = `bisect_log:${root}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) {
          result = cached;
        } else {
          const log = await mod.gitBisectLog(root);
          cacheSet(cacheKey, log);
          result = log;
        }
        break;
      }
      case "invalidate": {
        if (msg.cacheType) cacheInvalidate(msg.cacheType);
        break;
      }
      default: {
        const res: GitWorkerResponse = { type: "error", requestId, error: `Unknown request type: ${type}` };
        ctx.postMessage(res);
        return;
      }
    }

    const response: GitWorkerResponse = { type: "result", requestId, result };
    ctx.postMessage(response);
  } catch (err) {
    const response: GitWorkerResponse = {
      type: "error",
      requestId,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(response);
  }
});
