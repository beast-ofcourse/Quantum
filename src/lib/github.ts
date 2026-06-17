import { Octokit } from "@octokit/rest";

let _octokit: Octokit | null = null;

export function getOctokit(): Octokit | null {
  return _octokit;
}

export function createOctokit(token: string): Octokit {
  if (_octokit) {
    destroyOctokit();
  }
  _octokit = new Octokit({ auth: token, request: { timeout: 10000 } });
  return _octokit;
}

export function destroyOctokit(): void {
  _octokit = null;
}

export function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const https = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/);
  const ssh = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/);
  const match = https ?? ssh;
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}
