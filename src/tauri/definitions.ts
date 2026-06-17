import { invoke } from "@tauri-apps/api/core";

export interface DefinitionLocation {
  path: string;
  line: number;
  column: number;
  name: string;
  kind: string;
}

export async function findDefinitions(
  root: string,
  symbol: string,
  path?: string,
): Promise<DefinitionLocation[]> {
  return invoke<DefinitionLocation[]>("find_definitions", {
    root,
    symbol,
    path: path ?? null,
  });
}
