import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PtyExitPayload } from "@/types/terminal";

export interface SpawnPtyArgs {
  sessionId: string;
  shellPath: string;
  shellArgs: string[];
  cwd: string;
  cols: number;
  rows: number;
}

export async function spawnPty(args: SpawnPtyArgs): Promise<number> {
  return invoke<number>("spawn_pty", { ...args });
}

export async function writePty(sessionId: string, data: string): Promise<void> {
  await invoke("write_pty", { sessionId, data });
}

export async function resizePty(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  await invoke("resize_pty", { sessionId, cols, rows });
}

export async function killPty(sessionId: string): Promise<void> {
  await invoke("kill_pty", { sessionId });
}

export async function onPtyStdout(
  sessionId: string,
  handler: (data: string) => void,
): Promise<UnlistenFn> {
  return listen<string>(`terminal:stdout:${sessionId}`, (event) =>
    handler(event.payload),
  );
}

export async function onPtyExit(
  sessionId: string,
  handler: (payload: PtyExitPayload) => void,
): Promise<UnlistenFn> {
  return listen<PtyExitPayload>(`terminal:exit:${sessionId}`, (event) =>
    handler(event.payload),
  );
}

export async function onSwarmTimelineEvent(
  handler: (event: import("@/types/swarm").TimelineEvent) => void,
): Promise<UnlistenFn> {
  return listen<import("@/types/swarm").TimelineEvent>(
    "swarm:timeline-event",
    (event) => handler(event.payload),
  );
}
