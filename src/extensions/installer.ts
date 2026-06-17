import { ensureExtensionsDir, scanExtensions } from "./scanner";
import { createDirectory, writeFile, pathExists } from "@/tauri/fs";
import {
  browserCreateDirectory,
  browserWriteFile,
  browserPathExists,
  initBrowserFs,
} from "@/lib/browserFs";
import { isTauri } from "@/lib/platform";
import { activateExtension } from "./host";
import { useExtensionStore } from "./store";

interface GitHubRepo {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Parse a GitHub URL into owner/repo/branch.
 * Supports: https://github.com/owner/repo, https://github.com/owner/repo/tree/branch
 */
export function parseGitHubUrl(url: string): GitHubRepo | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") return null;

    const parts = u.pathname.replace(/^\/|\/$/g, "").split("/");
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");
    let branch = "main";

    if (parts.length >= 4 && parts[2] === "tree") {
      branch = parts.slice(3).join("/");
    }

    return { owner, repo, branch };
  } catch {
    return null;
  }
}

interface GitHubFile {
  path: string;
  type: "file" | "dir";
  download_url?: string | null;
}

/**
 * Fetch the repo's default branch name from GitHub API.
 */
async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "code-editor" },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Repository "${owner}/${repo}" not found`);
    if (res.status === 403) throw new Error("GitHub API rate limit exceeded. Try again later.");
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.default_branch ?? "main";
}

/**
 * List all files in a GitHub repo tree (recursive).
 */
async function listRepoFiles(owner: string, repo: string, branch: string): Promise<GitHubFile[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "code-editor" },
    },
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Branch "${branch}" not found in ${owner}/${repo}`);
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  const files: GitHubFile[] = (data.tree ?? [])
    .filter((item: { type: string }) => item.type === "blob")
    .map((item: { path: string }) => ({
      path: item.path,
      type: "file" as const,
      download_url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`,
    }));

  return files;
}

/**
 * Validate that a directory contains a valid extension.
 * Looks for index.js in the root.
 */
function isValidExtension(files: GitHubFile[]): boolean {
  return files.some((f) => f.path === "index.js");
}

/**
 * Install an extension from a GitHub URL.
 *
 * Works in both Tauri (real filesystem) and browser (virtual fs) modes.
 *
 * Returns the extension name on success.
 */
export async function installFromGitHub(url: string): Promise<{ name: string; files: number }> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error(
      "Invalid GitHub URL. Expected: https://github.com/user/repo or https://github.com/user/repo/tree/branch",
    );
  }

  // Use the requested branch or fetch the default branch
  let branch = parsed.branch;
  if (parsed.branch === "main" || parsed.branch === "master") {
    // branch was explicitly set or is the default guess - verify it exists
    try {
      branch = await getDefaultBranch(parsed.owner, parsed.repo);
    } catch {
      // Use the original branch if API call fails
      branch = parsed.branch;
    }
  }

  // List all files
  const files = await listRepoFiles(parsed.owner, parsed.repo, branch);

  // Validate it's a valid extension
  if (!isValidExtension(files)) {
    throw new Error(
      "This repository does not appear to be a valid extension. " +
        "Extensions must have an index.js file in the root directory.",
    );
  }

  // Determine extension name from repo name
  const extName = parsed.repo.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || parsed.repo;

  // Create extension directory
  const extDir = await ensureExtensionsDir();
  const targetDir = `${extDir}/${extName}`;

  // Remove existing if present
  const existing = isTauri()
    ? await pathExists(targetDir)
    : await browserPathExists(targetDir);
  if (existing) {
    // If it already exists just scan and activate it
    const scanned = await scanExtensions();
    const alreadyScanned = scanned.find((s) => s.id === extName);
    if (alreadyScanned) {
      return { name: extName, files: 0 };
    }
  }

  if (isTauri()) {
    await createDirectory(targetDir);
  } else {
    initBrowserFs();
    await browserCreateDirectory(targetDir);
  }
  let fileCount = 0;

  // Download and save each file
  for (const file of files) {
    if (!file.download_url) continue;

    // Skip node_modules, .git, .github
    if (
      file.path.startsWith("node_modules/") ||
      file.path.startsWith(".git/") ||
      file.path.startsWith(".github/")
    ) {
      continue;
    }

    try {
      const res = await fetch(file.download_url);
      if (!res.ok) continue;

      const content = await res.text();

      // Ensure subdirectories exist
      const dirParts = file.path.split("/");
      if (dirParts.length > 1) {
        let currentDir = targetDir;
        for (let i = 0; i < dirParts.length - 1; i++) {
          currentDir = `${currentDir}/${dirParts[i]}`;
          if (isTauri()) {
            const dirExists = await pathExists(currentDir);
            if (!dirExists) {
              await createDirectory(currentDir);
            }
          } else {
            const dirExists = await browserPathExists(currentDir);
            if (!dirExists) {
              await browserCreateDirectory(currentDir);
            }
          }
        }
      }

      if (isTauri()) {
        await writeFile(`${targetDir}/${file.path}`, content);
      } else {
        await browserWriteFile(`${targetDir}/${file.path}`, content);
      }
      fileCount++;
    } catch (err) {
      console.warn(`[ext:installer] failed to download ${file.path}:`, err);
    }
  }

  if (fileCount === 0) {
    throw new Error("Failed to download any files from the repository.");
  }

  // Scan and activate the new extension
  const scanned = await scanExtensions();
  const newExt = scanned.find((s) => s.id === extName);
  if (newExt) {
    const extInfo = {
      id: newExt.id,
      manifest: newExt.manifest,
      isActive: false,
      error: null as string | null,
    };
    useExtensionStore.getState().setExtensions([
      ...useExtensionStore.getState().extensions,
      extInfo,
    ]);
    await activateExtension(extName);
  }

  return { name: extName, files: fileCount };
}
