import { lazy, Suspense } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";
import { EditorTabs } from "@/components/editor/EditorTabs";
import { Breadcrumbs } from "@/components/editor/Breadcrumbs";
import { EditorSplitView } from "@/components/editor/EditorSplitView";
import { EditorEmptyState } from "@/components/editor/EditorEmptyState";
import { WelcomePage } from "@/components/editor/WelcomePage";
import { EditorSkeleton } from "@/components/ui/skeleton";
import { DebugToolbar } from "@/components/debug/DebugToolbar";
import { RunButton } from "@/components/debug/RunButton";
import { useEditorHotkeys } from "@/hooks/useEditorHotkeys";
import { useFileChangeSync } from "@/hooks/useFileChangeSync";
import { pickFiles, pickFolder } from "@/tauri";

const MonacoEditor = lazy(async () => {
  const mod = await import("@/components/editor/MonacoEditor");
  return { default: mod.MonacoEditor };
});

export function EditorArea() {
  const activePanel = useUiStore((s) => s.activePanel);
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const rootPath = useFileStore((s) => s.rootPath);
  const loading = useFileStore((s) => s.loading);
  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;
  const splitEditorId = useEditorStore((s) => s.splitEditorId);

  useEditorHotkeys();
  useFileChangeSync();

  const handleOpenFolder = async () => {
    const picked = await pickFolder();
    if (picked) {
      await useFileStore.getState().openFolder(picked);
    }
  };

  const handleNewFile = async () => {
    const picked = await pickFiles({ title: "New File" });
    if (picked && picked.length > 0) {
      await useFileStore.getState().openFiles(picked);
    }
  };

  const handleOpenRecentFolder = async (folder: string) => {
    await useFileStore.getState().openFolder(folder);
  };

  return (
    <section
      aria-label="Editor"
      data-active={activePanel === "editor"}
      onMouseDown={() => useUiStore.getState().setActivePanel("editor")}
      className="flex h-full w-full flex-col overflow-hidden bg-background data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:ring-ring/40"
    >
      {splitEditorId ? (
        <EditorSplitView />
      ) : (
        <>
          <div className="flex h-8 shrink-0 border-b border-border">
            {openTabs.length > 0 && <EditorTabs />}
            {openTabs.length > 0 && <RunButton />}
          </div>
          {activeTab && <Breadcrumbs path={activeTab.path} />}
          <DebugToolbar />
          <div className="min-h-0 flex-1">
            {activeTab ? (
              <Suspense fallback={<EditorSkeleton />}>
                <MonacoEditor
                  tabId={activeTab.id}
                  path={activeTab.path}
                  language={activeTab.language}
                  value={activeTab.currentContent}
                />
              </Suspense>
            ) : loading ? (
              <EditorSkeleton />
            ) : rootPath === null ? (
              <WelcomePage
                onOpenFolder={handleOpenFolder}
                onNewFile={handleNewFile}
                onOpenRecentFolder={handleOpenRecentFolder}
              />
            ) : (
              <EditorEmptyState />
            )}
          </div>
        </>
      )}
    </section>
  );
}
