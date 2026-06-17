# GitHub Panel Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom-built git source control UI with a unified panel that combines local git operations (keeps Rust backend) with a professional GitHub integration via Octokit for PRs, issues, and CI status.

**Architecture:**
- Keep the 481-line Rust git backend entirely unchanged for local operations (status, diff, stage, commit)
- Add Octokit (`@octokit/rest` + `@octokit/auth-oauth-device`) for GitHub API features
- Restructure GitSidebar to have two tabs: "Changes" (local git) and "GitHub" (remote PRs/issues/CI)
- Add GitHub OAuth device flow authentication, storing token in Zustand persist
- Only modify Rust git push/pull/fetch to accept an optional token parameter

**Tech Stack:** @octokit/rest, @octokit/auth-oauth-device, Zustand, shadcn/ui

---

## File Structure

### Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `src/types/github.ts` | TypeScript types for GitHub API data |
| 2 | `src/lib/github.ts` | Octokit client factory + helpers |
| 3 | `src/stores/githubStore.ts` | Zustand store for auth + GitHub state |
| 4 | `src/components/github/GitHubAuth.tsx` | Sign-in/sign-out UI with device flow |
| 5 | `src/components/github/GitHubPanel.tsx` | Container with PR/Issue sub-tabs |
| 6 | `src/components/github/GitHubPullRequestList.tsx` | PR list for current repo |
| 7 | `src/components/github/GitHubIssueList.tsx` | Issue list for current repo |
| 8 | `src/components/github/GitHubPullRequestDetail.tsx` | PR detail with checks |
| 9 | `src/components/github/GitHubCIStatus.tsx` | CI check run indicators |

### Files to Modify

| # | File | Change |
|---|------|--------|
| 10 | `package.json` | Add `@octokit/rest`, `@octokit/auth-oauth-device` |
| 11 | `src/components/git/GitSidebar.tsx` | Add Changes/GitHub tabs, integrate GitHubPanel |
| 12 | `src/components/git/GitChanges.tsx` | Accept `onOpenDiff` prop for external diff |
| 13 | `src-tauri/src/commands/git.rs` | Add optional `token` param to push/pull/fetch |
| 14 | `src/tauri/git.ts` | Add `token` param to push/pull/fetch signatures |
| 15 | `src/stores/gitStore.ts` | Wire token into push/pull from githubStore |

### Files to Delete

| # | File | Lines | Reason |
|---|------|-------|--------|
| 16 | `src/components/git/GitBranchPanel.tsx` | 151 | GitHub handles branch management |
| 17 | `src/components/git/GitRemotesPanel.tsx` | 89 | GitHub handles remotes |
| 18 | `src/components/git/GitStashesPanel.tsx` | 56 | Unused standalone panel |
| 19 | `src/components/git/GitProviderIntegration.tsx` | 104 | Replaced by GitHubPanel |

### Files to Keep (unchanged)

`GitChanges.tsx` (modified for prop only), `GitCommitBox.tsx`, `GitDiffView.tsx`, `GitEmptyState.tsx`, `GitHistoryView.tsx`, `MergeConflictResolver.tsx`, `src/stores/gitStore.ts` (modified for token only), all Rust commands except push/pull/fetch.

---

## Task 1: Add Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @octokit packages**

```bash
npm install @octokit/rest @octokit/auth-oauth-device
```

Both packages ship TypeScript definitions — no separate `@types/` needed.

---

## Task 2: Create GitHub Types

**Files:**
- Create: `src/types/github.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
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
}
```

---

## Task 3: Create Octokit Client

**Files:**
- Create: `src/lib/github.ts`

- [ ] **Step 1: Write the Octokit client factory**

```typescript
import { Octokit } from "@octokit/rest";

let _octokit: Octokit | null = null;

export function getOctokit(): Octokit | null {
  return _octokit;
}

export function createOctokit(token: string): Octokit {
  _octokit = new Octokit({ auth: token, request: { timeout: 10000 } });
  return _octokit;
}

export function destroyOctokit(): void {
  _octokit = null;
}

export function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const https = url.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/);
  const ssh = url.match(/^git@github\.com:([^\/]+)\/([^\/]+?)(\.git)?$/);
  const match = https ?? ssh;
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}
```

---

## Task 4: Create GitHub Store

**Files:**
- Create: `src/stores/githubStore.ts`

- [ ] **Step 1: Write the Zustand store with persist**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device";
import { createOctokit, destroyOctokit, getOctokit, parseGitHubRemote } from "@/lib/github";
import type {
  GitHubStoreState, GitHubPullRequest, GitHubIssue, GitHubCheckRun, GitHubUser,
} from "@/types/github";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID ?? "YOUR_CLIENT_ID";

interface GitHubActions {
  startDeviceAuth: () => Promise<void>;
  signOut: () => void;
  restoreSession: (token: string) => Promise<void>;
  setRepoFromRemote: (remoteUrl: string | undefined) => void;
  fetchPullRequests: () => Promise<void>;
  fetchIssues: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

export const useGitHubStore = create<GitHubStoreState & GitHubActions>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      authenticated: false,
      repo: null,
      pullRequests: [],
      issues: [],
      prsLoading: false,
      issuesLoading: false,
      error: null,

      startDeviceAuth: async () => {
        try {
          set({ error: null });
          const auth = createOAuthDeviceAuth({
            clientId: GITHUB_CLIENT_ID,
            scopes: ["repo", "read:user"],
            onVerification: ({ user_code, verification_uri }) => {
              (get() as any)._verification = { code: user_code, uri: verification_uri };
            },
          });

          const { token } = await auth({ type: "oauth" });
          const octokit = createOctokit(token);
          const { data } = await octokit.users.getAuthenticated();
          const user: GitHubUser = {
            login: data.login,
            avatarUrl: data.avatar_url,
            name: data.name ?? null,
            email: data.email ?? null,
          };

          set({ token, user, authenticated: true, error: null });

          const { useGitStore } = await import("@/stores/gitStore");
          const remotes = useGitStore.getState().remotes;
          const origin = remotes.find((r) => r.name === "origin");
          get().setRepoFromRemote(origin?.fetchUrl ?? origin?.pushUrl);
          get().refreshAll();
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Authentication failed" });
        }
      },

      signOut: () => {
        destroyOctokit();
        set({
          token: null, user: null, authenticated: false,
          pullRequests: [], issues: [], repo: null, error: null,
        });
      },

      restoreSession: async (token: string) => {
        try {
          const octokit = createOctokit(token);
          const { data } = await octokit.users.getAuthenticated();
          const user: GitHubUser = {
            login: data.login,
            avatarUrl: data.avatar_url,
            name: data.name ?? null,
            email: data.email ?? null,
          };
          set({ token, user, authenticated: true });
          get().refreshAll();
        } catch {
          destroyOctokit();
          set({ token: null, user: null, authenticated: false });
        }
      },

      setRepoFromRemote: (remoteUrl: string | undefined) => {
        if (!remoteUrl) { set({ repo: null, pullRequests: [], issues: [] }); return; }
        const parsed = parseGitHubRemote(remoteUrl);
        if (parsed) {
          set({
            repo: {
              owner: parsed.owner, repo: parsed.repo,
              fullName: `${parsed.owner}/${parsed.repo}`, defaultBranch: "",
            },
          });
        } else {
          set({ repo: null });
        }
      },

      fetchPullRequests: async () => {
        const octokit = getOctokit();
        const repo = get().repo;
        if (!octokit || !repo) return;
        set({ prsLoading: true, error: null });
        try {
          const { data } = await octokit.pulls.list({
            owner: repo.owner, repo: repo.repo,
            state: "open", sort: "updated", per_page: 30,
          });
          const prs: GitHubPullRequest[] = await Promise.all(
            data.map(async (pr) => {
              let checks: GitHubCheckRun[] = [];
              try {
                const { data: checksData } = await octokit.checks.listForRef({
                  owner: repo.owner, repo: repo.repo, ref: pr.head.sha,
                });
                checks = checksData.check_runs.map((cr) => ({
                  name: cr.name,
                  status: cr.status as GitHubCheckRun["status"],
                  conclusion: cr.conclusion as GitHubCheckRun["conclusion"],
                  htmlUrl: cr.html_url,
                }));
              } catch { /* no checks */ }
              return {
                number: pr.number, title: pr.title, body: pr.body,
                state: pr.state as "open" | "closed",
                draft: pr.draft ?? false, merged: pr.merged_at !== null,
                mergeable: pr.mergeable,
                author: { login: pr.user?.login ?? "", avatarUrl: pr.user?.avatar_url ?? "" },
                createdAt: pr.created_at, updatedAt: pr.updated_at,
                headRef: pr.head.label, baseRef: pr.base.label, htmlUrl: pr.html_url,
                labels: (pr.labels as any[] ?? []).map((l: any) => ({ name: l.name, color: l.color })),
                checks,
              };
            })
          );
          set({ pullRequests: prs, prsLoading: false });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Failed to fetch PRs", prsLoading: false });
        }
      },

      fetchIssues: async () => {
        const octokit = getOctokit();
        const repo = get().repo;
        if (!octokit || !repo) return;
        set({ issuesLoading: true, error: null });
        try {
          const { data } = await octokit.issues.listForRepo({
            owner: repo.owner, repo: repo.repo,
            state: "open", sort: "updated", per_page: 30,
          });
          const issues: GitHubIssue[] = data
            .filter((i: any) => !i.pull_request)
            .map((i: any) => ({
              number: i.number, title: i.title, body: i.body,
              state: i.state as "open" | "closed",
              author: { login: i.user?.login ?? "", avatarUrl: i.user?.avatar_url ?? "" },
              createdAt: i.created_at, updatedAt: i.updated_at, commentsCount: i.comments,
              labels: (i.labels as any[] ?? []).map((l: any) => ({ name: l.name, color: l.color })),
              htmlUrl: i.html_url,
            }));
          set({ issues, issuesLoading: false });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Failed to fetch issues", issuesLoading: false });
        }
      },

      refreshAll: async () => {
        const { fetchPullRequests, fetchIssues, repo } = get();
        if (!repo) return;
        await Promise.all([fetchPullRequests(), fetchIssues()]);
      },
    }),
    {
      name: "code-editor:github",
      partialize: (state) => ({ token: state.token, user: state.user, authenticated: state.authenticated }),
      onRehydrateStorage: () => (state) => {
        if (state?.authenticated && state.token) {
          state.restoreSession(state.token);
        }
      },
    }
  )
);
```

---

## Task 5: Create GitHub Auth UI

**Files:**
- Create: `src/components/github/GitHubAuth.tsx`

- [ ] **Step 1: Write the auth component**

```tsx
import { useGitHubStore } from "@/stores/githubStore";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Github } from "lucide-react";
import { useState, useEffect } from "react";

export function GitHubAuth() {
  const { authenticated, user, startDeviceAuth, signOut, error } = useGitHubStore();
  const [authing, setAuthing] = useState(false);
  const [verification, setVerification] = useState<{ code: string; uri: string } | null>(null);

  useEffect(() => {
    const unsub = useGitHubStore.subscribe((state: any) => {
      if (state._verification) {
        setVerification({ code: state._verification.code, uri: state._verification.uri });
        (useGitHubStore.getState() as any)._verification = null;
      }
    });
    return unsub;
  }, []);

  if (authenticated && user) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Avatar className="h-6 w-6">
          <AvatarImage src={user.avatarUrl} alt={user.login} />
          <AvatarFallback>{user.login[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground flex-1 truncate">{user.login}</span>
        <Button variant="ghost" size="icon-xs" onClick={signOut} aria-label="Sign out">
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (verification) {
    return (
      <div className="px-3 py-4 space-y-3 border-b">
        <p className="text-xs text-muted-foreground">
          Enter the code below at{" "}
          <a href={verification.uri} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            github.com/login/device
          </a>
        </p>
        <code className="block text-center text-lg font-mono bg-muted rounded px-4 py-2 tracking-widest">
          {verification.code}
        </code>
        <p className="text-xs text-muted-foreground text-center">Waiting for authorization...</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="px-3 py-4 border-b">
      <Button
        variant="outline" size="sm" className="w-full gap-2" disabled={authing}
        onClick={async () => { setAuthing(true); setVerification(null); await startDeviceAuth(); setAuthing(false); }}
      >
        <Github className="h-4 w-4" />
        {authing ? "Connecting..." : "Sign in with GitHub"}
      </Button>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}
```

---

## Task 6: Create GitHub PR List

**Files:**
- Create: `src/components/github/GitHubPullRequestList.tsx`

- [ ] **Step 1: Write the PR list component**

```tsx
import { useGitHubStore } from "@/stores/githubStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitPullRequest, GitPullRequestDraft, GitMerge } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { GitHubPullRequestDetail } from "./GitHubPullRequestDetail";

export function GitHubPullRequestList() {
  const { pullRequests, prsLoading, repo } = useGitHubStore();
  const [selectedPr, setSelectedPr] = useState<number | null>(null);

  if (!repo) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <GitPullRequest className="h-8 w-8 mb-2" />
        <p className="text-xs">No GitHub remote detected</p>
        <p className="text-xs">Push to GitHub to see pull requests</p>
      </div>
    );
  }

  if (selectedPr !== null) {
    const pr = pullRequests.find((p) => p.number === selectedPr);
    if (pr) return <GitHubPullRequestDetail pr={pr} onBack={() => setSelectedPr(null)} />;
    setSelectedPr(null);
  }

  return (
    <ScrollArea className="flex-1">
      {prsLoading && pullRequests.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {!prsLoading && pullRequests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <GitPullRequest className="h-8 w-8 mb-2" />
          <p className="text-xs">No open pull requests</p>
        </div>
      )}
      {pullRequests.map((pr) => (
        <button
          key={pr.number}
          onClick={() => setSelectedPr(pr.number)}
          className={cn("w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/50", "focus-visible:outline-none focus-visible:bg-accent")}
        >
          <div className="flex items-start gap-2">
            {pr.draft ? <GitPullRequestDraft className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> :
             pr.merged ? <GitMerge className="h-4 w-4 mt-0.5 shrink-0 text-purple-500" /> :
             <GitPullRequest className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{pr.title}</p>
              <p className="text-xs text-muted-foreground">#{pr.number} · {pr.author.login}</p>
            </div>
          </div>
          {pr.checks.length > 0 && (
            <div className="flex gap-1 mt-1 ml-6">
              {pr.checks.map((check, i) => (
                <span key={i} className={cn("inline-block h-2 w-2 rounded-full", check.conclusion === "success" && "bg-green-500", check.conclusion === "failure" && "bg-red-500", check.conclusion === "neutral" && "bg-gray-400", (!check.conclusion || check.status !== "completed") && "bg-yellow-400")} title={check.name} />
              ))}
            </div>
          )}
          {pr.labels.length > 0 && (
            <div className="flex gap-1 mt-1 ml-6 flex-wrap">
              {pr.labels.map((label) => (
                <span key={label.name} className="inline-block text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `#${label.color}22`, color: `#${label.color}` }}>{label.name}</span>
              ))}
            </div>
          )}
        </button>
      ))}
    </ScrollArea>
  );
}
```

---

## Task 7: Create GitHub Issue List

**Files:**
- Create: `src/components/github/GitHubIssueList.tsx`

- [ ] **Step 1: Write the issue list component**

```tsx
import { useGitHubStore } from "@/stores/githubStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleDot, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function GitHubIssueList() {
  const { issues, issuesLoading, repo } = useGitHubStore();

  if (!repo) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CircleDot className="h-8 w-8 mb-2" />
        <p className="text-xs">No GitHub remote detected</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      {issuesLoading && issues.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {!issuesLoading && issues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CircleDot className="h-8 w-8 mb-2" />
          <p className="text-xs">No open issues</p>
        </div>
      )}
      {issues.map((issue) => (
        <a
          key={issue.number} href={issue.htmlUrl} target="_blank" rel="noopener noreferrer"
          className={cn("flex items-start gap-2 px-3 py-2 hover:bg-accent transition-colors border-b border-border/50", "focus-visible:outline-none focus-visible:bg-accent")}
        >
          <CircleDot className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{issue.title}</p>
            <p className="text-xs text-muted-foreground">#{issue.number} · {issue.author.login}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{issue.commentsCount}</span>
          </div>
        </a>
      ))}
    </ScrollArea>
  );
}
```

---

## Task 8: Create PR Detail View

**Files:**
- Create: `src/components/github/GitHubPullRequestDetail.tsx`

- [ ] **Step 1: Write the PR detail component**

```tsx
import type { GitHubPullRequest } from "@/types/github";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ExternalLink, GitPullRequest, GitPullRequestDraft, GitMerge } from "lucide-react";
import { GitHubCIStatus } from "./GitHubCIStatus";

interface Props { pr: GitHubPullRequest; onBack: () => void }

export function GitHubPullRequestDetail({ pr, onBack }: Props) {
  const statusIcon = pr.draft ? <GitPullRequestDraft className="h-4 w-4 text-muted-foreground" /> :
                     pr.merged ? <GitMerge className="h-4 w-4 text-purple-500" /> :
                     <GitPullRequest className="h-4 w-4 text-green-500" />;
  const statusText = pr.draft ? "Draft" : pr.merged ? "Merged" : pr.state === "closed" ? "Closed" : "Open";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-1 border-b">
        <Button variant="ghost" size="icon-xs" onClick={onBack} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
        <span className="text-xs font-medium">PR #{pr.number}</span>
        <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </a>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-3">
          <div className="flex items-center gap-2">{statusIcon}<span className="text-xs text-muted-foreground">{statusText}</span></div>
          <h3 className="text-sm font-semibold leading-tight">{pr.title}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <img src={pr.author.avatarUrl} alt={pr.author.login} className="h-4 w-4 rounded-full" />
            <span>{pr.author.login}</span><ArrowLeft className="h-3 w-3" /><span>{pr.headRef}</span>
            <span className="text-muted-foreground/50">→</span><span>{pr.baseRef}</span>
          </div>
          {pr.body && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap line-clamp-6">{pr.body}</div>
          )}
          {pr.labels.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {pr.labels.map((label) => (
                <span key={label.name} className="inline-block text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `#${label.color}22`, color: `#${label.color}` }}>{label.name}</span>
              ))}
            </div>
          )}
          {pr.checks.length > 0 ? <GitHubCIStatus checks={pr.checks} /> :
           <p className="text-xs text-muted-foreground text-center py-4">No CI checks for this PR</p>}
        </div>
      </ScrollArea>
    </div>
  );
}
```

---

## Task 9: Create CI Status Component

**Files:**
- Create: `src/components/github/GitHubCIStatus.tsx`

- [ ] **Step 1: Write the CI status component**

```tsx
import type { GitHubCheckRun } from "@/types/github";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, MinusCircle, Clock } from "lucide-react";

interface Props { checks: GitHubCheckRun[] }

export function GitHubCIStatus({ checks }: Props) {
  const passed = checks.filter((c) => c.conclusion === "success").length;
  const failed = checks.filter((c) => c.conclusion === "failure").length;
  const pending = checks.filter((c) => c.status !== "completed" || c.conclusion === null).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> {passed}</span>
        <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> {failed}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-yellow-500" /> {pending}</span>
      </div>
      <div className="space-y-1">
        {checks.map((check, i) => (
          <a key={i} href={check.htmlUrl ?? undefined} target="_blank" rel="noopener noreferrer"
             className={cn("flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-accent transition-colors",
               check.conclusion === "failure" && "text-red-500",
               check.conclusion === "success" && "text-green-500",
               (check.status !== "completed" || check.conclusion === null) && "text-yellow-500")}
          >
            {check.conclusion === "success" ? <CheckCircle className="h-3 w-3 shrink-0" /> :
             check.conclusion === "failure" ? <XCircle className="h-3 w-3 shrink-0" /> :
             check.conclusion === "neutral" || check.conclusion === "skipped" ? <MinusCircle className="h-3 w-3 shrink-0" /> :
             <Clock className="h-3 w-3 shrink-0 animate-pulse" />}
            <span className="truncate">{check.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

---

## Task 10: Create GitHub Panel Container

**Files:**
- Create: `src/components/github/GitHubPanel.tsx`

- [ ] **Step 1: Write the main GitHub panel**

```tsx
import { useState, useEffect } from "react";
import { useGitHubStore } from "@/stores/githubStore";
import { useGitStore } from "@/stores/gitStore";
import { GitHubAuth } from "./GitHubAuth";
import { GitHubPullRequestList } from "./GitHubPullRequestList";
import { GitHubIssueList } from "./GitHubIssueList";
import { GitPullRequest, CircleDot, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SubTab = "prs" | "issues";

export function GitHubPanel() {
  const { authenticated, refreshAll, prsLoading, setRepoFromRemote } = useGitHubStore();
  const [subTab, setSubTab] = useState<SubTab>("prs");
  const remotes = useGitStore((s) => s.remotes);

  useEffect(() => {
    const origin = remotes.find((r) => r.name === "origin");
    setRepoFromRemote(origin?.fetchUrl ?? origin?.pushUrl);
  }, [remotes, setRepoFromRemote]);

  return (
    <div className="flex flex-col h-full">
      <GitHubAuth />
      {authenticated && (
        <>
          <div className="flex border-b">
            <button onClick={() => setSubTab("prs")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 transition-colors",
                subTab === "prs" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            ><GitPullRequest className="h-3.5 w-3.5" /> Pull Requests</button>
            <button onClick={() => setSubTab("issues")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 transition-colors",
                subTab === "issues" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            ><CircleDot className="h-3.5 w-3.5" /> Issues</button>
            <div className="flex-1" />
            <Button variant="ghost" size="icon-xs" onClick={refreshAll} disabled={prsLoading} className="mr-1" aria-label="Refresh">
              <RefreshCw className={cn("h-3.5 w-3.5", prsLoading && "animate-spin")} />
            </Button>
          </div>
          {subTab === "prs" ? <GitHubPullRequestList /> : <GitHubIssueList />}
        </>
      )}
    </div>
  );
}
```

---

## Task 11: Restructure GitSidebar with Changes/GitHub Tabs

**Files:**
- Modify: `src/components/git/GitSidebar.tsx`
- Modify: `src/components/git/GitChanges.tsx` (add `onOpenDiff` prop)

- [ ] **Step 1: Rewrite GitSidebar.tsx**

Replace entire content:

```tsx
import { useState } from "react";
import { useGitStore } from "@/stores/gitStore";
import { useFileStore } from "@/stores/fileStore";
import { useEditorStore } from "@/stores/editorStore";
import { GitEmptyState } from "./GitEmptyState";
import { GitChanges } from "./GitChanges";
import { GitCommitBox } from "./GitCommitBox";
import { GitDiffView } from "./GitDiffView";
import { GitHubPanel } from "@/components/github/GitHubPanel";
import { Button } from "@/components/ui/button";
import { RefreshCw, GitBranch, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "changes" | "github";

export function GitSidebar() {
  const isRepo = useGitStore((s) => s.isRepo);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const status = useGitStore((s) => s.status);
  const statusLoading = useGitStore((s) => s.statusLoading);
  const currentBranch = useGitStore((s) => s.currentBranch);
  const refreshStatus = useGitStore((s) => s.refreshStatus);
  const push = useGitStore((s) => s.push);
  const pull = useGitStore((s) => s.pull);
  const rootPath = useFileStore((s) => s.rootPath);
  const openFile = useEditorStore((s) => s.openFile);

  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [diffStaged, setDiffStaged] = useState(false);
  const [tab, setTab] = useState<Tab>("changes");

  const handleOpenDiff = (path: string, staged?: boolean) => {
    setDiffPath(path); setDiffStaged(staged ?? false);
  };

  if (!rootPath || checkingRepo || !isRepo) return <GitEmptyState />;

  if (diffPath) {
    return (
      <GitDiffView path={diffPath} staged={diffStaged}
        onClose={() => { setDiffPath(null); setDiffStaged(false); }}
        openFile={openFile} />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Source Control</span>
        <Button variant="ghost" size="icon-xs" onClick={() => refreshStatus()} disabled={statusLoading} aria-label="Refresh">
          <RefreshCw className={cn("h-3.5 w-3.5", statusLoading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex border-b">
        <button onClick={() => setTab("changes")}
          className={cn("flex-1 text-xs py-1.5 border-b-2 transition-colors",
            tab === "changes" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >Changes</button>
        <button onClick={() => setTab("github")}
          className={cn("flex-1 text-xs py-1.5 border-b-2 transition-colors",
            tab === "github" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >GitHub</button>
      </div>

      {tab === "changes" ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-mono truncate flex-1">{currentBranch ?? "unknown"}</span>
            {status && (status.ahead > 0 || status.behind > 0) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {status.ahead > 0 && (
                  <button onClick={() => push()} className="flex items-center gap-0.5 hover:text-foreground" title={`Push ${status.ahead} commits`}>
                    <ArrowUp className="h-3 w-3" /><span>{status.ahead}</span>
                  </button>
                )}
                {status.behind > 0 && (
                  <button onClick={() => pull()} className="flex items-center gap-0.5 hover:text-foreground" title={`Pull ${status.behind} commits`}>
                    <ArrowDown className="h-3 w-3" /><span>{status.behind}</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <GitCommitBox />
          <GitChanges onOpenDiff={handleOpenDiff} />
        </div>
      ) : (
        <GitHubPanel />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `onOpenDiff` prop to GitChanges.tsx**

Find the component's function declaration around line 20-30. Change:
```
export function GitChanges() {
```
to:
```
export function GitChanges({ onOpenDiff }: { onOpenDiff?: (path: string, staged?: boolean) => void }) {
```

Find where a file's diff button handler is defined (likely a function called `handleOpenDiff` or equivalent). Replace the internal navigation with:
```
onOpenDiff?.(entry.path, entry.staged);
```

Keep the old behavior as a fallback when `onOpenDiff` is not provided.

---

## Task 12: Add Token Support to Rust Push/Pull/Fetch

**Files:**
- Modify: `src-tauri/src/commands/git.rs`
- Modify: `src/tauri/git.ts`
- Modify: `src/stores/gitStore.ts`

- [ ] **Step 1: Add `token` parameter to Rust push**

In `src-tauri/src/commands/git.rs`, locate `pub fn git_push` (around line 330). Add `token: Option<String>` to the parameter list. Inside the function body, after `cmd.args(&args);`:

```rust
if let Some(ref token) = token {
    cmd.arg("-c");
    cmd.arg(format!("http.extraHeader=Authorization: bearer {}", token));
}
```

Apply the same `token: Option<String>` pattern to `git_pull` and `git_fetch`.

- [ ] **Step 2: Update TypeScript signatures**

In `src/tauri/git.ts`, add `token?: string` to `gitPush`, `gitPull`, `gitFetch`:

```typescript
export async function gitPush(
  repoPath: string, remote?: string, branch?: string, options?: PushOptions, token?: string
): Promise<string> {
  return invoke("git_push", { repoPath, remote, branch, options, token });
}
```

- [ ] **Step 3: Wire token into gitStore push/pull**

In `src/stores/gitStore.ts`, modify the `push` action. After destructuring `repoRoot`, add:

```typescript
const { useGitHubStore } = await import("@/stores/githubStore");
const token = useGitHubStore.getState().token ?? undefined;
```

Then pass `token` to `gitPush(...)`. Apply the same to the `pull` action.

---

## Task 13: Delete Unused Components

**Files:**
- Delete: `src/components/git/GitBranchPanel.tsx`
- Delete: `src/components/git/GitRemotesPanel.tsx`
- Delete: `src/components/git/GitStashesPanel.tsx`
- Delete: `src/components/git/GitProviderIntegration.tsx`

- [ ] **Step 1: Remove files**

```bash
Remove-Item -LiteralPath "src/components/git/GitBranchPanel.tsx"
Remove-Item -LiteralPath "src/components/git/GitRemotesPanel.tsx"
Remove-Item -LiteralPath "src/components/git/GitStashesPanel.tsx"
Remove-Item -LiteralPath "src/components/git/GitProviderIntegration.tsx"
```

- [ ] **Step 2: Fix broken imports**

```bash
npx tsc --noEmit
```

Fix any import references to deleted files.

- [ ] **Step 3: Remove orphaned store actions**

Check if `refreshBranches`, `refreshRemotes`, `refreshStashes`, `addRemote`, `removeRemote`, `createBranch`, `deleteBranch`, `stashPush`, `stashPop`, `stashDrop` are still called from anywhere outside the store definition. Remove dead calls.

---

## Task 14: Build and Verify

**Files:** None

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 2: Run Rust build**

```bash
cd src-tauri; cargo build; cd ..
```

Expected: Zero errors.

- [ ] **Step 3: Run Vite build**

```bash
npx vite build
```

Expected: Zero errors.

- [ ] **Step 4: Update todos and announce completion**

If any step fails, fix the issue before marking the task complete.

---

## Implementation Order

```
Task 1   (npm install @octokit/rest @octokit/auth-oauth-device)
│
Task 2+3 (types/github.ts + lib/github.ts)     ← parallel
│
Task 4   (stores/githubStore.ts)               ← depends on 2,3
│
Task 5-9 (all github/ components)              ← parallel, each independent
│
Task 10  (GitHubPanel.tsx)                     ← depends on 5-9
│
Task 11  (GitSidebar + GitChanges)             ← depends on 10
│
Task 12  (Rust/TS token support)               ← depends on 4
│
Task 13  (Delete unused files)                 ← depends on 11
│
Task 14  (Verify builds)                       ← final
```

---

## GitHub OAuth Setup

Before using, the developer must:
1. Register a GitHub OAuth App at https://github.com/settings/developers
2. Set the Client ID as `VITE_GITHUB_CLIENT_ID` in a `.env` file at the project root
3. The device flow requires no redirect URI and no client secret
4. Required scopes: `repo` (private repos) + `read:user` (profile info)
