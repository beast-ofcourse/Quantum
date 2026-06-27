import type { Language } from "./types";

interface RuntimeInfo {
  command: string;
  args: string[];
}

const RUNTIME_MAP: Record<Language, RuntimeInfo> = {
  javascript: { command: "node", args: [] },
  typescript: { command: "npx", args: ["tsx"] },
  python: { command: "python", args: [] },
  c: { command: "gcc", args: [] },
  cpp: { command: "g++", args: [] },
  rust: { command: "cargo", args: ["run"] },
  go: { command: "go", args: ["run"] },
  java: { command: "java", args: [] },
  unknown: { command: "", args: [] },
};

export function resolveRuntime(language: Language): RuntimeInfo {
  return RUNTIME_MAP[language] ?? RUNTIME_MAP.unknown;
}
