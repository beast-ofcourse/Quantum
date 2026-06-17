export interface GitHubUser {
  login: string;
  avatarUrl: string;
  name: string | null;
  email: string | null;
}

export interface GitHubRepo {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  author: { login: string; avatarUrl: string };
  createdAt: string;
  updatedAt: string;
  headRef: string;
  baseRef: string;
  htmlUrl: string;
  labels: { name: string; color: string }[];
  checks: GitHubCheckRun[];
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  author: { login: string; avatarUrl: string };
  createdAt: string;
  updatedAt: string;
  commentsCount: number;
  labels: { name: string; color: string }[];
  htmlUrl: string;
}

export interface GitHubCheckRun {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;
  htmlUrl: string | null;
}

export interface GitHubAuthState {
  token: string | null;
  user: GitHubUser | null;
  authenticated: boolean;
}

export interface GitHubStoreState extends GitHubAuthState {
  repo: GitHubRepo | null;
  pullRequests: GitHubPullRequest[];
  issues: GitHubIssue[];
  prsLoading: boolean;
  issuesLoading: boolean;
  error: string | null;
  _verification: { code: string; uri: string } | null;
}
