import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";
import { isTauri } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editorStore";
import { useUiStore } from "@/stores/uiStore";
import { TitleBarMenus } from "./TitleBarMenus";
import { SearchBar } from "@/components/search/SearchBar";

const APP_TITLE = "Quantum";

export function TitleBar() {
  const tauri = isTauri();
  const [isMaximized, setIsMaximized] = useState(false);
  const menuBarVisible = useUiStore((s) => s.menuBarVisible);

  useEffect(() => {
    if (!tauri) return;
    let unlisten: (() => void) | undefined;
    const window = getCurrentWindow();
    window.isMaximized().then(setIsMaximized).catch(() => undefined);
    window
      .onResized(async () => {
        const max = await window.isMaximized();
        setIsMaximized(max);
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      unlisten?.();
    };
  }, [tauri]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tauri) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [role=menuitem]")) return;
    getCurrentWindow().startDragging().catch(() => undefined);
  };

  const handleMinimize = () => {
    getCurrentWindow().minimize().catch(() => undefined);
  };
  const handleToggleMaximize = async () => {
    const w = getCurrentWindow();
    if (await w.isMaximized()) {
      w.unmaximize().catch(() => undefined);
    } else {
      w.maximize().catch(() => undefined);
    }
  };
  const handleClose = () => {
    const dirty = useEditorStore.getState().openTabs.filter((t) => t.isDirty);
    if (dirty.length > 0) {
      window.dispatchEvent(
        new CustomEvent("code-editor:close-requested", {
          detail: { dirtyTabs: dirty.map((t) => ({ path: t.path, name: t.name })) },
        }),
      );
    } else {
      getCurrentWindow().destroy().catch(() => undefined);
    }
  };

  return (
    <header
      onPointerDown={handlePointerDown}
      className={cn(
        "flex h-9 shrink-0 select-none items-center border-b bg-muted/40 px-2 text-xs",
        "border-border",
      )}
    >
      <div className="flex h-full flex-1 items-center gap-1 overflow-hidden px-1 min-w-0">
        {menuBarVisible && (
          <div className="flex items-center h-full shrink-0">
            <TitleBarMenus />
          </div>
        )}
        <span className="font-semibold tracking-wide text-foreground/80 shrink-0">
          {APP_TITLE}
        </span>
        {!tauri && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
            Dev (browser)
          </span>
        )}
      </div>

      <div className="flex h-full shrink-0 items-center justify-center px-2">
        <SearchBar />
      </div>

      <div className="flex h-full flex-1 items-center justify-end">
        {tauri ? (
          <>
            <TitleBarButton
              aria-label="Minimize"
              onClick={handleMinimize}
            >
              <Minus className="size-3.5" />
            </TitleBarButton>
            <TitleBarButton
              aria-label={isMaximized ? "Restore" : "Maximize"}
              onClick={handleToggleMaximize}
            >
              {isMaximized ? (
                <Copy className="size-3" />
              ) : (
                <Square className="size-3" />
              )}
            </TitleBarButton>
            <TitleBarButton
              aria-label="Close"
              onClick={handleClose}
              className="hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="size-3.5" />
            </TitleBarButton>
          </>
        ) : (
          <div className="flex h-full items-center px-3 text-muted-foreground">
            Window controls disabled in browser
          </div>
        )}
      </div>
    </header>
  );
}

interface TitleBarButtonProps extends React.ComponentProps<"button"> {
  "aria-label": string;
}

function TitleBarButton({ className, children, ...props }: TitleBarButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-full w-12 items-center justify-center text-foreground/70 transition-colors hover:bg-accent hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
