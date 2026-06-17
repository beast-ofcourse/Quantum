import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getDefaultCombo } from "@/lib/defaultKeybindings";

interface KeybindingState {
  overrides: Record<string, string>;
  setBinding: (commandId: string, combo: string) => void;
  resetBinding: (commandId: string) => void;
  resetAll: () => void;
}

export const useKeybindingStore = create<KeybindingState>()(
  persist(
    (set) => ({
      overrides: {},

      setBinding: (commandId, combo) =>
        set((s) => ({
          overrides: { ...s.overrides, [commandId]: combo },
        })),

      resetBinding: (commandId) =>
        set((s) => {
          const { [commandId]: _, ...rest } = s.overrides;
          void _;
          return { overrides: rest };
        }),

      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: "code-editor:keybindings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function getEffectiveCombo(commandId: string): string {
  const s = useKeybindingStore.getState();
  return s.overrides[commandId] ?? getDefaultCombo(commandId);
}
