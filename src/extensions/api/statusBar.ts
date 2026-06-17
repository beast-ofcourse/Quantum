import type { StatusBarItem } from "../types";
import { useExtensionStatusBarStore } from "@/stores/extensionStatusBarStore";

let nextId = 0;
function genId() {
  return `_ext_sb_${nextId++}`;
}

export function createStatusBarAPI(extensionId: string) {
  return {
    create(opts: {
      text: string;
      alignment?: "left" | "right";
      priority?: number;
      tooltip?: string;
      command?: string;
    }): StatusBarItem {
      const id = genId();
      const store = useExtensionStatusBarStore.getState();

      store.addItem({
        id,
        extensionId,
        text: opts.text,
        alignment: opts.alignment ?? "left",
        priority: opts.priority ?? 0,
        tooltip: opts.tooltip,
        command: opts.command,
        visible: true,
      });

      let hidden = false;
      return {
        dispose() {
          useExtensionStatusBarStore.getState().removeItem(id);
        },
        get text() {
          const item = useExtensionStatusBarStore.getState().items.find((i) => i.id === id);
          return item?.text ?? "";
        },
        setText(text: string) {
          useExtensionStatusBarStore.getState().updateItemText(id, text);
        },
        show() {
          if (hidden) {
            hidden = false;
            useExtensionStatusBarStore.getState().setItemVisible(id, true);
          }
        },
        hide() {
          if (!hidden) {
            hidden = true;
            useExtensionStatusBarStore.getState().setItemVisible(id, false);
          }
        },
      };
    },
  };
}

export type StatusBarAPI = ReturnType<typeof createStatusBarAPI>;
