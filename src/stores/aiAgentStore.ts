import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AiAgent } from "@/types/aiAgent";

const DEFAULT_AGENTS: AiAgent[] = [
  { id: "opencode", name: "OpenCode", command: "opencode", description: "AI coding agent in your terminal" },
  { id: "claude", name: "Claude Code", command: "claude", description: "Anthropic's AI coding assistant" },
  { id: "pi", name: "Pi Agent", command: "pi", description: "Pi AI agent" },
  { id: "agy", name: "Antigravity CLI", command: "agy", description: "Antigravity terminal agent" },
  { id: "kilocode", name: "KiloCode", command: "kilocode", description: "Lightweight AI coding agent" },
  { id: "aider", name: "Aider", command: "aider", description: "AI pair programming in terminal" },
  { id: "cursor", name: "Cursor CLI", command: "cursor", description: "Cursor editor CLI" },
];

interface AiAgentState {
  agents: AiAgent[];
  addAgent: (agent: AiAgent) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<AiAgent>) => void;
  resetDefaults: () => void;
}

export const useAiAgentStore = create<AiAgentState>()(
  persist(
    (set) => ({
      agents: [...DEFAULT_AGENTS],

      addAgent: (agent) =>
        set((s) => ({
          agents: s.agents.some((a) => a.id === agent.id)
            ? s.agents
            : [...s.agents, agent],
        })),

      removeAgent: (id) =>
        set((s) => ({
          agents: s.agents.filter((a) => a.id !== id),
        })),

      updateAgent: (id, updates) =>
        set((s) => ({
          agents: s.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),

      resetDefaults: () => set({ agents: [...DEFAULT_AGENTS] }),
    }),
    {
      name: "code-editor:ai-agents",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
