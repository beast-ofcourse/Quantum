import type { MarketplaceExtension, MarketplaceRegistry } from "@/types/marketplace";

const CACHE_KEY = "quantum-marketplace-cache";
const CACHE_TTL = 60 * 60 * 1000;
const GITHUB_API = "https://api.github.com";

interface CacheEntry {
  timestamp: number;
  registry: MarketplaceRegistry;
}

const SEED_EXTENSIONS: MarketplaceExtension[] = [
  {
    id: "esbenp.prettier-vscode",
    name: "prettier-vscode",
    displayName: "Prettier",
    description: "Code formatter using prettier. Supports JS, TS, CSS, JSON, Markdown, and more.",
    version: "11.0.0",
    publisher: "Prettier",
    repository: "https://github.com/prettier/prettier-vscode",
    tags: ["formatter", "tool"],
    downloads: 45000000,
    rating: 4.5,
    updatedAt: "2026-05-01T00:00:00Z",
  },
  {
    id: "dbaeumer.vscode-eslint",
    name: "vscode-eslint",
    displayName: "ESLint",
    description: "Integrates ESLint JavaScript into the editor for real-time linting and fixing.",
    version: "3.0.0",
    publisher: "Microsoft",
    repository: "https://github.com/microsoft/vscode-eslint",
    tags: ["linter", "tool"],
    downloads: 38000000,
    rating: 4.3,
    updatedAt: "2026-04-15T00:00:00Z",
  },
  {
    id: "ms-python.python",
    name: "python",
    displayName: "Python",
    description: "IntelliSense, linting, debugging, and formatting for Python.",
    version: "2024.0.0",
    publisher: "Microsoft",
    repository: "https://github.com/microsoft/vscode-python",
    tags: ["language", "tool"],
    downloads: 120000000,
    rating: 4.0,
    updatedAt: "2026-03-20T00:00:00Z",
  },
  {
    id: "rust-lang.rust-analyzer",
    name: "rust-analyzer",
    displayName: "rust-analyzer",
    description: "Rust language support with code completion, navigation, and refactoring.",
    version: "0.4.0",
    publisher: "Rust",
    repository: "https://github.com/rust-lang/rust-analyzer",
    tags: ["language", "tool"],
    downloads: 15000000,
    rating: 4.8,
    updatedAt: "2026-05-10T00:00:00Z",
  },
  {
    id: "github.copilot",
    name: "copilot",
    displayName: "GitHub Copilot",
    description: "AI-powered code completions and chat assistance right in the editor.",
    version: "1.200.0",
    publisher: "GitHub",
    repository: "https://github.com/github/copilot-vscode",
    tags: ["tool", "ai"],
    downloads: 20000000,
    rating: 4.6,
    updatedAt: "2026-05-15T00:00:00Z",
  },
  {
    id: "bradlc.vscode-tailwindcss",
    name: "tailwindcss",
    displayName: "Tailwind CSS IntelliSense",
    description: "Intelligent Tailwind CSS tooling for class name completion and linting.",
    version: "0.14.0",
    publisher: "Tailwind Labs",
    repository: "https://github.com/tailwindlabs/tailwindcss-intellisense",
    tags: ["language", "tool"],
    downloads: 25000000,
    rating: 4.7,
    updatedAt: "2026-04-28T00:00:00Z",
  },
  {
    id: "eamodio.gitlens",
    name: "gitlens",
    displayName: "GitLens",
    description: "Supercharge Git capabilities — blame annotations, code lens, and history exploration.",
    version: "16.0.0",
    publisher: "GitKraken",
    repository: "https://github.com/gitkraken/vscode-gitlens",
    tags: ["tool", "git"],
    downloads: 55000000,
    rating: 4.2,
    updatedAt: "2026-05-08T00:00:00Z",
  },
  {
    id: "ritwickdey.liveserver",
    name: "live-server",
    displayName: "Live Server",
    description: "Launch a local development server with live reload for static and dynamic pages.",
    version: "5.7.0",
    publisher: "Ritwick Dey",
    repository: "https://github.com/ritwickdey/vscode-live-server",
    tags: ["tool", "web"],
    downloads: 40000000,
    rating: 4.1,
    updatedAt: "2026-02-10T00:00:00Z",
  },
  {
    id: "ms-vscode.theme-material",
    name: "theme-material",
    displayName: "Material Theme",
    description: "The most popular theme for the editor — material design inspired icon and syntax themes.",
    version: "3.0.0",
    publisher: "Microsoft",
    repository: "https://github.com/material-theme/vscode-material-theme",
    tags: ["theme"],
    downloads: 10000000,
    rating: 4.4,
    updatedAt: "2026-04-20T00:00:00Z",
  },
  {
    id: "catppuccin.catppuccin-vsc",
    name: "catppuccin",
    displayName: "Catppuccin",
    description: "Soothing pastel theme for the editor — available in latte, frappe, macchiato, and mocha.",
    version: "3.16.0",
    publisher: "Catppuccin",
    repository: "https://github.com/catppuccin/vscode",
    tags: ["theme"],
    downloads: 5000000,
    rating: 4.9,
    updatedAt: "2026-05-12T00:00:00Z",
  },
  {
    id: "ms-vscode.js-debug",
    name: "js-debug",
    displayName: "JavaScript Debugger",
    description: "A built-in debugger for Node.js, browser, and React Native applications.",
    version: "1.95.0",
    publisher: "Microsoft",
    repository: "https://github.com/microsoft/vscode-js-debug",
    tags: ["tool", "debug"],
    downloads: 80000000,
    rating: 4.0,
    updatedAt: "2026-05-05T00:00:00Z",
  },
  {
    id: "astro-build.astro-vscode",
    name: "astro",
    displayName: "Astro",
    description: "Language support for Astro — syntax highlighting, IntelliSense, and tooling.",
    version: "2.4.0",
    publisher: "Astro",
    repository: "https://github.com/withastro/language-tools",
    tags: ["language"],
    downloads: 3000000,
    rating: 4.7,
    updatedAt: "2026-05-14T00:00:00Z",
  },
  {
    id: "svelte.svelte-vscode",
    name: "svelte",
    displayName: "Svelte",
    description: "Svelte language support with syntax highlighting, IntelliSense, and type checking.",
    version: "109.0.0",
    publisher: "Svelte",
    repository: "https://github.com/sveltejs/language-tools",
    tags: ["language"],
    downloads: 4000000,
    rating: 4.6,
    updatedAt: "2026-04-30T00:00:00Z",
  },
  {
    id: "bierner.markdown-mermaid",
    name: "markdown-mermaid",
    displayName: "Markdown Mermaid",
    description: "Adds Mermaid diagram and flowchart support to Markdown preview.",
    version: "1.27.0",
    publisher: "Matt Bierner",
    repository: "https://github.com/mjbvz/vscode-markdown-mermaid",
    tags: ["markdown", "tool"],
    downloads: 6000000,
    rating: 4.3,
    updatedAt: "2026-03-25T00:00:00Z",
  },
  {
    id: "streetsidesoftware.code-spell-checker",
    name: "code-spell-checker",
    displayName: "Code Spell Checker",
    description: "Spelling checker for source code — catches typos in identifiers, comments, and strings.",
    version: "4.0.0",
    publisher: "Street Side Software",
    repository: "https://github.com/streetsidesoftware/vscode-spell-check",
    tags: ["tool", "linter"],
    downloads: 35000000,
    rating: 4.1,
    updatedAt: "2026-04-22T00:00:00Z",
  },
];

function getCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function setCache(registry: MarketplaceRegistry): void {
  try {
    const entry: CacheEntry = { timestamp: Date.now(), registry };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* storage full — silently skip cache */
  }
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

function getTags(extensions: MarketplaceExtension[]): string[] {
  const tagSet = new Set<string>();
  for (const ext of extensions) {
    for (const tag of ext.tags) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function repoToExtension(repo: {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  topics: string[];
  updated_at: string;
}): MarketplaceExtension {
  return {
    id: repo.full_name,
    name: repo.name,
    displayName: repo.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: repo.description ?? "",
    version: "1.0.0",
    publisher: repo.full_name.split("/")[0],
    repository: repo.html_url,
    tags: repo.topics.filter((t) => t !== "quantum-extension"),
    downloads: repo.stargazers_count * 100,
    rating: Math.min(5, Math.max(1, Math.round((repo.stargazers_count / 100) * 10) / 10)),
    updatedAt: repo.updated_at,
  };
}

async function fetchFromGitHub(): Promise<MarketplaceExtension[]> {
  const res = await fetch(
    `${GITHUB_API}/search/repositories?q=topic:quantum-extension&sort=updated&per_page=50`,
    { headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "quantum-code-editor" } },
  );
  if (!res.ok) throw new Error(`GitHub API error (${res.status})`);
  const data = (await res.json()) as { items: unknown[] };
  return (data.items as Parameters<typeof repoToExtension>[0][]).map(repoToExtension);
}

function buildRegistry(apiExtensions: MarketplaceExtension[]): MarketplaceRegistry {
  const seen = new Set<string>();
  const merged: MarketplaceExtension[] = [];

  for (const ext of [...SEED_EXTENSIONS, ...apiExtensions]) {
    if (!seen.has(ext.id)) {
      seen.add(ext.id);
      merged.push(ext);
    }
  }

  return {
    schema: 1,
    updatedAt: new Date().toISOString(),
    extensions: merged,
  };
}

export async function fetchRegistry(): Promise<MarketplaceRegistry> {
  const cached = getCache();
  if (cached && isCacheValid(cached)) return cached.registry;

  let apiExtensions: MarketplaceExtension[] = [];
  try {
    apiExtensions = await fetchFromGitHub();
  } catch {
    if (cached) return cached.registry;
  }

  const registry = buildRegistry(apiExtensions);
  setCache(registry);
  return registry;
}

export async function getMarketplaceExtensions(
  query?: string,
  tags?: string[],
): Promise<MarketplaceExtension[]> {
  const registry = await fetchRegistry();
  let extensions = registry.extensions;

  if (tags && tags.length > 0) {
    extensions = extensions.filter((ext) => tags.some((t) => ext.tags.includes(t)));
  }

  if (query && query.trim()) {
    const q = query.trim();
    extensions = extensions.filter(
      (ext) =>
        fuzzyMatch(ext.name, q) ||
        fuzzyMatch(ext.displayName, q) ||
        fuzzyMatch(ext.description, q) ||
        fuzzyMatch(ext.tags.join(" "), q) ||
        fuzzyMatch(ext.publisher, q),
    );
  }

  return extensions;
}

export async function getExtensionById(id: string): Promise<MarketplaceExtension | null> {
  const registry = await fetchRegistry();
  return registry.extensions.find((ext) => ext.id === id) ?? null;
}

export function getAllTags(): string[] {
  const cached = getCache();
  if (cached) return getTags(cached.registry.extensions);
  return getTags(SEED_EXTENSIONS);
}

export function getCachedRegistry(): MarketplaceRegistry | null {
  const cached = getCache();
  return cached ? cached.registry : null;
}
