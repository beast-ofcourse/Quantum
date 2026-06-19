import { create } from "zustand";
import type {
  AgentInfo,
  AgentManifest,
  AgentStatus,
  SwarmState,
  TaskStatus,
  TimelineEvent,
} from "@/types/swarm";

interface SwarmStore {
  state: SwarmState | null;
  timeline: TimelineEvent[];
  isLoading: boolean;
  error: string | null;

  setState: (state: SwarmState) => void;
  updateAgentManifest: (agentId: string, manifest: AgentManifest) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  markManifestError: (agentId: string) => void;
  appendTimelineEvent: (event: TimelineEvent) => void;
  updateMergeQueueItem: (agentId: string, status: string) => void;
}

export const useSwarmStore = create<SwarmStore>()((set) => ({
  state: null,
  timeline: [],
  isLoading: false,
  error: null,

  setState: (state) => set({ state, isLoading: false, error: null }),

  updateAgentManifest: (agentId, manifest) =>
    set((s) => {
      if (!s.state?.agents[agentId]) return s;
      const agent = s.state.agents[agentId];
      const updated: AgentInfo = {
        ...agent,
        manifest,
      };
      if (manifest.filesModified) {
        const locks = { ...s.state.fileLocks };
        for (const file of manifest.filesModified) {
          if (!locks[file]) {
            locks[file] = {
              lockedBy: agentId,
              lockedAt: new Date().toISOString(),
            };
          }
        }
        return {
          state: {
            ...s.state,
            agents: { ...s.state.agents, [agentId]: updated },
            fileLocks: locks,
          },
        };
      }
      return {
        state: {
          ...s.state,
          agents: { ...s.state.agents, [agentId]: updated },
        },
      };
    }),

  updateAgentStatus: (agentId, status) =>
    set((s) => {
      if (!s.state?.agents[agentId]) return s;
      return {
        state: {
          ...s.state,
          agents: {
            ...s.state.agents,
            [agentId]: { ...s.state.agents[agentId], status },
          },
        },
      };
    }),

  updateTaskStatus: (taskId, status) =>
    set((s) => {
      if (!s.state) return s;
      return {
        state: {
          ...s.state,
          tasks: s.state.tasks.map((t) =>
            t.id === taskId ? { ...t, status } : t,
          ),
        },
      };
    }),

  markManifestError: (agentId) =>
    set((s) => {
      if (!s.state?.agents[agentId]) return s;
      return {
        state: {
          ...s.state,
          agents: {
            ...s.state.agents,
            [agentId]: {
              ...s.state.agents[agentId],
              manifest: {
                ...s.state.agents[agentId].manifest,
                _parseError: true,
              },
            },
          },
        },
      };
    }),

  appendTimelineEvent: (event) =>
    set((s) => ({
      timeline: [...s.timeline, event],
    })),

  updateMergeQueueItem: (agentId, status) =>
    set((s) => {
      if (!s.state) return s;
      return {
        state: {
          ...s.state,
          mergeQueue: s.state.mergeQueue.map((item) =>
            item.agentId === agentId ? { ...item, status } : item,
          ),
        },
      };
    }),
}));
