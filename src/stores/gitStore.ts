import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { parseGitError } from "@/lib/git-error-parser";
import {
  gitAdd,
  gitBisectReset as gitBisectResetCmd,
  gitBisectStart as gitBisectStartCmd,
  gitBisectState as gitBisectStateCmd,
  gitBranchCreate,
  gitBranchDelete,
  gitBranchList,
  gitBranchRename as gitBranchRenameCmd,
  gitBranchSetUpstream as gitBranchSetUpstreamCmd,
  gitCheckout,
  gitCherryPick as gitCherryPickCmd,
  gitCherryPickAbort,
  gitCherryPickContinue,
  gitCherryPickDetect,
  gitClone as gitCloneCmd,
  gitCommit,
  gitCommitDetail as gitCommitDetailCmd,
  gitConfigGet,
  gitDiff,
  gitDiffHunks,
  gitShowFile,
  gitFetch,
  gitInit,
  gitIsRepo,
  gitLog,
  gitLogGraph as gitLogGraphCmd,
  gitMerge as gitMergeCmd,
  gitMergeAbort as gitMergeAbortCmd,
  gitPull,
  gitPush,
  gitRebaseAbort,
  gitRebaseContinue,
  gitRebaseDetect,
  gitRebaseEditTodo,
  gitRebaseSkip,
  gitRebaseStart,
  gitRebaseTodoList,
  gitRemoteAdd,
  gitRemoteList,
  gitRemoteRemove,
  gitReset as gitResetCmd,
  gitRevert as gitRevertCmd,
  gitRevertDetect,
  gitRevertContinue,
  gitRevertAbort,
  gitStashApply as gitStashApplyCmd,
  gitStashDrop,
  gitStashList,
  gitStashPartial as gitStashPartialCmd,
  gitStashPop,
  gitStashPush,
  gitStageHunk as gitStageHunkCmd,
  gitStageLines as gitStageLinesCmd,
  gitStatus,
  gitTagCreate,
  gitTagDelete,
  gitTagList,
  gitTagPush,
  gitUnstageHunk as gitUnstageHunkCmd,
  gitWorktreeAdd as gitWorktreeAddCmd,
  gitWorktreePrune as gitWorktreePruneCmd,
  gitWorktreeRemove as gitWorktreeRemoveCmd,
} from "@/tauri/git";
import { useGitHubStore } from "@/stores/githubStore";
import type {
  BisectStartOptions,
  BisectStatus,
  BranchCompareResult,
  CherryPickOptions,
  CherryPickStatus,
  CommitDetail,
  DiffHunk,
  GitBlameLine,
  GitBranch,
  GitCommit,
  GitRemote,
  GitStash,
  GitStatus,
  GitTag,
  GraphData,
  FetchOptions,
  LineSelection,
  LogOptions,
  MergeOptions,
  PullOptions,
  PushOptions,
  RebaseStatus,
  RebaseTodo,
  RevertOptions,
  RevertStatus,
  StashApplyResult,
  WorktreeEntry,
} from "@/types/git";
import type { GitWorkerRequest, GitWorkerResponse } from "@/workers/git.worker";
import GitWorker from "@/workers/git.worker?worker";

let workerInstance: Worker | null = null;
let workerCounter = 0;
const workerCallbacks = new Map<string, (res: GitWorkerResponse) => void>();
const MAX_DIFF_CACHE = 50;
const diffCacheOrder: string[] = [];

function ensureWorker(): Worker {
  if (workerInstance) return workerInstance;
  workerInstance = new GitWorker();
  workerInstance.addEventListener("message", (event: MessageEvent<GitWorkerResponse>) => {
    const cb = workerCallbacks.get(event.data.requestId);
    if (cb) {
      workerCallbacks.delete(event.data.requestId);
      cb(event.data);
    }
  });
  return workerInstance;
}

function sendInvalidate(cacheType: string): void {
  const worker = ensureWorker();
  worker.postMessage({ type: "invalidate", cacheType, requestId: "invalidate" });
}

function workerRequest<T>(type: GitWorkerRequest["type"], root: string, extra: Partial<GitWorkerRequest> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = `req-${++workerCounter}`;
    workerCallbacks.set(requestId, (res) => {
      if (res.type === "result") resolve(res.result as T);
      else reject(new Error(res.error ?? "Git worker request failed"));
    });
    const req: GitWorkerRequest = { type, requestId, root, ...extra };
    ensureWorker().postMessage(req);
  });
}

interface GitActions {
  initRepo: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  getDiff: (path: string, staged?: boolean) => Promise<string>;
  getDiffHunks: (path: string, staged?: boolean) => Promise<DiffHunk[]>;
  showFile: (path: string, revision: string) => Promise<string>;
  getLog: (options?: LogOptions) => Promise<void>;
  getBlame: (path: string) => Promise<GitBlameLine[]>;
  refreshBranches: () => Promise<void>;
  refreshRemotes: () => Promise<void>;
  refreshStashes: () => Promise<void>;
  checkout: (target: string) => Promise<void>;
  createBranch: (name: string, startPoint?: string) => Promise<void>;
  deleteBranch: (name: string, force?: boolean) => Promise<void>;
  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  stageHunk: (filePath: string, hunkIndex: number) => Promise<void>;
  unstageHunk: (filePath: string, hunkIndex: number) => Promise<void>;
  stageLines: (filePath: string, selections: LineSelection[]) => Promise<void>;
  commit: (message: string, options?: { amend?: boolean }) => Promise<string>;
  push: (remote?: string, branch?: string, options?: PushOptions) => Promise<void>;
  pull: (remote?: string, branch?: string, options?: PullOptions) => Promise<void>;
  fetch: (remote?: string, options?: FetchOptions) => Promise<void>;
  stashPush: (message?: string) => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashDrop: (index?: number) => Promise<void>;
  addRemote: (name: string, url: string) => Promise<void>;
  removeRemote: (name: string) => Promise<void>;
  setRepoRoot: (root: string | null) => void;
  checkIsRepo: () => Promise<void>;
  fetchGraph: (maxCount?: number) => Promise<void>;
  selectCommit: (hash: string | null) => void;
  getCommitDetail: (hash: string) => Promise<CommitDetail | null>;
  detectRebase: () => Promise<void>;
  fetchRebaseTodos: (target: string) => Promise<RebaseTodo[]>;
  startRebase: (target: string, todos: RebaseTodo[]) => Promise<void>;
  continueRebase: (message?: string) => Promise<void>;
  skipRebase: () => Promise<void>;
  abortRebase: (force?: boolean) => Promise<void>;
  editRebaseTodos: (todos: RebaseTodo[]) => Promise<void>;
  refreshTags: () => Promise<void>;
  createTag: (name: string, message: string, commit: string, annotated?: boolean) => Promise<void>;
  deleteTag: (name: string) => Promise<void>;
  pushTag: (name: string, remote?: string) => Promise<void>;
  cherryPick: (hash: string, options?: CherryPickOptions) => Promise<void>;
  detectCherryPick: () => Promise<void>;
  continueCherryPick: () => Promise<void>;
  abortCherryPick: () => Promise<void>;
  revert: (hash: string, options?: RevertOptions) => Promise<void>;
  detectRevert: () => Promise<void>;
  continueRevert: () => Promise<void>;
  abortRevert: () => Promise<void>;
  compareBranches: (base: string, head: string) => Promise<void>;
  setBranchCompareBase: (base: string) => void;
  setBranchCompareHead: (head: string) => void;
  stashShow: (index: number) => Promise<void>;
  stashApply: (index: number, restoreIndex?: boolean) => Promise<void>;
  stashPartial: (paths: string[], message?: string, keepIndex?: boolean, staged?: boolean) => Promise<void>;
  clearStashView: () => void;
  clearStashApplyResult: () => void;
  refreshWorktrees: () => Promise<void>;
  addWorktree: (path: string, branch?: string) => Promise<void>;
  removeWorktree: (path: string, force?: boolean) => Promise<void>;
  pruneWorktrees: () => Promise<void>;
  bisectStart: (options: BisectStartOptions) => Promise<void>;
  bisectGood: (hash?: string) => Promise<void>;
  bisectBad: (hash?: string) => Promise<void>;
  bisectSkip: (hash?: string) => Promise<void>;
  bisectReset: () => Promise<void>;
  refreshBisectLog: () => Promise<void>;
  mergeBranch: (branch: string, options?: MergeOptions) => Promise<void>;
  abortMerge: () => Promise<void>;
  renameBranch: (oldName: string, newName: string) => Promise<void>;
  setUpstream: (branch: string, upstream: string) => Promise<void>;
  cloneRepo: (url: string, path: string, depth?: number) => Promise<void>;
}

interface GitStoreState {
  repoRoot: string | null;
  isRepo: boolean;
  checkingRepo: boolean;
  status: GitStatus | null;
  currentBranch: string | null;
  branches: GitBranch[];
  remotes: GitRemote[];
  stashes: GitStash[];
  log: GitCommit[];
  logLoading: boolean;
  blame: GitBlameLine[] | null;
  blameLoading: boolean;
  statusLoading: boolean;
  committing: boolean;
  pushing: boolean;
  pulling: boolean;
  fetching: boolean;
  diffCache: Record<string, string>;
  diffHunkCache: Record<string, DiffHunk[]>;
  error: string | null;
  userConfig: { userName: string; userEmail: string };
  graphData: GraphData | null;
  graphLoading: boolean;
  selectedCommitHash: string | null;
  commitDetail: CommitDetail | null;
  commitDetailLoading: boolean;
  rebaseStatus: RebaseStatus | null;
  rebaseTodos: RebaseTodo[];
  rebaseStep: 'idle' | 'generate-todo' | 'editing' | 'running' | 'conflict' | 'reword' | 'todoEdit' | 'done';
  tags: GitTag[];
  tagsLoading: boolean;
  cherryPickStatus: CherryPickStatus | null;
  revertStatus: RevertStatus | null;
  branchCompareResult: BranchCompareResult | null;
  branchCompareBase: string;
  branchCompareHead: string;
  stashViewDiff: DiffHunk[] | null;
  stashViewLoading: boolean;
  stashApplyResult: StashApplyResult | null;
  worktrees: WorktreeEntry[];
  worktreesLoading: boolean;
  bisectStatus: BisectStatus | null;
  bisectLoading: boolean;
}

type GitStore = GitStoreState & GitActions;

export const useGitStore = create<GitStore>()(
  persist(
    (set, get) => ({
      repoRoot: null,
      isRepo: false,
      checkingRepo: false,
      status: null,
      currentBranch: null,
      branches: [],
      remotes: [],
      stashes: [],
      log: [],
      logLoading: false,
      blame: null,
      blameLoading: false,
      statusLoading: false,
      committing: false,
      pushing: false,
      pulling: false,
      fetching: false,
      diffCache: {},
      diffHunkCache: {},
      error: null,
      userConfig: { userName: "", userEmail: "" },
      graphData: null,
      graphLoading: false,
      selectedCommitHash: null,
      commitDetail: null,
      commitDetailLoading: false,
      rebaseStatus: null,
      rebaseTodos: [],
      rebaseStep: 'idle',
      tags: [],
      tagsLoading: false,
      cherryPickStatus: null,
      revertStatus: null,
      branchCompareResult: null,
      branchCompareBase: '',
      branchCompareHead: '',
      stashViewDiff: null,
      stashViewLoading: false,
      stashApplyResult: null,
      worktrees: [],
      worktreesLoading: false,
      bisectStatus: null,
      bisectLoading: false,

      initRepo: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, statusLoading: true });
        try {
          await gitInit(repoRoot);
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        } finally {
          set({ statusLoading: false });
        }
      },

      refreshStatus: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ statusLoading: true, error: null, diffHunkCache: {}, tags: [], cherryPickStatus: null, revertStatus: null, bisectStatus: null });
        try {
          const [status, isRepo] = await Promise.all([
            gitStatus(repoRoot),
            gitIsRepo(repoRoot),
          ]);
          set({
            status,
            isRepo,
            currentBranch: status.branch,
            statusLoading: false,
          });
        } catch (err) {
          set({ error: parseGitError(err), statusLoading: false });
        }
      },

      getDiff: async (path, staged) => {
        const { repoRoot } = get();
        if (!repoRoot) return "";
        try {
          const diff = await gitDiff(repoRoot, path, staged);
          const cacheKey = `${staged ? "staged:" : ""}${path}`;
          set((s) => ({
            diffCache: { ...s.diffCache, [cacheKey]: diff },
          }));
          const existingIdx = diffCacheOrder.indexOf(cacheKey);
          if (existingIdx !== -1) diffCacheOrder.splice(existingIdx, 1);
          diffCacheOrder.push(cacheKey);
          if (diffCacheOrder.length > MAX_DIFF_CACHE) {
            const oldest = diffCacheOrder.shift()!;
            set((s) => {
              const next = { ...s.diffCache };
              delete next[oldest];
              return { diffCache: next };
            });
          }
          return diff;
        } catch (err) {
          set({ error: parseGitError(err) });
          return "";
        }
      },

      getDiffHunks: async (path, staged) => {
        const { repoRoot } = get();
        if (!repoRoot) return [];
        const cacheKey = `${staged ? "staged:" : ""}${path}`;
        const cached = get().diffHunkCache[cacheKey];
        if (cached) return cached;
        try {
          const hunks = await gitDiffHunks(repoRoot, path, staged);
          set((s) => ({
            diffHunkCache: { ...s.diffHunkCache, [cacheKey]: hunks },
          }));
          return hunks;
        } catch (err) {
          set({ error: parseGitError(err) });
          return [];
        }
      },

      showFile: async (path, revision) => {
        const { repoRoot } = get();
        if (!repoRoot) return "";
        try {
          return await gitShowFile(repoRoot, path, revision);
        } catch (err) {
          set({ error: parseGitError(err) });
          return "";
        }
      },

      fetchGraph: async (maxCount) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ graphLoading: true, error: null });
        try {
          const graphData = await gitLogGraphCmd(repoRoot, maxCount);
          set({ graphData, graphLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), graphLoading: false });
        }
      },

      selectCommit: (hash) => {
        set({ selectedCommitHash: hash });
      },

      getCommitDetail: async (hash) => {
        const { repoRoot } = get();
        if (!repoRoot) return null;
        set({ commitDetailLoading: true, error: null });
        try {
          const detail = await gitCommitDetailCmd(repoRoot, hash);
          set({ commitDetail: detail, commitDetailLoading: false });
          return detail;
        } catch (err) {
          set({ error: parseGitError(err), commitDetailLoading: false });
          return null;
        }
      },

      detectRebase: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        try {
          const st = await gitRebaseDetect(repoRoot);
          set({ rebaseStatus: st });
          if (!st.inProgress) {
            set({ rebaseStep: 'idle', rebaseTodos: [] });
          } else if (st.pauseReason === 'conflict') {
            set({ rebaseStep: 'conflict' });
          } else if (st.pauseReason === 'reword') {
            set({ rebaseStep: 'reword' });
          } else if (st.pauseReason === 'todoEdit') {
            set({ rebaseStep: 'todoEdit' });
          }
        } catch { /* ignore */ }
      },

      fetchRebaseTodos: async (target) => {
        const { repoRoot } = get();
        if (!repoRoot) return [];
        set({ rebaseStep: 'generate-todo' });
        try {
          const todos = await gitRebaseTodoList(repoRoot, target);
          set({ rebaseTodos: todos, rebaseStep: 'editing' });
          return todos;
        } catch (err) {
          set({ error: parseGitError(err), rebaseStep: 'idle' });
          return [];
        }
      },

      startRebase: async (target, todos) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, rebaseStep: 'running' });
        try {
          const st = await gitRebaseStart(repoRoot, target, todos);
          if (!st.inProgress) {
            set({ rebaseStatus: st, rebaseStep: 'done', rebaseTodos: [] });
          } else if (st.pauseReason === 'conflict') {
            set({ rebaseStatus: st, rebaseStep: 'conflict' });
          } else {
            set({ rebaseStatus: st, rebaseStep: 'todoEdit' });
          }
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err), rebaseStep: 'editing' });
        }
      },

      continueRebase: async (message) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const st = await gitRebaseContinue(repoRoot, message);
          if (!st.inProgress) {
            set({ rebaseStatus: st, rebaseStep: 'done', rebaseTodos: [] });
          } else if (st.pauseReason === 'conflict') {
            set({ rebaseStatus: st, rebaseStep: 'conflict' });
          } else if (st.pauseReason === 'reword') {
            set({ rebaseStatus: st, rebaseStep: 'reword' });
          } else {
            set({ rebaseStatus: st, rebaseStep: 'todoEdit' });
          }
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      skipRebase: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const st = await gitRebaseSkip(repoRoot);
          if (!st.inProgress) {
            set({ rebaseStatus: st, rebaseStep: 'done', rebaseTodos: [] });
          } else if (st.pauseReason === 'conflict') {
            set({ rebaseStatus: st, rebaseStep: 'conflict' });
          } else {
            set({ rebaseStatus: st, rebaseStep: 'todoEdit' });
          }
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      abortRebase: async (force) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const st = await gitRebaseAbort(repoRoot, force);
          set({ rebaseStatus: st, rebaseTodos: [], rebaseStep: st.inProgress ? 'todoEdit' : 'idle' });
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      editRebaseTodos: async (todos) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitRebaseEditTodo(repoRoot, todos);
          set({ rebaseTodos: todos });
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      refreshTags: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ tagsLoading: true, error: null });
        try {
          const tags = await gitTagList(repoRoot);
          set({ tags, tagsLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), tagsLoading: false });
        }
      },

      createTag: async (name, message, commit, annotated) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitTagCreate(repoRoot, name, message, commit, annotated);
          await get().refreshTags();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      deleteTag: async (name) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitTagDelete(repoRoot, name);
          await get().refreshTags();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      pushTag: async (name, remote) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const token = useGitHubStore.getState().token ?? undefined;
          await gitTagPush(repoRoot, name, remote, token);
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      cherryPick: async (hash, options) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, cherryPickStatus: null });
        try {
          const st = await gitCherryPickCmd(repoRoot, hash, options);
          set({ cherryPickStatus: st });
          if (!st.inProgress) {
            await get().refreshStatus();
          }
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      detectCherryPick: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        try {
          const st = await gitCherryPickDetect(repoRoot);
          set({ cherryPickStatus: st });
        } catch { /* ignore */ }
      },

      continueCherryPick: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const st = await gitCherryPickContinue(repoRoot);
          set({ cherryPickStatus: st });
          if (!st.inProgress) {
            await get().refreshStatus();
          }
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      abortCherryPick: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const st = await gitCherryPickAbort(repoRoot);
          set({ cherryPickStatus: st });
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      revert: async (hash, options) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, revertStatus: null });
        try {
          const st = await gitRevertCmd(repoRoot, hash, options);
          set({ revertStatus: st });
          if (!st.inProgress) {
            await get().refreshStatus();
          }
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      detectRevert: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        try {
          const st = await gitRevertDetect(repoRoot);
          set({ revertStatus: st });
        } catch { /* ignore */ }
      },

      continueRevert: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const st = await gitRevertContinue(repoRoot);
          set({ revertStatus: st });
          if (!st.inProgress) {
            await get().refreshStatus();
          }
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      abortRevert: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const st = await gitRevertAbort(repoRoot);
          set({ revertStatus: st });
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      compareBranches: async (base, head) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          const result = await workerRequest<BranchCompareResult>("branch_compare", repoRoot, { base, head });
          set({ branchCompareResult: result, branchCompareBase: base, branchCompareHead: head });
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      setBranchCompareBase: (base) => set({ branchCompareBase: base }),

      setBranchCompareHead: (head) => set({ branchCompareHead: head }),

      stageHunk: async (filePath, hunkIndex) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitStageHunkCmd(repoRoot, filePath, hunkIndex);
          set((s) => {
            const cache = { ...s.diffHunkCache };
            delete cache[`${filePath}`];
            delete cache[`staged:${filePath}`];
            return { diffHunkCache: cache };
          });
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      unstageHunk: async (filePath, hunkIndex) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitUnstageHunkCmd(repoRoot, filePath, hunkIndex);
          set((s) => {
            const cache = { ...s.diffHunkCache };
            delete cache[`staged:${filePath}`];
            delete cache[`${filePath}`];
            return { diffHunkCache: cache };
          });
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      stageLines: async (filePath, selections) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitStageLinesCmd(repoRoot, filePath, selections);
          set((s) => {
            const cache = { ...s.diffHunkCache };
            delete cache[`${filePath}`];
            delete cache[`staged:${filePath}`];
            return { diffHunkCache: cache };
          });
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      getLog: async (options) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ logLoading: true, error: null });
        try {
          const log = await gitLog(repoRoot, options);
          set({ log, logLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), logLoading: false });
        }
      },

      getBlame: async (path) => {
        const { repoRoot } = get();
        if (!repoRoot) return [];
        set({ blameLoading: true, error: null });
        try {
          const blame = await workerRequest<GitBlameLine[]>("blame", repoRoot, { path });
          set({ blame, blameLoading: false });
          return blame;
        } catch (err) {
          set({ error: parseGitError(err), blameLoading: false });
          return [];
        }
      },

      refreshBranches: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        try {
          const branches = await gitBranchList(repoRoot);
          set({ branches });
        } catch { /* ignore */ }
      },

      refreshRemotes: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        try {
          const remotes = await gitRemoteList(repoRoot);
          set({ remotes });
        } catch { /* ignore */ }
      },

      refreshStashes: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        try {
          const stashes = await gitStashList(repoRoot);
          set({ stashes, stashViewDiff: null, stashApplyResult: null });
        } catch { /* ignore */ }
      },

      checkout: async (target) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, bisectStatus: null });
        try {
          await gitCheckout(repoRoot, target);
          await Promise.all([
            get().refreshStatus(),
            get().refreshBranches(),
          ]);
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      createBranch: async (name, startPoint) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitBranchCreate(repoRoot, name, startPoint);
          await get().refreshBranches();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      deleteBranch: async (name, force) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitBranchDelete(repoRoot, name, force);
          await get().refreshBranches();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      stage: async (paths) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitAdd(repoRoot, paths);
          sendInvalidate("status");
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      unstage: async (paths) => {
        const root = get().repoRoot;
        if (!root) return;
        set({ error: null });
        try {
          await gitResetCmd(root, paths);
          sendInvalidate("status");
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      commit: async (message, options) => {
        const { repoRoot } = get();
        if (!repoRoot) return "";
        set({ error: null, committing: true, diffHunkCache: {}, bisectStatus: null });
        try {
          const hash = await gitCommit(repoRoot, message, options?.amend);
          sendInvalidate("status");
          sendInvalidate("log");
          await get().refreshStatus();
          return hash;
        } catch (err) {
          set({ error: parseGitError(err) });
          return "";
        } finally {
          set({ committing: false });
        }
      },

      push: async (remote, branch, options) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, pushing: true });
        try {
          const token = useGitHubStore.getState().token ?? undefined;
          await gitPush(repoRoot, remote, branch, options, token);
          sendInvalidate("status");
          sendInvalidate("log");
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        } finally {
          set({ pushing: false });
        }
      },

      pull: async (remote, branch, options) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, pulling: true });
        try {
          const token = useGitHubStore.getState().token ?? undefined;
          await gitPull(repoRoot, remote, branch, options, token);
          sendInvalidate("status");
          sendInvalidate("log");
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        } finally {
          set({ pulling: false });
        }
      },

      fetch: async (remote, options) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, fetching: true });
        try {
          const token = useGitHubStore.getState().token ?? undefined;
          await gitFetch(repoRoot, remote, options, token);
          sendInvalidate("status");
          sendInvalidate("log");
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        } finally {
          set({ fetching: false });
        }
      },

      stashPush: async (message) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, stashViewDiff: null, stashApplyResult: null });
        try {
          await gitStashPush(repoRoot, message);
          await Promise.all([get().refreshStatus(), get().refreshStashes()]);
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      stashPop: async (index) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, stashViewDiff: null, stashApplyResult: null });
        try {
          await gitStashPop(repoRoot, index);
          await Promise.all([get().refreshStatus(), get().refreshStashes()]);
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      stashDrop: async (index) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, stashViewDiff: null, stashApplyResult: null });
        try {
          await gitStashDrop(repoRoot, index);
          await get().refreshStashes();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      stashShow: async (index) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ stashViewLoading: true, error: null });
        try {
          const hunks = await workerRequest<DiffHunk[]>("stash_show", repoRoot, { index });
          set({ stashViewDiff: hunks, stashViewLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), stashViewLoading: false });
        }
      },

      stashApply: async (index, restoreIndex) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null, stashApplyResult: null });
        try {
          const result = await gitStashApplyCmd(repoRoot, index, restoreIndex);
          set({ stashApplyResult: result });
          if (!result.hasConflict) {
            await Promise.all([get().refreshStatus(), get().refreshStashes()]);
          }
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      stashPartial: async (paths, message, keepIndex, staged) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitStashPartialCmd(repoRoot, paths, message, keepIndex, staged);
          await Promise.all([get().refreshStatus(), get().refreshStashes()]);
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      clearStashView: () => set({ stashViewDiff: null, stashViewLoading: false }),

      clearStashApplyResult: () => set({ stashApplyResult: null }),

      refreshWorktrees: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ worktreesLoading: true });
        try {
          const list = await workerRequest<WorktreeEntry[]>("worktrees", repoRoot);
          set({ worktrees: list, worktreesLoading: false });
        } catch {
          set({ worktreesLoading: false });
        }
      },

      addWorktree: async (path, branch) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitWorktreeAddCmd(repoRoot, path, branch);
          await get().refreshWorktrees();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      removeWorktree: async (path, force) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitWorktreeRemoveCmd(repoRoot, path, force);
          await get().refreshWorktrees();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      pruneWorktrees: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitWorktreePruneCmd(repoRoot);
          await get().refreshWorktrees();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      bisectStart: async (options) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ bisectLoading: true, error: null, bisectStatus: null });
        try {
          const status = await gitBisectStartCmd(repoRoot, options);
          set({ bisectStatus: status, bisectLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), bisectLoading: false });
        }
      },

      bisectGood: async (hash) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ bisectLoading: true, error: null });
        try {
          const status = await gitBisectStateCmd(repoRoot, "good", hash);
          set({ bisectStatus: status, bisectLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), bisectLoading: false });
        }
      },

      bisectBad: async (hash) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ bisectLoading: true, error: null });
        try {
          const status = await gitBisectStateCmd(repoRoot, "bad", hash);
          set({ bisectStatus: status, bisectLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), bisectLoading: false });
        }
      },

      bisectSkip: async (hash) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ bisectLoading: true, error: null });
        try {
          const status = await gitBisectStateCmd(repoRoot, "skip", hash);
          set({ bisectStatus: status, bisectLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), bisectLoading: false });
        }
      },

      bisectReset: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ bisectLoading: true, error: null });
        try {
          await gitBisectResetCmd(repoRoot);
          set({ bisectStatus: null, bisectLoading: false });
        } catch (err) {
          set({ error: parseGitError(err), bisectLoading: false });
        }
      },

      refreshBisectLog: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        try {
          const log = await workerRequest<string>("bisect_log", repoRoot);
          set((s) => ({
            bisectStatus: s.bisectStatus ? { ...s.bisectStatus, log } : null,
          }));
        } catch { /* ignore */ }
      },

      mergeBranch: async (branch, options) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitMergeCmd(repoRoot, branch, options);
          sendInvalidate("status");
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      abortMerge: async () => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitMergeAbortCmd(repoRoot);
          sendInvalidate("status");
          await get().refreshStatus();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      renameBranch: async (oldName, newName) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitBranchRenameCmd(repoRoot, oldName, newName);
          await get().refreshBranches();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      setUpstream: async (branch, upstream) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitBranchSetUpstreamCmd(repoRoot, branch, upstream);
          await get().refreshBranches();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      cloneRepo: async (url, path, depth) => {
        set({ error: null });
        try {
          await gitCloneCmd(url, path, depth);
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      addRemote: async (name, url) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitRemoteAdd(repoRoot, name, url);
          await get().refreshRemotes();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      removeRemote: async (name) => {
        const { repoRoot } = get();
        if (!repoRoot) return;
        set({ error: null });
        try {
          await gitRemoteRemove(repoRoot, name);
          await get().refreshRemotes();
        } catch (err) {
          set({ error: parseGitError(err) });
        }
      },

      setRepoRoot: (root: string | null) => set({ repoRoot: root }),

      checkIsRepo: (() => {
        let pending: Promise<void> | null = null;
        return async () => {
          if (pending) return pending;
          const root = get().repoRoot;
          if (!root) {
            set({ isRepo: false });
            return Promise.resolve();
          }
          set({ checkingRepo: true });
          pending = (async () => {
            try {
              const isRepo = await gitIsRepo(root);
              set({ isRepo, checkingRepo: false });
              if (isRepo) {
                await Promise.all([
                  get().refreshStatus(),
                  get().refreshBranches(),
                  get().refreshRemotes(),
                  get().refreshStashes(),
                  get().refreshWorktrees(),
                ]);
                  try {
                    const [userName, userEmail] = await Promise.all([
                      gitConfigGet(root, "user.name").catch(() => ""),
                      gitConfigGet(root, "user.email").catch(() => ""),
                    ]);
                    set({ userConfig: { userName, userEmail } });
                  } catch { /* ignore */ }
                  await Promise.all([
                    get().detectRebase().catch(() => {}),
                    get().detectCherryPick().catch(() => {}),
                    get().detectRevert().catch(() => {}),
                    get().refreshTags().catch(() => {}),
                  ]);
                }
            } catch {
              set({ isRepo: false, checkingRepo: false });
            } finally {
              pending = null;
            }
          })();
          return pending;
        };
      })(),
    }),
    {
      name: "code-editor:git",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        repoRoot: state.repoRoot,
        userConfig: state.userConfig,
      }),
    },
  ),
);
