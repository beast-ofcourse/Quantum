import { useEffect } from "react";
import { useGitStore } from "@/stores/gitStore";
import { useUiStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";

export function useGitHotkeys() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      if (mod && shift && e.key.toLowerCase() === "g") {
        e.preventDefault();
        const ui = useUiStore.getState();
        if (ui.zones.left.isVisible && ui.zones.left.activePanelId === "git") {
          ui.toggleZone("left");
        } else {
          ui.setActivePanelInZone("left", "git");
          if (!ui.zones.left.isVisible) ui.setZoneVisibility("left", true);
        }
        return;
      }

      if (mod && alt && e.key.toLowerCase() === "c") {
        e.preventDefault();
        const gitStore = useGitStore.getState();
        if (gitStore.status && gitStore.status.staged.length > 0) {
          const message = prompt("Commit message:");
          if (message) {
            await gitStore.commit(message);
          }
        }
        return;
      }

      if (mod && alt && e.key.toLowerCase() === "p") {
        e.preventDefault();
        const gitStore = useGitStore.getState();
        if (gitStore.currentBranch) {
          await gitStore.push();
        }
        return;
      }

      if (mod && shift && e.key.toLowerCase() === "l") {
        e.preventDefault();
        const gitStore = useGitStore.getState();
        await gitStore.getLog({ maxCount: 50 });
        return;
      }

      if (mod && shift && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const gitStore = useGitStore.getState();
        const editorState = useEditorStore.getState();
        const activeTab = editorState.getActiveTab();
        if (activeTab) {
          await gitStore.getBlame(activeTab.path);
        }
        return;
      }

      if (mod && alt && e.key.toLowerCase() === "d" && !shift) {
        e.preventDefault();
        const gitStore = useGitStore.getState();
        const editorState = useEditorStore.getState();
        const activeTab = editorState.getActiveTab();
        if (activeTab && gitStore.isRepo) {
          await gitStore.getDiff(activeTab.path);
        }
        return;
      }

      if (mod || shift || alt) return;
      const keyNum = parseInt(e.key);
      if (keyNum >= 1 && keyNum <= 5) {
        const store = useGitStore.getState();
        if (store.rebaseStep === "editing" && store.rebaseTodos.length > 0) {
          e.preventDefault();
          const actions = ["pick", "squash", "fixup", "reword", "drop"] as const;
          const action = actions[keyNum - 1];
          const activeEl = document.activeElement;
          let targetIndex = -1;
          if (activeEl) {
            const todoEl = activeEl.closest("[data-todo-index]");
            if (todoEl) {
              targetIndex = parseInt(todoEl.getAttribute("data-todo-index") ?? "-1");
            }
          }
          const updated = store.rebaseTodos.map((t) => {
            if (targetIndex >= 0 && t.index !== targetIndex) return t;
            if (t.index === 0 && (action === "squash" || action === "fixup")) return t;
            return { ...t, action };
          });
          useGitStore.setState({ rebaseTodos: updated });
        }
      }

    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
