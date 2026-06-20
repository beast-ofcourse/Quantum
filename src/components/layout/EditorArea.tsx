import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { Eye, EyeOff, FileText } from "lucide-react";
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
import { Resizer } from "@/components/layout/Resizer";
import { MarkdownPreview } from "@/components/markdown/MarkdownPreview";
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
  const markdownPreview = useEditorStore((s) => s.markdownPreview);
  const toggleMarkdownPreview = useEditorStore((s) => s.toggleMarkdownPreview);
  const isMd = activeTab?.language === "markdown";
  const [mdSplit, setMdSplit] = useState(50);
  const mdSplitRef = useRef<HTMLDivElement>(null);

  const handleMdResize = useCallback((delta: number) => {
    const container = mdSplitRef.current;
    if (!container) return;
    const total = container.clientWidth;
    if (total <= 0) return;
    setMdSplit((prev) => Math.max(20, Math.min(80, prev + (delta / total) * 100)));
  }, []);

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
            {openTabs.length > 0 && (
              <div className="ml-auto flex items-center gap-0.5 pr-1">
                {isMd && (
                  <button
                    type="button"
                    onClick={toggleMarkdownPreview}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={markdownPreview ? "Show Source" : "Show Preview"}
                  >
                    {markdownPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                )}
                <RunButton />
              </div>
            )}
          </div>
          {activeTab && <Breadcrumbs path={activeTab.path} />}
          <DebugToolbar />
          <div className="min-h-0 flex-1">
            {activeTab ? (
              isMd && markdownPreview ? (
                <div ref={mdSplitRef} className="flex h-full">
                  <div className="flex min-w-0 flex-col" style={{ width: `${mdSplit}%` }}>
                    <Suspense fallback={<EditorSkeleton />}>
                      <MonacoEditor
                        tabId={activeTab.id}
                        path={activeTab.path}
                        language={activeTab.language}
                        value={activeTab.currentContent}
                      />
                    </Suspense>
                  </div>
                  <Resizer orientation="vertical" ariaLabel="Resize markdown preview" onResize={handleMdResize} />
                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="flex items-center gap-1.5 border-b border-border px-3 py-1 text-xs text-muted-foreground shrink-0">
                      <FileText className="size-3" />
                      <span className="font-medium">Preview</span>
                      <span className="ml-auto truncate">{activeTab.name}</span>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <MarkdownPreview content={activeTab.currentContent} fileName={activeTab.name} />
                    </div>
                  </div>
                </div>
              ) : (
                <Suspense fallback={<EditorSkeleton />}>
                  <MonacoEditor
                    tabId={activeTab.id}
                    path={activeTab.path}
                    language={activeTab.language}
                    value={activeTab.currentContent}
                  />
                </Suspense>
              )
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
