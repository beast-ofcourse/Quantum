import { invoke } from "@tauri-apps/api/core";
import type { Shell } from "@/types/terminal";

export async function detectShells(): Promise<Shell[]> {
  return invoke<Shell[]>("detect_shells");
}
