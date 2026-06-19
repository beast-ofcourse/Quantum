import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  detectShells,
  killPty,
  resizePty,
  spawnPty,
  writePty,
} from "@/tauri";
import { resolveHome } from "@/tauri/fs";
import type { PtyExitPayload, Shell, TerminalSession } from "@/types/terminal";
import { useToastStore } from "@/stores/toastStore";
import { coordinationService } from "@/lib/swarm/coordinationService";

export const MAX_TERMINAL_SESSIONS = 8;
export const TERMINAL_BUFFER_LIMIT = 5000; // max lines in terminal scrollback

export interface SessionOutputBuffer {
  data: string[];
  listeners: Set<(data: string) => void>;
  unlistenStdout: UnlistenFn | null;
  unlistenExit: UnlistenFn | null;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  defaultShellId: string | null;
  shells: Shell[];
  shellsLoaded: boolean;
  homeDir: string | null;
  outputBuffers: Record<string, SessionOutputBuffer>;

  loadShells: () => Promise<void>;
  createSession: (shellId?: string, cwd?: string, agentId?: string) => Promise<string | null>;
  closeSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  setDefaultShell: (shellId: string) => void;
  writeStdin: (id: string, data: string) => Promise<void>;
  resize: (id: string, cols: number, rows: number) => Promise<void>;
  getActiveSession: () => TerminalSession | null;
  attachToSession: (
    id: string,
    onData: (data: string) => void,
  ) => () => void;
}

function uid(): string {
  return crypto.randomUUID();
}

function nextTitle(sessions: TerminalSession[]): string {
  const nums = sessions
    .map((s) => Number(s.title?.match(/^shell-(\d+)$/)?.[1] ?? 0))
    .filter((n) => n > 0);
  const n = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `shell-${n}`;
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      defaultShellId: null,
      shells: [],
      shellsLoaded: false,
      homeDir: null,
      outputBuffers: {},

      loadShells: async () => {
        if (get().shellsLoaded) return;
        try {
          const [shells, home] = await Promise.all([
            detectShells(),
            resolveHome(),
          ]);
          const persistedDefault = get().defaultShellId;
          const validDefault = shells.some((s) => s.id === persistedDefault)
            ? persistedDefault
            : (shells[0]?.id ?? null);
          const withDefaults = shells.map((s) => ({
            ...s,
            isDefault: s.id === validDefault,
          }));
          set({
            shells: withDefaults,
            shellsLoaded: true,
            homeDir: home,
            defaultShellId: validDefault,
          });
        } catch (err) {
          console.error("[terminalStore] loadShells failed:", err);
        }
      },

      createSession: async (shellId, cwd, agentId) => {
        const state = get();
        if (state.sessions.length >= MAX_TERMINAL_SESSIONS) {
          useToastStore.getState().addToast("warn", `Maximum terminals (${MAX_TERMINAL_SESSIONS}) reached`);
          return null;
        }
        if (!state.shellsLoaded) {
          await state.loadShells();
        }
        const { shells, defaultShellId, homeDir, sessions } = state;
        const shell =
          shells.find((s) => s.id === (shellId ?? defaultShellId)) ??
          shells[0];
        if (!shell) {
          console.error("[terminalStore] createSession: no shell available");
          return null;
        }
        if (!homeDir) {
          console.error("[terminalStore] createSession: homeDir not resolved");
          return null;
        }
        const id = uid();
        const buffer: SessionOutputBuffer = {
          data: [],
          listeners: new Set(),
          unlistenStdout: null,
          unlistenExit: null,
        };

        let unlistenStdout: UnlistenFn | null = null;
        let unlistenExit: UnlistenFn | null = null;
        try {
          unlistenStdout = await listen<string>(
            `terminal:stdout:${id}`,
            (event) => {
              buffer.data.push(event.payload);
              if (buffer.data.length > TERMINAL_BUFFER_LIMIT) {
                buffer.data.splice(0, buffer.data.length - TERMINAL_BUFFER_LIMIT);
              }
              for (const l of buffer.listeners) l(event.payload);
            },
          );
          unlistenExit = await listen<PtyExitPayload>(
            `terminal:exit:${id}`,
            (event) => {
              const code = event.payload.code;
              const signal = event.payload.signal;
              const exitCode = code ?? signal ?? -1;
              if (code !== null && code !== 0) {
                console.warn(
                  `[terminalStore] session ${id} exited with code ${code}${signal !== null ? `, signal ${signal}` : ""}`,
                );
              } else if (signal !== null) {
                console.warn(
                  `[terminalStore] session ${id} terminated by signal ${signal}`,
                );
              }
              if (agentId) {
                void coordinationService.onAgentExit(agentId, exitCode);
              }
              void get().closeSession(id);
            },
          );
        } catch (err) {
          unlistenStdout?.();
          unlistenExit?.();
          console.error("[terminalStore] failed to subscribe to PTY events:", err);
          return null;
        }
        buffer.unlistenStdout = unlistenStdout;
        buffer.unlistenExit = unlistenExit;

        let pid: number;
        try {
          pid = await spawnPty({
            sessionId: id,
            shellPath: shell.path,
            shellArgs: shell.args,
            cwd: cwd ?? homeDir,
            cols: 80,
            rows: 24,
          });
        } catch (err) {
          buffer.unlistenStdout?.();
          buffer.unlistenExit?.();
          console.error("[terminalStore] spawnPty failed:", err);
          return null;
        }
        const session: TerminalSession = {
          id,
          shellId: shell.id,
          shellLabel: shell.label,
          pid,
          cwd: cwd ?? homeDir,
          createdAt: Date.now(),
          title: nextTitle(sessions),
          agentId,
        };
        set((s) => ({
          sessions: [...s.sessions, session],
          activeSessionId: id,
          outputBuffers: { ...s.outputBuffers, [id]: buffer },
        }));
        return id;
      },

      closeSession: async (id) => {
        const buffer = get().outputBuffers[id];
        if (buffer) {
          buffer.unlistenStdout?.();
          buffer.unlistenExit?.();
          buffer.listeners.clear();
        }
        try {
          await killPty(id);
        } catch (err) {
          console.error("[terminalStore] killPty failed:", err);
        }
        set((s) => {
          const idx = s.sessions.findIndex((x) => x.id === id);
          const next = s.sessions.filter((x) => x.id !== id);
          let active = s.activeSessionId;
          if (active === id) {
            if (next.length === 0) active = null;
            else active = next[Math.min(idx, next.length - 1)]?.id ?? null;
          }
          const { [id]: _, ...rest } = s.outputBuffers;
          void _;
          return {
            sessions: next,
            activeSessionId: active,
            outputBuffers: rest,
          };
        });
      },

      setActiveSession: (id) => {
        if (get().sessions.some((s) => s.id === id)) {
          set({ activeSessionId: id });
        }
      },

      renameSession: (id, title) => {
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
        }));
      },

      setDefaultShell: (shellId) => {
        const { shells } = get();
        if (!shells.some((s) => s.id === shellId)) return;
        set({
          defaultShellId: shellId,
          shells: shells.map((s) => ({
            ...s,
            isDefault: s.id === shellId,
          })),
        });
      },

      writeStdin: async (id, data) => {
        try {
          await writePty(id, data);
        } catch (err) {
          console.error("[terminalStore] writePty failed:", err);
        }
      },

      resize: async (id, cols, rows) => {
        if (cols < 1 || rows < 1) return;
        try {
          await resizePty(id, cols, rows);
        } catch (err) {
          console.error("[terminalStore] resizePty failed:", err);
        }
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId) ?? null;
      },

      attachToSession: (id, onData) => {
        const buffer = get().outputBuffers[id];
        if (!buffer) return () => {};
        const slice = buffer.data.length > TERMINAL_BUFFER_LIMIT
          ? buffer.data.slice(buffer.data.length - TERMINAL_BUFFER_LIMIT)
          : buffer.data;
        for (const data of slice) onData(data);
        buffer.data = [];
        buffer.listeners.add(onData);
        return () => {
          buffer.listeners.delete(onData);
        };
      },
    }),
    {
      name: "code-editor:terminal",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        defaultShellId: state.defaultShellId,
      }),
    },
  ),
);
