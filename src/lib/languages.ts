const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  env: "ini",
  sql: "sql",
  dockerfile: "dockerfile",
  vue: "html",
  svelte: "html",
};

const FILENAME_MAP: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  ".gitignore": "ini",
  ".env": "ini",
};

export function getLanguageFromPath(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  const fileName = path.split(sep).pop() ?? path;
  if (FILENAME_MAP[fileName]) return FILENAME_MAP[fileName];

  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return "plaintext";
  const ext = fileName.slice(dot + 1).toLowerCase();
  return EXTENSION_MAP[ext] ?? "plaintext";
}

export function getFileName(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  return path.split(sep).pop() ?? path;
}
