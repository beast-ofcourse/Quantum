import { useState, useCallback } from "react";
import { installFromGitHub, parseGitHubUrl } from "@/extensions/installer";
import { isTauri } from "@/lib/platform";
import { Loader2, CheckCircle, AlertCircle, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type InstallState = "idle" | "validating" | "installing" | "success" | "error";

export function InstallFromGitHub() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<InstallState>("idle");
  const [message, setMessage] = useState("");
  const inBrowser = !isTauri();

  const parsed = url.trim() ? parseGitHubUrl(url.trim()) : null;
  const isUrlValid = url.trim() === "" || parsed !== null;

  const handleInstall = useCallback(async () => {
    if (!parsed) return;

    setState("installing");
    setMessage("Downloading extension...");

    try {
      const result = await installFromGitHub(url.trim());
      setState("success");
      setMessage(
        `"${result.name}" installed successfully (${result.files} files)`,
      );
      setUrl("");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Installation failed");
    }
  }, [url, parsed]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && parsed && state !== "installing") {
        void handleInstall();
      }
    },
    [parsed, state, handleInstall],
  );

  const handleClearState = useCallback(() => {
    setState("idle");
    setMessage("");
  }, []);

  const statusIcon = () => {
    switch (state) {
      case "installing":
        return <Loader2 className="size-4 animate-spin" />;
      case "success":
        return <CheckCircle className="size-4 text-green-500" />;
      case "error":
        return <AlertCircle className="size-4 text-destructive" />;
      default:
        return null;
    }
  };

  // In browser mode the installer works through virtual fs, so it's fully functional.
  // No special blocking needed — the backend handles both modes.
  // Just show a subtle indicator so users know it works.

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Install from GitHub
        </p>
        {inBrowser && (
          <span
            className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-600 dark:text-amber-400"
            title="Extensions install to in-memory storage in browser mode (persisted to localStorage)"
          >
            <Monitor className="size-2.5" />
            Browser mode
          </span>
        )}
      </div>
      <div className="relative">
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (state !== "idle") handleClearState();
          }}
          onKeyDown={handleKeyDown}
          placeholder="https://github.com/user/repo"
          className={cn(
            "w-full rounded-md border bg-background px-3 py-1.5 pr-20 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors",
            url.trim() !== "" && !isUrlValid
              ? "border-destructive/50 focus:border-destructive"
              : url.trim() !== "" && isUrlValid
                ? "border-green-500/50 focus:border-green-500"
                : "border-border focus:border-foreground/30",
          )}
          disabled={state === "installing"}
        />
        <button
          onClick={handleClearState}
          className={cn(
            "absolute right-20 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-opacity",
            state !== "idle" ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          title="Clear status"
        >
          {statusIcon()}
        </button>
        <button
          onClick={handleInstall}
          disabled={!parsed || state === "installing"}
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
            parsed && state !== "installing"
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {state === "installing" ? "Installing..." : "Install"}
        </button>
      </div>

      {/* Status message */}
      {state === "error" && message && (
        <div className="flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {state === "success" && message && (
        <div className="flex items-center gap-1.5 rounded bg-green-500/10 p-2 text-xs text-green-500">
          <CheckCircle className="size-3 shrink-0" />
          <span className="flex-1">{message}</span>
        </div>
      )}

      {/* URL hint */}
      <p className="text-[10px] text-muted-foreground/60">
        Paste a GitHub repository URL. The repo must have an{" "}
        <code className="rounded bg-muted px-1">index.js</code> file in its root.
      </p>
    </div>
  );
}
