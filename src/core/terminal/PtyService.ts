import type { Language, ProcessStatus } from "@/core/execution/types";

export async function tauriSpawn(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{
  process: { id: string; language: Language; file: string; command: string; args: string[]; cwd: string; status: ProcessStatus; startedAt: number; exitCode: number | null };
  kill: () => Promise<void>;
  onStdout: (cb: (data: string) => void) => void;
  onStderr: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
}> {
  const { Command } = await import("@tauri-apps/plugin-shell");

  const tauriCmd = Command.create(cmd, args, { cwd });

  const stdoutListeners: Array<(data: string) => void> = [];
  const stderrListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(code: number | null) => void> = [];

  tauriCmd.stdout.on("data", (line: string) => {
    for (const l of stdoutListeners) l(line);
  });

  tauriCmd.stderr.on("data", (line: string) => {
    for (const l of stderrListeners) l(line);
  });

  const process = await tauriCmd.spawn();

  tauriCmd.on("close", (data: { code: number | null; signal: number | null }) => {
    for (const l of exitListeners) l(data.code);
  });

  return {
    process: {
      id: "",
      language: "unknown" as Language,
      file: "",
      command: cmd,
      args,
      cwd,
      status: "running" as ProcessStatus,
      startedAt: Date.now(),
      exitCode: null,
    },
    kill: async () => {
      try { await process.kill(); } catch { /* ignore */ }
    },
    onStdout: (cb) => { stdoutListeners.push(cb); },
    onStderr: (cb) => { stderrListeners.push(cb); },
    onExit: (cb) => { exitListeners.push(cb); },
  };
}
