import { useState } from "react";
import { useExtensionStore } from "@/extensions/store";
import {
  reloadExtension,
  deactivateExtension,
  removeExtension,
} from "@/extensions/host";
import {
  generateExtensionMain,
  generateExtensionFolder,
} from "@/extensions/template";
import { ensureExtensionsDir } from "@/extensions/scanner";
import { createDirectory, writeFile } from "@/tauri/fs";
import { isTauri } from "@/lib/platform";
import { InstallFromGitHub } from "./InstallFromGitHub";
import { ExtensionMarketplace } from "./ExtensionMarketplace";
import {
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

function ExtensionCard({
  id,
  displayName,
  description,
  version,
  isActive,
  error,
}: {
  id: string;
  displayName: string;
  description: string;
  version: string;
  isActive: boolean;
  error: string | null;
}) {
  const [removing, setRemoving] = useState(false);
  const [showErrorDetail, setShowErrorDetail] = useState(false);

  const handleRemove = async () => {
    if (!confirm(`Remove "${displayName}"? This will delete its folder.`))
      return;
    setRemoving(true);
    await removeExtension(id);
  };

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-xs font-bold uppercase text-muted-foreground">
        {displayName.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            v{version}
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
              error
                ? "bg-destructive/10 text-destructive"
                : isActive
                  ? "bg-green-500/10 text-green-500"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {error ? "ERR" : isActive ? "Active" : "Inactive"}
          </span>
        </div>
        {description && (
          <p className="mt-0.5 truncate text-muted-foreground">
            {description}
          </p>
        )}

        {/* Error display with collapsible details */}
        {error && (
          <div className="mt-1">
            <div className="flex items-center gap-1">
              <AlertCircle className="size-3 shrink-0 text-destructive" />
              <span className="line-clamp-1 text-xs text-destructive">
                {error.length > 60 ? `${error.slice(0, 60)}...` : error}
              </span>
              <button
                onClick={() => setShowErrorDetail(!showErrorDetail)}
                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
              >
                {showErrorDetail ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
              </button>
            </div>
            {showErrorDetail && (
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-destructive/5 p-2 text-[10px] leading-relaxed whitespace-pre-wrap break-all text-destructive/80">
                {error}
              </pre>
            )}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          {error ? (
            <button
              onClick={() => reloadExtension(id)}
              className="text-xs text-foreground underline-offset-2 hover:underline"
            >
              Retry
            </button>
          ) : isActive ? (
            <button
              onClick={() => deactivateExtension(id)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() => reloadExtension(id)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Reload
            </button>
          )}
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-xs text-destructive/70 underline-offset-2 hover:text-destructive hover:underline"
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExtensionsSidebar() {
  const extensions = useExtensionStore((s) => s.extensions);
  const loading = useExtensionStore((s) => s.loading);
  const [tab, setTab] = useState<"installed" | "marketplace">("installed");
  const [scaffolding, setScaffolding] = useState(false);
  const [initError, _setInitError] = useState<string | null>(null);
  const inBrowser = !isTauri();

  const handleNewExtension = async () => {
    const name = prompt("Extension name:");
    if (!name || !/^[a-z][a-z0-9_-]*$/i.test(name)) {
      if (name)
        alert(
          "Name must start with a letter and contain only letters, numbers, hyphens, or underscores.",
        );
      return;
    }
    setScaffolding(true);
    try {
      const dir = await ensureExtensionsDir();
      const extDir = `${dir}/${name}`;
      await createDirectory(extDir);
      await writeFile(`${extDir}/package.json`, generateExtensionFolder(name));
      await writeFile(`${extDir}/index.js`, generateExtensionMain(name));
      const { scanExtensions } = await import("@/extensions/scanner");
      const scanned = await scanExtensions();
      const scannedExt = scanned.find((s) => s.id === name);
      if (scannedExt) {
        const extInfo = {
          id: scannedExt.id,
          manifest: scannedExt.manifest,
          isActive: false,
          error: null,
        };
        useExtensionStore.getState().setExtensions([
          ...useExtensionStore.getState().extensions,
          extInfo,
        ]);
        const { activateExtension } = await import("@/extensions/host");
        await activateExtension(scannedExt.id);
      }
    } catch (err) {
      console.error("[ext:sidebar] failed to scaffold extension:", err);
      alert(`Failed to create extension: ${err}`);
    } finally {
      setScaffolding(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex shrink-0 gap-0 border-b border-border px-4">
        <button
          onClick={() => setTab("installed")}
          className={cn(
            "relative px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "installed"
              ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Installed
        </button>
        <button
          onClick={() => setTab("marketplace")}
          className={cn(
            "relative px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "marketplace"
              ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Marketplace
        </button>
        {inBrowser && (
          <span className="ml-auto inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 text-[9px] text-amber-600 dark:text-amber-400">
            <Monitor className="size-2.5" />
            Browser
          </span>
        )}
      </div>

      {tab === "marketplace" ? (
        <ExtensionMarketplace />
      ) : (
        <div className="flex-1 overflow-auto p-3 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Scanning extensions...
            </p>
          ) : initError ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                Failed to load extensions
              </p>
              <p className="text-xs text-muted-foreground">{initError}</p>
            </div>
          ) : (
            <>
              <InstallFromGitHub />

              <div className="space-y-3">
                {extensions.length === 0 && (
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>No extensions installed.</p>
                    {inBrowser ? (
                      <p className="text-xs">
                        Use the Install from GitHub input above or switch to the{" "}
                        <strong>Marketplace</strong> tab to browse and install
                        extensions. In browser mode extensions are stored
                        in-memory (persisted via localStorage).
                      </p>
                    ) : (
                      <p className="text-xs">
                        Create a folder at{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          ~/.code-editor/extensions/
                        </code>{" "}
                        with an{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          index.js
                        </code>{" "}
                        file.
                      </p>
                    )}
                    {!inBrowser && (
                      <details className="cursor-pointer text-xs">
                        <summary className="font-medium">
                          Quick start template
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs text-muted-foreground">
                          {`mkdir -p ~/.code-editor/extensions/my-ext
cd ~/.code-editor/extensions/my-ext
cat > index.js << 'EOF'
${generateExtensionMain("my-ext").trimEnd()}
EOF`}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
                {extensions.map((ext) => (
                  <ExtensionCard
                    key={ext.id}
                    id={ext.id}
                    displayName={ext.manifest.displayName}
                    description={ext.manifest.description}
                    version={ext.manifest.version}
                    isActive={ext.isActive}
                    error={ext.error}
                  />
                ))}
                <button
                  onClick={handleNewExtension}
                  disabled={scaffolding}
                  className="w-full rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
                >
                  {scaffolding ? "Creating..." : "+ New Extension"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
