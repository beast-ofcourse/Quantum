import { Suspense, useEffect, useState } from "react";
import type { PanelId } from "@/types/panelRegistry";
import { getPanel } from "@/lib/panelRegistry";
import { extensionViewRegistry } from "@/extensions/viewRegistry";
import { ViewContainer } from "@/components/extensions/ViewContainer";
import { Skeleton } from "@/components/ui/skeleton";

interface PanelRendererProps {
  panelId: PanelId;
}

function ExtensionView({ viewId }: { viewId: string }) {
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
      <div className="flex h-full w-full items-center justify-center p-4 text-sm text-muted-foreground">
        View not found: {viewId}
      </div>
    );
  }

  let element: HTMLElement | null;
  try {
    element = viewEntry.render();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!error) setError(msg);
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-sm text-destructive">
        View render error: {msg}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <ViewContainer element={element} />
      </div>
    </div>
  );
}

export function PanelRenderer({ panelId }: PanelRendererProps) {
  const def = getPanel(panelId);

  if (panelId.startsWith("ext:")) {
    return (
      <Suspense fallback={<Skeleton className="h-full w-full" />}>
        <ExtensionView viewId={panelId} />
      </Suspense>
    );
  }

  if (!def) return null;

  const Component = def.component;
  return (
    <Suspense fallback={<Skeleton className="h-full w-full" />}>
      <Component />
    </Suspense>
  );
}
