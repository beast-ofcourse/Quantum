import { create } from "zustand";
import type { ExtensionInfo } from "./types";

interface ExtensionStoreState {
  extensions: ExtensionInfo[];
  loading: boolean;
  setExtensions: (exts: ExtensionInfo[]) => void;
  setLoading: (val: boolean) => void;
  setExtensionActive: (id: string, active: boolean) => void;
  setExtensionError: (id: string, error: string) => void;
  removeExtension: (id: string) => void;
}

export const useExtensionStore = create<ExtensionStoreState>()((set) => ({
  extensions: [],
  loading: true,
  setExtensions: (extensions) => set({ extensions, loading: false }),
  setLoading: (loading) => set({ loading }),
  setExtensionActive: (id, isActive) =>
    set((s) => ({
      extensions: s.extensions.map((e) => (e.id === id ? { ...e, isActive, error: null } : e)),
    })),
  setExtensionError: (id, error) =>
    set((s) => ({
      extensions: s.extensions.map((e) => (e.id === id ? { ...e, error } : e)),
    })),
  removeExtension: (id) =>
    set((s) => ({
      extensions: s.extensions.filter((e) => e.id !== id),
    })),
}));
