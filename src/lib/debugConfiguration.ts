import { readFile, writeFile, pathExists, createDirectory } from "@/tauri/fs";
import { joinPath, parentPath } from "@/lib/pathUtils";
import type { DebugConfiguration } from "@/types/debug";

/**
 * Resolve variable placeholders in a DebugConfiguration.
 * Supports: ${workspaceFolder}, ${file}, ${fileDirname}, ${fileBasename}
 */
export function resolveConfigVariables(
  config: DebugConfiguration,
  rootPath: string,
  activeFilePath?: string,
): DebugConfiguration {
  const file = activeFilePath ?? rootPath;
  const fileDir = parentPath(file) ?? rootPath;
  const fileBase = file.split(/[/\\]/).pop() ?? file;

  const replaceVar = (s: string) =>
    s
      .replace(/\${workspaceFolder}/g, rootPath)
      .replace(/\${file}/g, file)
      .replace(/\${fileDirname}/g, fileDir)
      .replace(/\${fileBasename}/g, fileBase);

  const resolved: DebugConfiguration = {
    ...config,
    program: config.program ? replaceVar(config.program) : config.program,
    cwd: config.cwd ? replaceVar(config.cwd) : rootPath,
  };
  if (config.args) resolved.args = config.args.map(replaceVar);
  if (config.adapterArgs) resolved.adapterArgs = config.adapterArgs.map(replaceVar);
  if (config.runtimeArgs) resolved.runtimeArgs = config.runtimeArgs.map(replaceVar);
  return resolved;
}

interface LaunchJson {
  version: string;
  configurations: DebugConfiguration[];
}

const CONFIG_DIR = ".quantum";
const CONFIG_FILE = "launch.json";

function createNodeConfig(name?: string): DebugConfiguration {
  return {
    type: "node",
    name: name ?? "Node.js Launch",
    request: "launch",
    program: "${workspaceFolder}/app.js",
    adapterPath: "node",
    adapterArgs: [
      "--inspect-brk",
      "${workspaceFolder}/node_modules/@vscode/js-debug-brk/out/src/bootloader.js",
    ],
  };
}

function createPythonConfig(name?: string): DebugConfiguration {
  return {
    type: "python",
    name: name ?? "Python Launch",
    request: "launch",
    program: "${workspaceFolder}/app.py",
    adapterPath: "python",
    adapterArgs: ["-m", "debugpy.adapter"],
  };
}

const TEMPLATES: Record<string, (name?: string) => DebugConfiguration> = {
  node: createNodeConfig,
  python: createPythonConfig,
};

export function getAvailableTypes(): string[] {
  return Object.keys(TEMPLATES);
}

export function createTemplate(type: string, name?: string): DebugConfiguration {
  const fn = TEMPLATES[type];
  if (!fn) return createNodeConfig(name);
  return fn(name);
}

export function getDefaultConfigs(): DebugConfiguration[] {
  return [createNodeConfig()];
}

function configDir(root: string): string {
  return joinPath(root, CONFIG_DIR);
}

function configPath(root: string): string {
  return joinPath(configDir(root), CONFIG_FILE);
}

export class DebugConfigurationService {
  static async loadConfigs(root?: string): Promise<DebugConfiguration[]> {
    const { useFileStore } = await import("@/stores/fileStore");
    const ws = root ?? useFileStore.getState().rootPath;
    if (!ws) return getDefaultConfigs();

    const path = configPath(ws);
    const exists = await pathExists(path);
    if (!exists) return getDefaultConfigs();

    try {
      const raw = await readFile(path);
      const parsed: LaunchJson = JSON.parse(raw);
      return parsed.configurations ?? getDefaultConfigs();
    } catch {
      return getDefaultConfigs();
    }
  }

  static async saveConfigs(configs: DebugConfiguration[], root?: string): Promise<void> {
    const { useFileStore } = await import("@/stores/fileStore");
    const ws = root ?? useFileStore.getState().rootPath;
    if (!ws) return;

    const dir = configDir(ws);
    const dirExists = await pathExists(dir);
    if (!dirExists) {
      await createDirectory(dir);
    }

    const data: LaunchJson = {
      version: "0.2.0",
      configurations: configs,
    };

    await writeFile(configPath(ws), JSON.stringify(data, null, 2));
  }

  static async addConfig(config: DebugConfiguration): Promise<void> {
    const configs = await this.loadConfigs();
    configs.push(config);
    await this.saveConfigs(configs);
  }

  static async removeConfig(name: string): Promise<void> {
    let configs = await this.loadConfigs();
    configs = configs.filter((c) => c.name !== name);
    await this.saveConfigs(configs);
  }

  static async updateConfig(oldName: string, config: DebugConfiguration): Promise<void> {
    let configs = await this.loadConfigs();
    const idx = configs.findIndex((c) => c.name === oldName);
    if (idx !== -1) {
      configs[idx] = config;
    } else {
      configs.push(config);
    }
    await this.saveConfigs(configs);
  }
}
