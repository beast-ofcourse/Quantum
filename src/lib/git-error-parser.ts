/**
 * Friendly Git error message parser (#22)
 *
 * Maps raw Tauri/Rust git error strings to user-friendly messages
 * so users see "Repository not found" instead of
 * `command 'git_push' failed: remote: Repository not found.`
 */

const ERROR_PATTERNS: { pattern: RegExp; friendly: string }[] = [
  // Auth / credentials
  { pattern: /authentication failed/i, friendly: "Authentication failed. Check your credentials or GitHub token." },
  { pattern: /author identity unknown/i, friendly: "Git author not configured. Run: git config --global user.name and user.email" },
  { pattern: /could not read from remote/i, friendly: "Could not connect to remote. Check your network and remote URL." },
  { pattern: /could not resolve host/i, friendly: "Could not reach remote host. Check your network connection." },
  { pattern: /could not resolve proxy/i, friendly: "Could not reach proxy server. Check your proxy settings." },
  { pattern: /cannot redirect.*stderr/i, friendly: "Git protocol error. Check your remote URL uses the correct protocol (ssh vs https)." },
  { pattern: /repository not found/i, friendly: "Repository not found. Check the remote URL and your access permissions." },
  { pattern: /request failed with status code 403/i, friendly: "Access denied (403). Check your credentials or token permissions." },
  { pattern: /request failed with status code 404/i, friendly: "Repository not found (404). Check the remote URL." },
  { pattern: /could not access/i, friendly: "Could not access the remote. Check your permissions and repository URL." },

  // Push rejected / merge conflicts
  { pattern: /failed to push some refs/i, friendly: "Push rejected. Remote has commits you don't have locally. Pull first." },
  { pattern: /cannot lock ref/i, friendly: "Remote rejected (race condition). Another push happened first. Pull and try again." },
  { pattern: /merge conflict/i, friendly: "Merge conflicts detected. Commit or stash your changes before pulling." },
  { pattern: /would be overwritten by merge/i, friendly: "Local changes would be overwritten. Commit or stash them first." },

  // Local repo issues
  { pattern: /not a git repository/i, friendly: "Not a git repository. Run `git init` or open a git project." },
  { pattern: /nothing to commit/i, friendly: "No changes to commit." },
  { pattern: /no such remote/i, friendly: "Remote not found. Check your remotes in the Git panel." },
  { pattern: /pathspec.*did not match/i, friendly: "File path not found in the repository." },
  { pattern: /unable to access/i, friendly: "Cannot access remote. Check your network and remote URL." },
  { pattern: /couldn't find remote ref/i, friendly: "Remote branch not found. It may have been deleted or renamed." },
  { pattern: /fetch first/i, friendly: "Push rejected. Fetch the latest changes and pull first." },
  { pattern: /divergent branches/i, friendly: "Branches have diverged. Pull or rebase to reconcile them." },
  { pattern: /you have divergent branches/i, friendly: "Your branch and the remote have diverged. Pull with --rebase or merge." },
  { pattern: /fetch before pulling/i, friendly: "Fetch before pulling to keep your local refs up to date." },
  { pattern: /cannot rebase.*dirty/i, friendly: "You have uncommitted changes. Stash or commit them before rebasing." },
  { pattern: /no branch/i, friendly: "Not on any branch (detached HEAD). Checkout a branch first." },
  { pattern: /already exists/i, friendly: "A branch or tag with that name already exists." },
  { pattern: /rebase.*conflict/i, friendly: "Rebase encountered conflicts. Resolve them or abort the rebase." },
  { pattern: /stash.*conflict/i, friendly: "Stash pop/apply encountered conflicts. Resolve them manually." },
  { pattern: /permission denied/i, friendly: "Permission denied. Check your SSH keys or access rights." },
  { pattern: /could not read/i, friendly: "Cannot read the file or repository. Check permissions and path." },
  { pattern: /would clobber existing tag/i, friendly: "A tag with that name already exists. Use --force to overwrite." },
  { pattern: /already checked out/i, friendly: "You are already on that branch." },
  { pattern: /failed to lock/i, friendly: "Another git process is running. Wait for it to finish." },
  { pattern: /connection refused/i, friendly: "Connection refused. Is the remote server running and reachable?" },
  { pattern: /connection timed out/i, friendly: "Connection timed out. Check your network or try again later." },
  { pattern: /could not resolve ref/i, friendly: "Could not find the commit or reference." },
  { pattern: /bad revision/i, friendly: "Invalid commit reference or revision." },
  { pattern: /unknown option/i, friendly: "Unknown git option. Check the command syntax." },
  { pattern: /too many arguments/i, friendly: "Too many arguments for this git command." },
];

/**
 * Strip the surrounding "command 'git_xxx' failed: " wrapper from Tauri errors
 * to extract the actual git message.
 */
function stripCommandWrapper(message: string): string {
  return message.replace(/^command 'git_\w+' failed:\s*/i, "");
}

/**
 * Parse a raw git error into a user-friendly message.
 * Falls back to the raw error with the wrapper stripped if no pattern matches.
 */
export function parseGitError(error: unknown): string {
  const raw = String(error);
  const stripped = stripCommandWrapper(raw);

  for (const { pattern, friendly } of ERROR_PATTERNS) {
    if (pattern.test(stripped) || pattern.test(raw)) {
      return friendly;
    }
  }

  // Return the stripped message as a last resort — still better than
  // "command 'git_push' failed: ..." because we dropped the wrapper noise.
  return stripped || raw;
}
