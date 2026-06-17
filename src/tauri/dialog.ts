import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";

export async function pickFolder(): Promise<string | null> {
  const result = await openDialog({
    directory: true,
    multiple: false,
    title: "Open Folder",
  });
  if (Array.isArray(result)) return result[0] ?? null;
  return result ?? null;
}

export async function pickFile(options?: {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
}): Promise<string | string[] | null> {
  return openDialog({
    directory: false,
    multiple: options?.multiple ?? false,
    title: options?.title,
    filters: options?.filters,
  });
}

export const COMMON_FILE_FILTERS: { name: string; extensions: string[] }[] = [
  {
    name: "Code",
    extensions: [
      "js",
      "mjs",
      "cjs",
      "jsx",
      "ts",
      "tsx",
      "mts",
      "cts",
      "html",
      "htm",
      "css",
      "scss",
      "sass",
      "less",
      "json",
      "jsonc",
      "cs",
      "py",
      "rs",
      "go",
      "java",
      "c",
      "h",
      "cpp",
      "cc",
      "cxx",
      "hpp",
      "rb",
      "php",
      "sh",
      "bash",
      "zsh",
      "yaml",
      "yml",
      "toml",
      "xml",
    ],
  },
  {
    name: "Text",
    extensions: ["md", "mdx", "txt", "log", "env"],
  },
  { name: "All Files", extensions: ["*"] },
];

export async function pickFiles(options?: {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string[] | null> {
  const result = await openDialog({
    directory: false,
    multiple: true,
    title: options?.title ?? "Open File",
    filters: options?.filters ?? COMMON_FILE_FILTERS,
  });
  if (result === null) return null;
  return Array.isArray(result) ? result : [result];
}

export interface ConfirmOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
  okLabel?: string;
  cancelLabel?: string;
}

export async function confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return ask(message, {
    title: options.title,
    kind: options.kind,
    okLabel: options.okLabel,
    cancelLabel: options.cancelLabel,
  });
}
