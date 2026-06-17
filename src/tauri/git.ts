import { invoke } from "@tauri-apps/api/core";
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
  GitSubmodule,
  GitTag,
  GraphData,
  LineSelection,
  LogOptions,
  MergeOptions,
  PushOptions,
  PullOptions,
  FetchOptions,
  RebaseTodo,
  RebaseStatus,
  RevertOptions,
  RevertStatus,
  StashApplyResult,
  WorktreeEntry,
} from "@/types/git";

export async function gitStatus(root: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { root });
}

export async function gitDiff(root: string, path?: string, staged?: boolean): Promise<string> {
  return invoke<string>("git_diff", { root, path, staged });
}

export async function gitLog(root: string, options?: LogOptions): Promise<GitCommit[]> {
  return invoke<GitCommit[]>("git_log", { root, options });
}

export async function gitBranchList(root: string): Promise<GitBranch[]> {
  return invoke<GitBranch[]>("git_branch_list", { root });
}

export async function gitBranchCreate(root: string, name: string, startPoint?: string): Promise<void> {
  return invoke("git_branch_create", { root, name, startPoint });
}

export async function gitBranchDelete(root: string, name: string, force?: boolean): Promise<void> {
  return invoke("git_branch_delete", { root, name, force });
}

export async function gitCheckout(root: string, target: string): Promise<void> {
  return invoke("git_checkout", { root, target });
}

export async function gitAdd(root: string, paths: string[]): Promise<void> {
  return invoke("git_add", { root, paths });
}

export async function gitReset(root: string, paths: string[]): Promise<void> {
  return invoke("git_reset", { root, paths });
}

export async function gitCommit(root: string, message: string, amend?: boolean): Promise<string> {
  return invoke<string>("git_commit", { root, message, amend });
}

export async function gitPush(root: string, remote?: string, branch?: string, options?: PushOptions, token?: string): Promise<void> {
  return invoke("git_push", { root, remote, branch, options, token: token ?? null });
}

export async function gitPull(root: string, remote?: string, branch?: string, options?: PullOptions, token?: string): Promise<void> {
  return invoke("git_pull", { root, remote, branch, options, token: token ?? null });
}

export async function gitFetch(root: string, remote?: string, options?: FetchOptions, token?: string): Promise<void> {
  return invoke("git_fetch", { root, remote, options, token: token ?? null });
}

export async function gitRemoteList(root: string): Promise<GitRemote[]> {
  return invoke<GitRemote[]>("git_remote_list", { root });
}

export async function gitRemoteAdd(root: string, name: string, url: string): Promise<void> {
  return invoke("git_remote_add", { root, name, url });
}

export async function gitRemoteRemove(root: string, name: string): Promise<void> {
  return invoke("git_remote_remove", { root, name });
}

export async function gitStashList(root: string): Promise<GitStash[]> {
  return invoke<GitStash[]>("git_stash_list", { root });
}

export async function gitStashPush(root: string, message?: string): Promise<void> {
  return invoke("git_stash_push", { root, message });
}

export async function gitStashPop(root: string, index?: number): Promise<void> {
  return invoke("git_stash_pop", { root, index });
}

export async function gitStashDrop(root: string, index?: number): Promise<void> {
  return invoke("git_stash_drop", { root, index });
}

export async function gitBlame(root: string, path: string): Promise<GitBlameLine[]> {
  return invoke<GitBlameLine[]>("git_blame", { root, path });
}

export async function gitSubmoduleStatus(root: string): Promise<GitSubmodule[]> {
  return invoke<GitSubmodule[]>("git_submodule_status", { root });
}

export async function gitInit(root: string): Promise<void> {
  return invoke("git_init", { root });
}

export async function gitConfigGet(root: string, key: string): Promise<string> {
  return invoke<string>("git_config_get", { root, key });
}

export async function gitConfigSet(root: string, key: string, value: string, scope?: string): Promise<void> {
  return invoke("git_config_set", { root, key, value, scope });
}

export async function gitIsRepo(root: string): Promise<boolean> {
  return invoke<boolean>("git_is_repo", { root });
}

export async function gitDiffHunks(root: string, path?: string, staged?: boolean): Promise<DiffHunk[]> {
  return invoke<DiffHunk[]>("git_diff_hunks", { root, path, staged });
}

export async function gitStageHunk(root: string, filePath: string, hunkIndex: number): Promise<void> {
  return invoke("git_stage_hunk", { root, filePath, hunkIndex });
}

export async function gitUnstageHunk(root: string, filePath: string, hunkIndex: number): Promise<void> {
  return invoke("git_unstage_hunk", { root, filePath, hunkIndex });
}

export async function gitStageLines(root: string, filePath: string, selections: LineSelection[]): Promise<void> {
  return invoke("git_stage_lines", { root, filePath, selections });
}

export async function gitLogGraph(root: string, maxCount?: number): Promise<GraphData> {
  return invoke<GraphData>("git_log_graph", { root, maxCount });
}

export async function gitCommitDetail(root: string, hash: string): Promise<CommitDetail> {
  return invoke<CommitDetail>("git_commit_detail", { root, hash });
}

export async function gitRebaseDetect(root: string): Promise<RebaseStatus> {
  return invoke<RebaseStatus>("git_rebase_detect", { root });
}

export async function gitRebaseTodoList(root: string, target?: string): Promise<RebaseTodo[]> {
  return invoke<RebaseTodo[]>("git_rebase_todo_list", { root, target: target ?? null });
}

export async function gitRebaseStart(root: string, target: string, todos: RebaseTodo[]): Promise<RebaseStatus> {
  return invoke<RebaseStatus>("git_rebase_start", { root, target, todos });
}

export async function gitRebaseEditTodo(root: string, todos: RebaseTodo[]): Promise<RebaseStatus> {
  return invoke<RebaseStatus>("git_rebase_edit_todo", { root, todos });
}

export async function gitRebaseContinue(root: string, message?: string): Promise<RebaseStatus> {
  return invoke<RebaseStatus>("git_rebase_continue", { root, message: message ?? null });
}

export async function gitRebaseSkip(root: string): Promise<RebaseStatus> {
  return invoke<RebaseStatus>("git_rebase_skip", { root });
}

export async function gitRebaseAbort(root: string, force?: boolean): Promise<RebaseStatus> {
  return invoke<RebaseStatus>("git_rebase_abort", { root, force: force ?? null });
}

export async function gitTagList(root: string): Promise<GitTag[]> {
  return invoke<GitTag[]>("git_tag_list", { root });
}

export async function gitTagCreate(root: string, name: string, message: string, commit: string, annotated?: boolean): Promise<void> {
  return invoke("git_tag_create", { root, name, message, commit, annotated: annotated ?? null });
}

export async function gitTagDelete(root: string, name: string): Promise<void> {
  return invoke("git_tag_delete", { root, name });
}

export async function gitTagPush(root: string, name: string, remote?: string, token?: string): Promise<void> {
  return invoke("git_tag_push", { root, name, remote: remote ?? null, token: token ?? null });
}

export async function gitCherryPick(root: string, hash: string, options?: CherryPickOptions): Promise<CherryPickStatus> {
  return invoke<CherryPickStatus>("git_cherry_pick", { root, hash, options: options ?? null });
}

export async function gitCherryPickDetect(root: string): Promise<CherryPickStatus> {
  return invoke<CherryPickStatus>("git_cherry_pick_detect", { root });
}

export async function gitCherryPickContinue(root: string): Promise<CherryPickStatus> {
  return invoke<CherryPickStatus>("git_cherry_pick_continue", { root });
}

export async function gitCherryPickAbort(root: string): Promise<CherryPickStatus> {
  return invoke<CherryPickStatus>("git_cherry_pick_abort", { root });
}

export async function gitRevert(root: string, hash: string, options?: RevertOptions): Promise<RevertStatus> {
  return invoke<RevertStatus>("git_revert", { root, hash, options: options ?? null });
}

export async function gitRevertDetect(root: string): Promise<RevertStatus> {
  return invoke<RevertStatus>("git_revert_detect", { root });
}

export async function gitRevertContinue(root: string): Promise<RevertStatus> {
  return invoke<RevertStatus>("git_revert_continue", { root });
}

export async function gitRevertAbort(root: string): Promise<RevertStatus> {
  return invoke<RevertStatus>("git_revert_abort", { root });
}

export async function gitBranchCompare(root: string, base: string, head: string): Promise<BranchCompareResult> {
  return invoke<BranchCompareResult>("git_branch_compare", { root, base, head });
}

export async function gitStashShow(root: string, index: number): Promise<DiffHunk[]> {
  return invoke<DiffHunk[]>("git_stash_show", { root, index });
}

export async function gitStashApply(root: string, index: number, restoreIndex?: boolean): Promise<StashApplyResult> {
  return invoke<StashApplyResult>("git_stash_apply", { root, index, restoreIndex: restoreIndex ?? null });
}

export async function gitStashPartial(root: string, paths: string[], message?: string, keepIndex?: boolean, staged?: boolean): Promise<void> {
  return invoke("git_stash_partial", { root, paths, message: message ?? null, keepIndex: keepIndex ?? null, staged: staged ?? null });
}

export async function gitWorktreeList(root: string): Promise<WorktreeEntry[]> {
  return invoke<WorktreeEntry[]>("git_worktree_list", { root });
}

export async function gitWorktreeAdd(root: string, path: string, branch?: string): Promise<WorktreeEntry> {
  return invoke<WorktreeEntry>("git_worktree_add", { root, path, branch: branch ?? null });
}

export async function gitWorktreeRemove(root: string, path: string, force?: boolean): Promise<void> {
  return invoke("git_worktree_remove", { root, path, force: force ?? null });
}

export async function gitWorktreePrune(root: string): Promise<void> {
  return invoke("git_worktree_prune", { root });
}

export async function gitBisectStart(root: string, options: BisectStartOptions): Promise<BisectStatus> {
  return invoke<BisectStatus>("git_bisect_start", { root, options });
}

export async function gitBisectState(root: string, state: string, hash?: string): Promise<BisectStatus> {
  return invoke<BisectStatus>("git_bisect_state", { root, state, hash: hash ?? null });
}

export async function gitBisectLog(root: string): Promise<string> {
  return invoke<string>("git_bisect_log", { root });
}

export async function gitBisectReset(root: string): Promise<void> {
  return invoke("git_bisect_reset", { root });
}

export async function gitMerge(root: string, branch: string, options?: MergeOptions): Promise<void> {
  return invoke("git_merge", { root, branch, options: options ?? null });
}

export async function gitMergeAbort(root: string): Promise<void> {
  return invoke("git_merge_abort", { root });
}

export async function gitClone(url: string, path: string, depth?: number): Promise<void> {
  return invoke("git_clone", { url, path, depth: depth ?? null });
}

export async function gitBranchRename(root: string, oldName: string, newName: string): Promise<void> {
  return invoke("git_branch_rename", { root, oldName, newName });
}

export async function gitBranchSetUpstream(root: string, branch: string, upstream: string): Promise<void> {
  return invoke("git_branch_set_upstream", { root, branch, upstream });
}
