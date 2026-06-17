import { memo } from "react";
import { Folder, FolderOpen } from "lucide-react";
import { IconPackService } from "@/lib/iconPackService";
import { cn } from "@/lib/utils";

export const FileIcon = memo(function FileIcon({
  name,
  isDir,
  open,
  className,
}: {
  name: string;
  isDir: boolean;
  open?: boolean;
  className?: string;
}) {
  const service = IconPackService.getInstance();

  if (isDir) {
    const Icon = open ? FolderOpen : Folder;
    return <Icon className={cn("size-4 shrink-0 text-amber-500", className)} />;
  }

  const Icon = service.getIcon(name, false, false);
  return <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
});
