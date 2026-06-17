import { memo } from "react";
import { ChevronRight, File } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { cn } from "@/lib/utils";

interface BreadcrumbsProps {
  path: string;
}

export const Breadcrumbs = memo(function Breadcrumbs({ path }: BreadcrumbsProps) {
  const rootPath = useFileStore((s) => s.rootPath);

  if (!rootPath) return null;

  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/[/\\]+$/, "");
  const relative = normalizedPath.replace(normalizedRoot, "").replace(/^\//, "");
  const segments = relative.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <div className="flex h-6 shrink-0 items-center gap-0.5 border-b border-border bg-muted/20 px-3 text-xs text-muted-foreground overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <File className="size-3 shrink-0 mr-0.5" />
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-0.5 whitespace-nowrap">
          {i > 0 && <ChevronRight className="size-3 shrink-0" />}
          <span
            className={cn(
              "rounded px-0.5 py-0.5",
              i === segments.length - 1
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            {seg}
          </span>
        </span>
      ))}
    </div>
  );
});
