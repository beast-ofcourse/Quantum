export interface GitFileEntry {
  path: string;
  status: GitStatusType;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: string[];
  conflicted: string[];
}

export interface GitCommit {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  parents: string[];
  refs: string;
}

export interface GitBranch {
  name: string;
  isHead: boolean;
  isRemote: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface GitRemote {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

export interface GitStash {
  index: number;
  message: string;
  branch: string;
  hash: string;
}

export interface GitBlameLine {
  line: number;
  hash: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
}

export interface GitSubmodule {
  path: string;
  url: string;
  commit: string;
  isDirty: boolean;
}

export interface LogOptions {
  maxCount?: number;
  beforeHash?: string;
  path?: string;
  author?: string;
  since?: string;
  until?: string;
}

export interface PushOptions {
  forceWithLease?: boolean;
  tags?: boolean;
  upstream?: boolean;
}

export interface PullOptions {
  rebase?: boolean;
  ffOnly?: boolean;
}

export interface FetchOptions {
  prune?: boolean;
  tags?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  refs: GraphRef[];
}

export interface GraphNode {
  hash: string;
  parents: string[];
  message: string;
  author: string;
  date: string;
  children: string[];
}

export interface GraphRef {
  hash: string;
  name: string;
  refType: 'branch' | 'tag' | 'head' | 'remote';
}

export interface CommitDetail {
  hash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  date: string;
  committer: string;
  stats: FileStat[];
  diff: string;
}

export interface FileStat {
  path: string;
  added: number;
  deleted: number;
}

export interface DiffHunk {
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  sectionHeader: string;
  lines: DiffLine[];
  filePath: string;
}

export interface DiffLine {
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  type: 'added' | 'removed' | 'context';
}

export interface LineSelection {
  hunkIndex: number;
  lineIndices: number[];
}

export type DiffMode = "side-by-side" | "inline";
export type ConflictSide = "ours" | "base" | "theirs";

export interface MergeConflictFile {
  path: string;
  ours: string | null;
  base: string | null;
  theirs: string | null;
}

export type GitStatusType = "modified" | "added" | "deleted" | "untracked" | "conflict" | "renamed";

export interface GitFileDecoration {
  path: string;
  status: GitStatusType;
}

export interface RebaseTodo {
  index: number;
  originalIndex: number;
  action: 'pick' | 'squash' | 'fixup' | 'reword' | 'drop' | 'edit';
  hash: string;
  message: string;
}

export interface RebaseStatus {
  inProgress: boolean;
  total: number;
  current: number;
  currentHash: string;
  currentMessage: string;
  pauseReason: 'conflict' | 'reword' | 'edit' | 'todoEdit' | 'none';
  hasConflict: boolean;
}

export interface GitTag {
  name: string;
  hash: string;
  date: string;
  message: string;
  isAnnotated: boolean;
}

export interface CherryPickOptions {
  noCommit?: boolean;
  strategyTheirs?: boolean;
  hashes?: string[];
}

export interface CherryPickStatus {
  inProgress: boolean;
  currentHash: string;
  hasConflict: boolean;
}

export interface RevertOptions {
  noCommit?: boolean;
  parentNumber?: number;
}

export interface RevertStatus {
  inProgress: boolean;
  currentHash: string;
  hasConflict: boolean;
}

export interface BranchCompareResult {
  aheadCommits: string[];
  behindCommits: string[];
  files: FileStat[];
  aheadCount: number;
  behindCount: number;
}

export interface StashOptions {
  paths?: string[];
  message?: string;
  keepIndex?: boolean;
  staged?: boolean;
}

export interface StashApplyResult {
  success: boolean;
  hasConflict: boolean;
  conflictedFiles: string[];
}

export interface WorktreeEntry {
  path: string;
  branch: string;
  commit: string;
  isDirty: boolean;
  isBare: boolean;
  isDetached: boolean;
}

export interface BisectStatus {
  inProgress: boolean;
  step: 'running' | 'done' | 'error';
  currentHash: string;
  currentMessage: string;
  remaining: number;
  total: number;
  firstBadHash?: string;
  firstBadMessage?: string;
  log: string;
}

export interface BisectStartOptions {
  bad: string;
  good: string;
  paths?: string[];
}

export interface MergeOptions {
  noFF?: boolean;
  squash?: boolean;
}
