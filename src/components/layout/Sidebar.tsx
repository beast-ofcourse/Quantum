import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/uiStore";
import { FileTree } from "@/components/explorer/FileTree";
import { GitSidebar } from "@/components/git/GitSidebar";
import { SearchSidebar } from "@/components/search/SearchSidebar";
import { ExtensionsSidebar } from "@/components/extensions/ExtensionsSidebar";
import { ViewContainer } from "@/components/extensions/ViewContainer";
import { extensionViewRegistry } from "@/extensions/viewRegistry";

function ExtensionViewSidebar({ viewId }: { viewId: string }) {
  const [viewEntry, setViewEntry] = useState(() => extensionViewRegistry.get(viewId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = extensionViewRegistry.onChanged(() => {
      setViewEntry(extensionViewRegistry.get(viewId));
    });
    return () => d.dispose();
  }, [viewId]);

  if (!viewEntry) {
    return (
      <aside
        aria-label="Extension View"
        className="flex h-full w-full flex-col overflow-hidden"
      >
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          View not found: {viewId}
        </div>
      </aside>
    );
  }

  let element: HTMLElement | null;
  try {
    element = viewEntry.render();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!error) setError(msg);
    return (
      <aside
        aria-label="Extension View"
        className="flex h-full w-full flex-col overflow-hidden"
      >
        <div className="flex h-full items-center justify-center p-4 text-sm text-destructive">
          View render error: {msg}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={viewEntry.title}
      className="flex h-full w-full flex-col overflow-hidden"
    >
      <div className="flex-1 overflow-auto">
        <ViewContainer element={element} />
      </div>
    </aside>
  );
}

export function Sidebar() {
  const view = useUiStore((s) => s.zones.left.activePanelId ?? "explorer");

  if (view === "extensions") {
    return (
      <aside
        aria-label="Extensions Sidebar"
        className="flex h-full w-full flex-col overflow-hidden"
      >
        <ExtensionsSidebar />
      </aside>
    );
  }

  if (view.startsWith("ext:")) {
    return <ExtensionViewSidebar viewId={view} />;
  }

  return (
    <aside
      aria-label="Sidebar"
      className="flex h-full w-full flex-col overflow-hidden"
    >
      {view === "explorer" ? (
        <FileTree />
      ) : view === "search" ? (
        <SearchSidebar />
      ) : view === "git" ? (
        <GitSidebar />
      ) : null}
    </aside>
  );
}
