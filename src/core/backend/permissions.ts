// Tauri capability permissions required for the execution engine
// Add to src-tauri/capabilities/ or capabilities.json

export const REQUIRED_PERMISSIONS = [
  "shell:allow-execute",
  "shell:allow-spawn",
  "shell:allow-kill",
  "shell:allow-stdin-write",
] as const;

export const REQUIRED_CAPABILITIES = [
  {
    identifier: "execution-engine",
    description: "Run and manage child processes for code execution",
    windows: ["main"],
    permissions: REQUIRED_PERMISSIONS,
  },
] as const;
