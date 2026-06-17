import { useToastStore } from "@/stores/toastStore";
import { useModalStore } from "@/stores/modalStore";

export function createWindowAPI() {
  return {
    showInfo(msg: string) {
      useToastStore.getState().addToast("info", msg);
    },
    showWarn(msg: string) {
      useToastStore.getState().addToast("warn", msg);
    },
    showError(msg: string) {
      useToastStore.getState().addToast("error", msg);
    },
    async showInput(prompt: string): Promise<string | null> {
      return useModalStore.getState().openInput(prompt);
    },
    async showQuickPick(items: string[], placeHolder?: string): Promise<string | null> {
      return useModalStore.getState().openQuickPick(items, placeHolder);
    },
  };
}

export type WindowAPI = ReturnType<typeof createWindowAPI>;
