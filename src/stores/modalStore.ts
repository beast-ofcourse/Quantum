import { create } from "zustand";

export interface InputModal {
  kind: "input";
  prompt: string;
  resolve: (val: string | null) => void;
}

export interface QuickPickModal {
  kind: "quickpick";
  items: string[];
  placeHolder?: string;
  resolve: (val: string | null) => void;
}

export type ActiveModal = InputModal | QuickPickModal;

interface ModalStore {
  modal: ActiveModal | null;
  openInput: (prompt: string) => Promise<string | null>;
  openQuickPick: (items: string[], placeHolder?: string) => Promise<string | null>;
  closeModal: () => void;
  resolveModal: (value: string | null) => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  modal: null,
  openInput: (prompt) => {
    return new Promise<string | null>((resolve) => {
      set({ modal: { kind: "input", prompt, resolve } });
    });
  },
  openQuickPick: (items, placeHolder) => {
    return new Promise<string | null>((resolve) => {
      set({ modal: { kind: "quickpick", items, placeHolder, resolve } });
    });
  },
  closeModal: () => {
    const modal = useModalStore.getState().modal;
    if (modal) {
      modal.resolve(null);
    }
    set({ modal: null });
  },
  resolveModal: (value) => {
    const modal = useModalStore.getState().modal;
    if (modal) {
      modal.resolve(value);
    }
    set({ modal: null });
  },
}));
