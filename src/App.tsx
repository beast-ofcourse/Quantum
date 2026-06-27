import { useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShellLayout } from "@/components/layout/ShellLayout";
import { StandalonePanelShell } from "@/components/layout/StandalonePanelShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CloseConfirmDialog } from "@/components/CloseConfirmDialog";
import { useFileDrop } from "@/hooks/useFileDrop";
import { useGitHotkeys } from "@/hooks/useGitHotkeys";
import { useTerminalStore } from "@/stores/terminalStore";
import { useFileStore } from "@/stores/fileStore";
import { useGitStore } from "@/stores/gitStore";
import { addRecentFolder } from "@/lib/session";
import { openTerminalAtPath } from "@/lib/terminal-helpers";
import { initExtensionHost } from "@/extensions/host";
import { emitAppClosing } from "@/lib/multiWindowService";
import { initCSSInjector } from "@/lib/cssInjector";
import { IconPackService } from "@/lib/iconPackService";
import { initCompletionSystem } from "@/core/completion/bootstrap";

function MainShell() {
  useFileDrop();
  useGitHotkeys();

  useEffect(() => {
    void useTerminalStore.getState().loadShells();
  }, []);

  useEffect(() => {
    void initExtensionHost();
    void initCSSInjector();
    void IconPackService.getInstance().scanUserPacks();
    initCompletionSystem();
  }, []);

  // Open folder passed via CLI arg ("Open in Quantum" context menu)
  useEffect(() => {
    void (async () => {
      try {
        const path = await invoke<string | null>("get_startup_path");
        if (path) {
          await useFileStore.getState().openFolder(path);
        }
      } catch {
        // not on Tauri or command not registered — ignore
      }
    })();
  }, []);

  useEffect(() => {
    let prevRoot: string | null = null;
    const unsub = useFileStore.subscribe((state) => {
      const root = state.rootPath;
      if (root && root !== prevRoot) {
        prevRoot = root;
        useGitStore.getState().setRepoRoot(root);
        void useGitStore.getState().checkIsRepo().then(() => {
          void useGitStore.getState().detectRebase();
        });
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    let prevRoot: string | null = null;
    let terminalCreated = false;
    const unsub = useFileStore.subscribe((state) => {
      if (state.rootPath && state.rootPath !== prevRoot) {
        prevRoot = state.rootPath;
        addRecentFolder(state.rootPath);
        if (!terminalCreated) {
          terminalCreated = true;
          void openTerminalAtPath(state.rootPath);
        }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleCloseResolved = async (e: Event) => {
      const detail = (e as CustomEvent<{ discard: boolean }>).detail;
      if (detail.discard) {
        await emitAppClosing();
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().destroy();
        } catch { /* window might not exist */ }
      }
    };
    window.addEventListener("code-editor:close-resolved", handleCloseResolved);
    return () => window.removeEventListener("code-editor:close-resolved", handleCloseResolved);
  }, []);

  return (
    <>
      <ShellLayout />
      <CloseConfirmDialog />
    </>
  );
}

function App() {
  const standalonePanel = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("panel");
  }, []);

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <ErrorBoundary name="Application">
        {standalonePanel ? (
          <StandalonePanelShell panelId={standalonePanel} />
        ) : (
          <MainShell />
        )}
      </ErrorBoundary>
    </TooltipProvider>
  );
}

export default App;
