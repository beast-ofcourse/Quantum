import { DEFAULT_ICON_PACK, BUILTIN_ICON_REGISTRY } from "@/lib/defaultIconPack";
import type { IconPackDefinition } from "@/types/icons";
import type { LucideIcon } from "lucide-react";

const EXTENSION_REGEX = /\.([^.]+)$/;

export class IconPackService {
  private static instance: IconPackService;
  private activePack: IconPackDefinition = DEFAULT_ICON_PACK;
  private customPacks: Map<string, IconPackDefinition> = new Map();

  static getInstance(): IconPackService {
    if (!IconPackService.instance) {
      IconPackService.instance = new IconPackService();
    }
    return IconPackService.instance;
  }

  private constructor() {}

  setActivePack(name: string): void {
    if (this.customPacks.has(name)) {
      this.activePack = this.customPacks.get(name)!;
    } else {
      this.activePack = DEFAULT_ICON_PACK;
    }
  }

  registerPack(def: IconPackDefinition): void {
    this.customPacks.set(def.name, def);
  }

  async scanUserPacks(): Promise<void> {
    const { isTauri } = await import("@/lib/platform");
    if (!isTauri()) return;

    try {
      const { exists, readTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
      const { appDataDir } = await import("@tauri-apps/api/path");
      const baseDir = await appDataDir();
      const iconsDir = `${baseDir}.quantum/icons`;

      const dirExists = await exists(iconsDir);
      if (!dirExists) {
        await mkdir(iconsDir, { recursive: true }).catch(() => {});
        return;
      }

      const { readDir } = await import("@tauri-apps/plugin-fs");
      const entries = await readDir(iconsDir);

      for (const entry of entries) {
        if (!entry.name || !entry.name.endsWith(".json")) continue;
        try {
          const content = await readTextFile(`${iconsDir}/${entry.name}`);
          const pack = JSON.parse(content) as IconPackDefinition;
          if (pack.name && pack.icons) {
            this.customPacks.set(pack.name, pack);
          }
        } catch (err) {
          console.warn(`[IconPackService] Failed to load ${entry.name}:`, err);
        }
      }
    } catch {
      // Tauri APIs not available
    }
  }

  getIcon(filename: string, isDir?: boolean, isOpen?: boolean): LucideIcon {
    const iconMap = this.activePack.icons;

    if (isDir) {
      const key = isOpen ? "folderOpen" : "folder";
      return this.lookupIcon(iconMap[key] ?? "Folder");
    }

    // Exact filename match: check extension-stripped name ("readme.md" → "readme")
    // and leading-dot-stripped name (".env" → "env"). Both case-insensitive.
    const nameNoExt = filename.replace(/\.[^.]+$/, "").toLowerCase();
    const stripDot = filename.replace(/^\./, "").toLowerCase();
    const fileNameIcon = iconMap[nameNoExt] ?? iconMap[stripDot] ?? iconMap[filename.toLowerCase()];
    if (fileNameIcon) return this.lookupIcon(fileNameIcon);

    // Extension match
    const ext = this.resolveExtension(filename);
    const iconName = ext ? iconMap[ext] : undefined;
    if (iconName) return this.lookupIcon(iconName);

    if (ext) return this.lookupIcon(iconMap["fileUnknown"] ?? "FileType");
    return this.lookupIcon(iconMap["fileDefault"] ?? "File");
  }

  getAllExtensions(): string[] {
    return Object.keys(this.activePack.icons).filter(
      (k) => !["folder", "folderOpen", "fileDefault", "fileUnknown"].includes(k),
    );
  }

  private resolveExtension(filename: string): string | null {
    const match = filename.match(EXTENSION_REGEX);
    return match ? match[1].toLowerCase() : null;
  }

  private lookupIcon(name: string): LucideIcon {
    const resolved = BUILTIN_ICON_REGISTRY[name];
    if (resolved) return resolved;
    const fallback = BUILTIN_ICON_REGISTRY["File"];
    return fallback ?? (() => null) as unknown as LucideIcon;
  }
}
