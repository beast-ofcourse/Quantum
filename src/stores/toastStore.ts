import { create } from "zustand";

export type ToastKind = "info" | "warn" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  createdAt: number;
}

let nextId = 0;

interface ToastStore {
  toasts: Toast[];
  addToast: (kind: ToastKind, message: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (kind, message) => {
    const toast: Toast = { id: `toast_${nextId++}`, kind, message, createdAt: Date.now() };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== toast.id) }));
    }, 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
