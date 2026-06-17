import { invoke } from "@tauri-apps/api/core";

export interface SearchOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  maxResults?: number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  lineContent: string;
  matchLength: number;
}

export async function searchInFiles(
  root: string,
  query: string,
  options?: SearchOptions,
): Promise<SearchMatch[]> {
  return invoke<SearchMatch[]>("search_in_files", { root, query, options: options ?? null });
}

export async function replaceInFiles(
  root: string,
  query: string,
  replaceWith: string,
  options?: SearchOptions,
): Promise<number> {
  return invoke<number>("replace_in_files", {
    root,
    query,
    replaceWith,
    options: options ?? null,
  });
}
