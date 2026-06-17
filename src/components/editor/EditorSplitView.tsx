import { lazy, Suspense, useCallback } from "react";
import { EditorTabs } from "@/components/editor/EditorTabs";
import { Breadcrumbs } from "@/components/editor/Breadcrumbs";
import { EditorErrorBoundary } from "@/components/editor/EditorErrorBoundary";
import { ExternalChangeDialog } from "@/components/editor/ExternalChangeDialog";
import { Resizer } from "@/components/layout/Resizer";
import { EditorSkeleton } from "@/components/ui/skeleton";
import { useEditorStore } from "@/stores/editorStore";

const MonacoEditor = lazy(async () => {
  const mod = await import("@/components/editor/MonacoEditor");
  return { default: mod.MonacoEditor };
});

export function EditorSplitView() {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const splitEditorId = useEditorStore((s) => s.splitEditorId);
  const splitPosition = useEditorStore((s) => s.splitPosition);
  const setSplitPosition = useEditorStore((s) => s.setSplitPosition);
  const pendingExternalChange = useEditorStore((s) => s.pendingExternalChange);
  const clearExternalChange = useEditorStore((s) => s.clearExternalChange);
  const acceptExternalChange = useEditorStore((s) => s.acceptExternalChange);

  const primaryTab = openTabs.find((t) => t.id === activeTabId);
  const secondaryTab = splitEditorId
    ? openTabs.find((t) => t.id === splitEditorId)
    : null;

  const handleResize = useCallback(
    (delta: number) => {
      const container = document.querySelector("[data-split-container]");
      if (!container) return;
      const total = container.clientWidth;
      const pct = ((splitPosition / 100) * total + delta) / total;
      setSplitPosition(Math.max(20, Math.min(80, Math.round(pct * 100))));
    },
    [splitPosition, setSplitPosition],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {openTabs.length > 0 && <EditorTabs />}
      {primaryTab && <Breadcrumbs path={primaryTab.path} />}
      <div
        data-split-container
        className="flex min-h-0 flex-1"
      >
        <div className="flex min-w-0 flex-1 flex-col" style={{ width: `${splitPosition}%` }}>
          {primaryTab ? (
            <EditorErrorBoundary tabId={primaryTab.id} key={primaryTab.id}>
              <Suspense fallback={<EditorSkeleton />}>
                <MonacoEditor
                  tabId={primaryTab.id}
                  path={primaryTab.path}
                  language={primaryTab.language}
                  value={primaryTab.currentContent}
                />
              </Suspense>
            </EditorErrorBoundary>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No editor open
            </div>
          )}
        </div>

        <Resizer
          orientation="vertical"
          ariaLabel="Resize split panes"
          onResize={handleResize}
        />

        <div className="flex min-w-0 flex-1 flex-col" style={{ width: `${100 - splitPosition}%` }}>
          {secondaryTab ? (
            <>
              <Breadcrumbs path={secondaryTab.path} />
              <EditorErrorBoundary tabId={secondaryTab.id} key={secondaryTab.id}>
                <Suspense fallback={<EditorSkeleton />}>
                  <MonacoEditor
                    tabId={secondaryTab.id}
                    path={secondaryTab.path}
                    language={secondaryTab.language}
                    value={secondaryTab.currentContent}
                  />
                </Suspense>
              </EditorErrorBoundary>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Press Ctrl+\ to split
            </div>
          )}
        </div>
      </div>

      <ExternalChangeDialog
        tabName={pendingExternalChange?.tabName ?? null}
        onKeepLocal={clearExternalChange}
        onReload={() => {
          if (pendingExternalChange) {
            acceptExternalChange(pendingExternalChange.path);
          }
        }}
      />
    </div>
  );
}
