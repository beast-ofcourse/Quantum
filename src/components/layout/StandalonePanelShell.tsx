import { useEffect, useRef } from "react";
import { PanelRenderer } from "@/components/layout/PanelRenderer";
import { useThemeManager } from "@/hooks/useThemeManager";
import { setupPanelWindowGeometryTracking, listenForAppClose } from "@/lib/multiWindowService";

interface StandalonePanelShellProps {
  panelId: string;
}

export function StandalonePanelShell({ panelId }: StandalonePanelShellProps) {
  const cleanupRef = useRef<() => void>(() => {});

  useThemeManager();

  useEffect(() => {
    const track = setupPanelWindowGeometryTracking(panelId);
    const unlisten = listenForAppClose();

    Promise.all([track, unlisten]).then(([cleanupTrack, cleanupListen]) => {
      cleanupRef.current = () => {
        cleanupTrack();
        cleanupListen();
      };
    });

    return () => {
      cleanupRef.current();
    };
  }, [panelId]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <PanelRenderer panelId={panelId} />
          </div>
        </div>
      </div>
    </div>
  );
}
