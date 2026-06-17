import { create } from "zustand";

export interface ExtensionStatusItem {
  id: string;
  extensionId: string;
  text: string;
  alignment: "left" | "right";
  priority: number;
  tooltip?: string;
  command?: string;
  visible: boolean;
}

interface ExtensionStatusBarStore {
  items: ExtensionStatusItem[];
  addItem: (item: ExtensionStatusItem) => void;
  removeItem: (id: string) => void;
  updateItemText: (id: string, text: string) => void;
  setItemVisible: (id: string, visible: boolean) => void;
}

export const useExtensionStatusBarStore = create<ExtensionStatusBarStore>((set) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  updateItemText: (id, text) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, text } : i)),
    })),
  setItemVisible: (id, visible) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, visible } : i)),
    })),
}));
