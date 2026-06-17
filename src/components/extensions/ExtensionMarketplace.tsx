import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useExtensionStore } from "@/extensions/store";
import { installFromGitHub } from "@/extensions/installer";
import { getMarketplaceExtensions } from "@/lib/marketplaceService";
import type { MarketplaceExtension } from "@/types/marketplace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Star,
  Download,
  Loader2,
  Check,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Grid3X3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;
const ALL_TAGS = ["theme", "language", "snippet", "tool", "keybinding", "icon", "formatter", "linter"];

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "xs" }) {
  const starClass = size === "xs" ? "size-2.5" : "size-3";
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            starClass,
            star <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-12 rounded-full" />
          </div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="ml-auto h-6 w-16 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExtensionDetail({
  ext,
  onBack,
}: {
  ext: MarketplaceExtension;
  onBack: () => void;
}) {
  const storeExtensions = useExtensionStore((s) => s.extensions);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const isInstalled = useMemo(
    () => storeExtensions.some((e) => e.id === ext.name || e.manifest.name === ext.name),
    [storeExtensions, ext.name],
  );

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      await installFromGitHub(ext.repository);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Installation failed");
    } finally {
      setInstalling(false);
    }
  }, [ext.repository]);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back to marketplace
      </button>

      <div className="flex items-start gap-3">
        {ext.icon ? (
          <img
            src={ext.icon}
            alt=""
            className="size-12 shrink-0 rounded-lg"
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold text-muted-foreground">
            {ext.displayName.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{ext.displayName}</h3>
          <p className="text-xs text-muted-foreground">
            {ext.publisher} &middot; v{ext.version}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="size-3" />
              {formatDownloads(ext.downloads)}
            </span>
            <StarRating rating={ext.rating} size="xs" />
            <span className="text-[10px]">({ext.rating.toFixed(1)})</span>
          </div>
        </div>
        <div className="shrink-0">
          {isInstalled ? (
            <Button size="xs" variant="outline" disabled>
              <Check className="size-3" />
              Installed
            </Button>
          ) : (
            <Button size="xs" onClick={handleInstall} disabled={installing}>
              {installing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              {installing ? "Installing..." : "Install"}
            </Button>
          )}
        </div>
      </div>

      {installError && (
        <div className="flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>{installError}</span>
        </div>
      )}

      <p className="text-sm text-foreground/80 leading-relaxed">{ext.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {ext.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-[10px]">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {ext.license && <p>License: {ext.license}</p>}
        <p>Updated: {new Date(ext.updatedAt).toLocaleDateString()}</p>
        <p>
          Repository:{" "}
          <a
            href={ext.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            {ext.repository}
            <ExternalLink className="size-2.5" />
          </a>
        </p>
        {ext.homepage && (
          <p>
            Homepage:{" "}
            <a
              href={ext.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              {ext.homepage}
              <ExternalLink className="size-2.5" />
            </a>
          </p>
        )}
      </div>

      {isInstalled && (
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          This extension is installed. Go to the Installed tab to manage it.
        </div>
      )}
    </div>
  );
}

export function ExtensionMarketplace() {
  const storeExtensions = useExtensionStore((s) => s.extensions);
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedExt, setSelectedExt] = useState<MarketplaceExtension | null>(null);
  const [page, setPage] = useState(1);
  const [installingMap, setInstallingMap] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const query = debouncedQuery;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getMarketplaceExtensions(query, activeTags.length > 0 ? activeTags : undefined)
      .then((result) => {
        if (!cancelled) {
          setExtensions(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load marketplace");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query, activeTags]);

  const handleInstall = useCallback(
    async (ext: MarketplaceExtension) => {
      setInstallingMap((prev) => ({ ...prev, [ext.id]: true }));
      try {
        await installFromGitHub(ext.repository);
      } catch {
        /* install error already surfaced by installer */
      } finally {
        setInstallingMap((prev) => ({ ...prev, [ext.id]: false }));
      }
    },
    [],
  );

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
    setPage(1);
  }, []);

  const isInstalled = useCallback(
    (ext: MarketplaceExtension) =>
      storeExtensions.some((e) => e.id === ext.name || e.manifest.name === ext.name),
    [storeExtensions],
  );

  const handleCardClick = useCallback((ext: MarketplaceExtension) => {
    setSelectedExt(ext);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedExt(null);
  }, []);

  const paginatedExtensions = useMemo(
    () => extensions.slice(0, page * PAGE_SIZE),
    [extensions, page],
  );

  const hasMore = paginatedExtensions.length < extensions.length;

  // Detail view
  if (selectedExt) {
    return (
      <ScrollArea className="h-full">
        <div className="p-3">
          <ExtensionDetail ext={selectedExt} onBack={handleBack} />
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="shrink-0 space-y-2 p-3 pb-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search marketplace..."
            className="pl-8 h-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                activeTags.includes(tag)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {tag}
            </button>
          ))}
          {activeTags.length > 0 && (
            <button
              onClick={() => setActiveTags([])}
              className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : error ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
              <AlertCircle className="size-8 text-destructive" />
              <p className="text-sm font-medium text-destructive">Failed to load marketplace</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  getMarketplaceExtensions(query, activeTags.length > 0 ? activeTags : undefined)
                    .then(setExtensions)
                    .catch((err) =>
                      setError(err instanceof Error ? err.message : "Failed to load marketplace"),
                    )
                    .finally(() => setLoading(false));
                }}
              >
                Retry
              </Button>
            </div>
          ) : paginatedExtensions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
              <Grid3X3 className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                {query || activeTags.length > 0
                  ? "No extensions match your search"
                  : "Marketplace is empty"}
              </p>
              {(query || activeTags.length > 0) && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setActiveTags([]);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground">
                {extensions.length} extension{extensions.length !== 1 ? "s" : ""} found
              </p>
              <div className="space-y-2">
                {paginatedExtensions.map((ext) => {
                  const installed = isInstalled(ext);
                  const installing = installingMap[ext.id];

                  return (
                    <div
                      key={ext.id}
                      className="group cursor-pointer rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-foreground/20"
                      onClick={() => handleCardClick(ext)}
                    >
                      <div className="flex items-start gap-3">
                        {ext.icon ? (
                          <img
                            src={ext.icon}
                            alt=""
                            className="size-10 shrink-0 rounded-lg"
                          />
                        ) : (
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
                            {ext.displayName.charAt(0)}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {ext.displayName}
                            </span>
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px] px-1.5 py-0"
                            >
                              v{ext.version}
                            </Badge>
                          </div>

                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {ext.publisher}
                          </p>

                          <p className="mt-1 line-clamp-2 text-xs text-foreground/70 leading-relaxed">
                            {ext.description}
                          </p>

                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {ext.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[9px] px-1.5 py-0"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {ext.tags.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">
                                +{ext.tags.length - 3}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-0.5">
                              <Download className="size-2.5" />
                              {formatDownloads(ext.downloads)}
                            </span>
                            <StarRating rating={ext.rating} size="xs" />
                          </div>
                        </div>

                        <div
                          className="shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {installed ? (
                            <Button size="xs" variant="outline" disabled className="pointer-events-none">
                              <Check className="size-3" />
                              Installed
                            </Button>
                          ) : (
                            <Button
                              size="xs"
                              onClick={() => handleInstall(ext)}
                              disabled={installing}
                            >
                              {installing ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Download className="size-3" />
                              )}
                              {installing ? "Installing..." : "Install"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <div className="flex justify-center pt-2 pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    className="text-xs"
                  >
                    Load More ({extensions.length - paginatedExtensions.length} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
