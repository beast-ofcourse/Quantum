import { create } from "zustand";
import type { DebugSession, Breakpoint, StackFrame, Scope, Variable, DebugConfiguration, WatchExpression } from "@/types/debug";

// Helper to lazily get dapManager — breaks circular dependency between debugStore and dap/manager
async function getDapManager() {
  return (await import("@/lib/dap/manager")).dapManager;
}

interface DebugStoreState {
  sessions: DebugSession[];
  activeSessionId: string | null;
  breakpoints: Map<string, Breakpoint[]>;
  variables: Record<number, Variable[]>;
  callStack: StackFrame[];
  scopes: Scope[];
  exceptionBreakpoints: string[];
  watchExpressions: WatchExpression[];
  availableExceptionFilters: string[];
  evaluating: boolean;

  addSession: (session: DebugSession) => void;
  updateState: (sessionId: string, partial: Partial<DebugSession>) => void;
  removeSession: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;

  setBreakpoints: (path: string, breakpoints: Breakpoint[]) => void;
  addBreakpoint: (path: string, line: number) => void;
  removeBreakpoint: (path: string, line: number) => void;
  toggleBreakpoint: (path: string, line: number) => void;
  updateBreakpoint: (path: string, line: number, partial: Partial<Breakpoint>) => void;
  clearAllBreakpoints: () => void;

  startSession: (config: DebugConfiguration) => Promise<string>;
  stopSession: (id: string) => Promise<void>;

  setCallStack: (frames: StackFrame[]) => void;
  setScopes: (scopes: Scope[]) => void;
  setVariables: (ref: number, vars: Variable[]) => void;
  loadVariables: (variablesReference: number) => Promise<void>;
  clearVariables: () => void;

  setExceptionBreakpoints: (filters: string[]) => void;
  setAvailableExceptionFilters: (filters: string[]) => void;

  addWatch: (expression: string) => void;
  removeWatch: (id: string) => void;
  updateWatch: (id: string, value: string, type?: string, variablesReference?: number, error?: string) => void;
  clearWatches: () => void;

  continue: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  pause: () => Promise<void>;

  evaluateInRepl: (expression: string) => Promise<{ result: string; type?: string } | null>;
}

export const useDebugStore = create<DebugStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  breakpoints: new Map(),
  variables: {},
  callStack: [],
  scopes: [],
  exceptionBreakpoints: [],
  watchExpressions: [],
  availableExceptionFilters: [],
  evaluating: false,

  addSession: (session) =>
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: session.id,
    })),

  updateState: (sessionId, partial) =>
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === sessionId ? { ...ses, ...partial } : ses
      ),
    })),

  removeSession: (sessionId) =>
    set((s) => ({
      sessions: s.sessions.filter((ses) => ses.id !== sessionId),
      activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
    })),

  clearSession: (sessionId) => {
    const s = get();
    const remaining = s.sessions.filter((ses) => ses.id !== sessionId);
    const activeChanged = s.activeSessionId === sessionId;
    set({
      sessions: remaining,
      activeSessionId: activeChanged ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null) : s.activeSessionId,
      callStack: activeChanged ? [] : s.callStack,
      scopes: activeChanged ? [] : s.scopes,
      variables: activeChanged ? {} : s.variables,
    });
  },

  setActiveSession: (sessionId) => {
    const s = get();
    if (sessionId && !s.sessions.some((ses) => ses.id === sessionId)) return;
    set({
      activeSessionId: sessionId,
      callStack: [],
      scopes: [],
      variables: {},
    });
    // Note: auto-continue on session switch is handled by the debug manager externally
  },

  setBreakpoints: (path, breakpoints) =>
    set((s) => {
      const next = new Map(s.breakpoints);
      next.set(path, breakpoints);
      return { breakpoints: next };
    }),

  addBreakpoint: (path, line) =>
    set((s) => {
      const existing = s.breakpoints.get(path) ?? [];
      if (existing.some((bp) => bp.line === line)) return s;
      const maxId = Math.max(0, ...Array.from(s.breakpoints.values()).flat().map((bp) => bp.id));
      const next = new Map(s.breakpoints);
      next.set(path, [...existing, { id: maxId + 1, line, verified: false, enabled: true }]);
      return { breakpoints: next };
    }),

  removeBreakpoint: (path, line) =>
    set((s) => {
      const existing = s.breakpoints.get(path);
      if (!existing) return s;
      const next = new Map(s.breakpoints);
      const filtered = existing.filter((bp) => bp.line !== line);
      if (filtered.length === 0) {
        next.delete(path);
      } else {
        next.set(path, filtered);
      }
      return { breakpoints: next };
    }),

  toggleBreakpoint: (path, line) =>
    set((s) => {
      const existing = s.breakpoints.get(path);
      if (!existing) return s;
      const next = new Map(s.breakpoints);
      next.set(path, existing.map((bp) =>
        bp.line === line ? { ...bp, enabled: !bp.enabled } : bp,
      ));
      return { breakpoints: next };
    }),

  updateBreakpoint: (path, line, partial) =>
    set((s) => {
      const existing = s.breakpoints.get(path);
      if (!existing) return s;
      const next = new Map(s.breakpoints);
      next.set(path, existing.map((bp) =>
        bp.line === line ? { ...bp, ...partial } : bp,
      ));
      return { breakpoints: next };
    }),

  clearAllBreakpoints: () => set({ breakpoints: new Map() }),

  startSession: async (config) => {
    const mgr = await getDapManager();
    const id = await mgr.startDebugging(config);
    return id;
  },

  stopSession: async (id) => {
    const mgr = await getDapManager();
    await mgr.stopDebugging(id);
  },

  setCallStack: (frames) => set({ callStack: frames }),
  setScopes: (scopes) => set({ scopes }),

  setVariables: (ref, vars) =>
    set((s) => ({
      variables: { ...s.variables, [ref]: vars },
    })),

  loadVariables: async (variablesReference) => {
    const mgr = await getDapManager();
    const inst = mgr.getActiveInstance();
    if (inst) {
      await inst.loadVariables(variablesReference);
    }
  },

  clearVariables: () => set({ variables: {} }),

  setExceptionBreakpoints: (filters) => set({ exceptionBreakpoints: filters }),
  setAvailableExceptionFilters: (filters) => set({ availableExceptionFilters: filters }),

  addWatch: (expression) =>
    set((s) => ({
      watchExpressions: [
        ...s.watchExpressions,
        { id: `watch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, expression, variablesReference: 0 },
      ],
    })),

  removeWatch: (id) =>
    set((s) => ({
      watchExpressions: s.watchExpressions.filter((w) => w.id !== id),
    })),

  updateWatch: (id, value, type, variablesReference, error) =>
    set((s) => ({
      watchExpressions: s.watchExpressions.map((w) =>
        w.id === id ? { ...w, value, type, variablesReference: variablesReference ?? w.variablesReference, error } : w,
      ),
    })),

  clearWatches: () => set({ watchExpressions: [] }),

  continue: async () => {
    const mgr = await getDapManager();
    const inst = mgr.getActiveInstance();
    if (inst) await inst.continue_();
  },

  stepOver: async () => {
    const mgr = await getDapManager();
    const inst = mgr.getActiveInstance();
    if (inst) await inst.stepOver();
  },

  stepInto: async () => {
    const mgr = await getDapManager();
    const inst = mgr.getActiveInstance();
    if (inst) await inst.stepInto();
  },

  stepOut: async () => {
    const mgr = await getDapManager();
    const inst = mgr.getActiveInstance();
    if (inst) await inst.stepOut();
  },

  pause: async () => {
    const mgr = await getDapManager();
    const inst = mgr.getActiveInstance();
    if (inst) await inst.pause();
  },

  evaluateInRepl: async (expression) => {
    const mgr = await getDapManager();
    const inst = mgr.getActiveInstance();
    if (!inst) return null;
    try {
      set({ evaluating: true });
      const store = get();
      const callStack = store.callStack;
      const frameId = callStack.length > 0 ? callStack[0].id : undefined;
      const result = await inst.evaluate(expression, frameId);
      return { result: result.result, type: result.type };
    } finally {
      set({ evaluating: false });
    }
  },
}));
