import {
  readFile,
  readDirectory,
  resolveHome,
  pathExists,
  createDirectory,
} from "@/tauri/fs";
import {
  browserReadFile,
  browserReadDirectory,
  browserResolveHome,
  browserPathExists,
  browserCreateDirectory,
  initBrowserFs,
} from "@/lib/browserFs";
import { isTauri } from "@/lib/platform";
import type { FileEntry } from "@/types/file";
import type { ExtensionManifest } from "./types";

function parseManifest(raw: string): Partial<ExtensionManifest> {
  try {
    const json = JSON.parse(raw);
    if (typeof json.name !== "string" || !json.name) return {};
    return {
      name: json.name,
      displayName: json.displayName ?? json.name,
      description: json.description ?? "",
      version: json.version ?? "0.0.1",
      main: json.main ?? "index.js",
    };
  } catch {
    return {};
  }
}

export async function ensureExtensionsDir(): Promise<string> {
  if (!isTauri()) {
    initBrowserFs();
    const home = await browserResolveHome();
    const dir = `${home}/.code-editor/extensions`;
    const exists = await browserPathExists(dir);
    if (!exists) {
      await browserCreateDirectory(dir);
    }
    return dir;
  }

  const home = await resolveHome();
  const dir = `${home}/.code-editor/extensions`;
  const exists = await pathExists(dir);
  if (!exists) {
    await createDirectory(dir);
  }
  return dir;
}

export interface ScannedExtension {
  id: string;
  manifest: ExtensionManifest;
}

export async function scanExtensions(): Promise<ScannedExtension[]> {
  const dir = await ensureExtensionsDir();
  const results: ScannedExtension[] = [];

  try {
    let entries: { name: string; path: string; isDir: boolean }[];

    if (isTauri()) {
      const result = await readDirectory({
        path: dir,
        maxDepth: 1,
        includeHidden: false,
      });
      entries = result.entries.map(
        (e: FileEntry): { name: string; path: string; isDir: boolean } => ({
          name: e.name,
          path: e.path,
          isDir: e.isDir ?? ("children" in e),
        }),
      );
    } else {
      initBrowserFs();
      const result = await browserReadDirectory(dir);
      entries = result.entries;
    }

    for (const entry of entries) {
      if (!entry.isDir) continue;
      const folderName = entry.name;
      const folderPath = entry.path;

      const pkgPath = `${folderPath}/package.json`;
      const pkgExists = isTauri()
        ? await pathExists(pkgPath)
        : await browserPathExists(pkgPath);

      let manifest: ExtensionManifest;

      if (pkgExists) {
        const raw = isTauri()
          ? await readFile(pkgPath)
          : await browserReadFile(pkgPath);
        const parsed = parseManifest(raw);
        if (!parsed.name) continue;
        manifest = { ...parsed, path: folderPath } as ExtensionManifest;
      } else {
        const indexPath = `${folderPath}/index.js`;
        const indexExists = isTauri()
          ? await pathExists(indexPath)
          : await browserPathExists(indexPath);
        if (!indexExists) continue;
        manifest = {
          name: folderName,
          displayName: folderName,
          description: "",
          version: "0.0.1",
          main: "index.js",
          path: folderPath,
        };
      }

      results.push({
        id: `${manifest.name}`,
        manifest,
      });
    }
  } catch (err) {
    console.error("[ext:scanner] scan failed:", err);
  }

  return results;
}
