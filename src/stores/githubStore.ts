import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device";
import { createOctokit, destroyOctokit, getOctokit, parseGitHubRemote } from "@/lib/github";
import type {
  GitHubStoreState, GitHubPullRequest, GitHubIssue, GitHubCheckRun, GitHubUser,
} from "@/types/github";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
if (!GITHUB_CLIENT_ID) {
  console.error("VITE_GITHUB_CLIENT_ID environment variable is not set. GitHub auth will not work.");
}

interface GitHubActions {
  startDeviceAuth: () => Promise<void>;
  signOut: () => void;
  restoreSession: (token: string) => Promise<void>;
  setRepoFromRemote: (remoteUrl: string | undefined) => void;
  fetchPullRequests: () => Promise<void>;
  fetchIssues: () => Promise<void>;
  refreshAll: () => Promise<void>;
  clearVerification: () => void;
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
      _verification: null as { code: string; uri: string } | null,

      clearVerification: () => {
        set({ _verification: null });
      },

      startDeviceAuth: async () => {
        try {
          set({ error: null });
          const auth = createOAuthDeviceAuth({
            clientId: GITHUB_CLIENT_ID || "YOUR_CLIENT_ID",
            scopes: ["repo", "read:user"],
            onVerification: ({ user_code, verification_uri }) => {
              set({ _verification: { code: user_code, uri: verification_uri } });
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
          get().setRepoFromRemote((origin?.fetchUrl ?? origin?.pushUrl) ?? undefined);
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
              } catch { /* PR may not have checks */ }
              return {
                number: pr.number, title: pr.title, body: pr.body,
                state: pr.state as "open" | "closed",
                draft: pr.draft ?? false, merged: pr.merged_at !== null,
                mergeable: (pr as any).mergeable,
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
      partialize: (state) => ({ token: state.token, user: state.user, authenticated: state.authenticated, repo: state.repo }),
      onRehydrateStorage: () => (state) => {
        if (state?.authenticated && state.token) {
          state.restoreSession(state.token);
        }
      },
    }
  )
);
