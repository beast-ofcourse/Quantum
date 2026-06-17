import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import type { TerminalSession } from "@/types/terminal";
import type { FromWorker } from "@/lib/terminal-worker";
import { useTerminalStore } from "@/stores/terminalStore";
import { useUiStore } from "@/stores/uiStore";
import { ThemeService } from "@/lib/themeService";

interface TerminalProps {
  session: TerminalSession;
  xtermRef?: RefObject<XTerm | null>;
  onSearchOpen?: (addon: SearchAddon) => void;
}

export function Terminal({ session, xtermRef, onSearchOpen }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const internalTermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const onSearchOpenRef = useRef(onSearchOpen);
  onSearchOpenRef.current = onSearchOpen;
  const themeName = useUiStore((s) => s.theme);
  const xtermTheme = ThemeService.getTerminalTheme(themeName) ?? {};

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const term = new XTerm({
      theme: xtermTheme,
      fontFamily:
        'ui-monospace, "Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.loadAddon(searchAddon);
    term.open(container);
    internalTermRef.current = term;
    if (xtermRef) xtermRef.current = term;
    fitRef.current = fit;
    searchAddonRef.current = searchAddon;

    const worker = new Worker(
      new URL("@/workers/terminal.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.addEventListener("message", (event: MessageEvent<FromWorker>) => {
      const msg = event.data;
      if (msg?.type === "output") term.write(msg.data);
    });

    term.onData((data) => {
      void useTerminalStore.getState().writeStdin(session.id, data);
    });

    // Ctrl+Shift+C copy, Ctrl+Shift+V paste, Ctrl+Shift+F search
    const keyDisposer = term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      if (!e.ctrlKey || !e.shiftKey) return true;

      if (e.key === "C" || e.key === "c") {
        const sel = term.getSelection();
        if (sel) navigator.clipboard.writeText(sel).catch(() => {});
        return false;
      }
      if (e.key === "V" || e.key === "v") {
        navigator.clipboard.readText().then((t) => { if (t) term.paste(t); }).catch(() => {});
        return false;
      }
      if (e.key === "F" || e.key === "f") {
        onSearchOpenRef.current?.(searchAddonRef.current!);
        return false;
      }
      return true;
    });

    let fitTimer: ReturnType<typeof requestAnimationFrame> | null = null;
    const doFit = () => {
      try {
        fit.fit();
        const { cols, rows } = term;
        void useTerminalStore.getState().resize(session.id, cols, rows);
      } catch (err) {
        console.error("[Terminal] fit failed:", err);
      }
    };

    // Defer initial fit to let layout settle
    const initRaf = requestAnimationFrame(() => {
      doFit();
      // Second fit on next frame to catch layout settling
      requestAnimationFrame(doFit);
    });

    const fitTimeout = setTimeout(() => {
      doFit();
    }, 300);

    const ro = new ResizeObserver(() => {
      if (fitTimer !== null) cancelAnimationFrame(fitTimer);
      fitTimer = requestAnimationFrame(doFit);
    });
    ro.observe(container);

    const detach = useTerminalStore.getState().attachToSession(
      session.id,
      (data) => worker.postMessage({ type: "output", data }),
    );

    return () => {
      if (fitTimer !== null) cancelAnimationFrame(fitTimer);
      cancelAnimationFrame(initRaf);
      clearTimeout(fitTimeout);
      ro.disconnect();
      detach();
      keyDisposer.dispose();
      worker.postMessage({ type: "shutdown" });
      worker.terminate();
      workerRef.current = null;
      term.dispose();
      internalTermRef.current = null;
      if (xtermRef) xtermRef.current = null;
      fitRef.current = null;
      searchAddonRef.current = null;
    };
  }, [session.id, xtermRef]);

  useEffect(() => {
    if (internalTermRef.current) {
      internalTermRef.current.options.theme = xtermTheme;
    }
  }, [xtermTheme]);

  const bgColor = xtermTheme.background || "#0d1117";

  return (
    <div
      ref={containerRef}
      data-session-id={session.id}
      className="h-full w-full overflow-hidden"
      style={{ background: bgColor }}
      onClick={() => {
        internalTermRef.current?.focus();
      }}
    />
  );
}
