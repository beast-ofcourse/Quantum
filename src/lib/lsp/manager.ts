import { LspClient } from "./client";
import { MonacoBridge } from "./monacoBridge";
import { editorBus } from "@/extensions/api/editorBus";
import { getMonacoModule } from "@/extensions/editorRef";
import type { LspConfig } from "./types";
import { registerLspClient } from "@/core/completion/bootstrap";

interface LspInstance {
  languageId: string;
  client: LspClient;
  bridge: MonacoBridge | null;
  config: LspConfig;
  openDocs: Map<string, number>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

class LspManager {
  private instances = new Map<string, LspInstance>();
  private versionCounter = 0;
  private unsubFns: (() => void)[] = [];

  init(): void {
    if (this.unsubFns.length > 0) return;

    const uriFromPath = (path: string) => "file://" + path.replace(/\\/g, "/");

    this.unsubFns.push(
      editorBus.onOpen((doc) => {
        const lang = this.languageForPath(doc.path);
        if (!lang) return;
        const inst = this.instances.get(lang);
        if (!inst) return;
        const uri = uriFromPath(doc.path);
        inst.openDocs.set(uri, ++this.versionCounter);
        this.ensureRunning(lang, inst).then(() => {
          inst.client.openDocument(uri, doc.content, this.versionCounter, lang);
        });
      })
    );

    this.unsubFns.push(
      editorBus.onChange((e) => {
        const lang = this.languageForPath(e.path);
        if (!lang) return;
        const inst = this.instances.get(lang);
        if (!inst) return;
        const uri = uriFromPath(e.path);
        inst.client.changeDocument(uri, e.content, ++this.versionCounter);
      })
    );

    this.unsubFns.push(
      editorBus.onClose((doc) => {
        const lang = this.languageForPath(doc.path);
        if (!lang) return;
        const inst = this.instances.get(lang);
        if (!inst) return;
        const uri = uriFromPath(doc.path);
        inst.openDocs.delete(uri);
        inst.client.closeDocument(uri);
        if (inst.openDocs.size === 0) {
          this.scheduleIdleKill(lang, inst);
        }
      })
    );
  }

  private languageForPath(path: string): string | null {
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".cs")) return "csharp";
    return null;
  }

  private async ensureRunning(lang: string, inst: LspInstance): Promise<void> {
    if (inst.idleTimer) {
      clearTimeout(inst.idleTimer);
      inst.idleTimer = null;
      return;
    }
    if (inst.openDocs.size <= 1 && !inst.idleTimer) {
      try {
        await inst.client.start();
        // Register LSP client with CompletionEngine
        registerLspClient(inst.client);
        const monaco = getMonacoModule();
        if (monaco) {
          inst.bridge = new MonacoBridge(monaco, inst.client, lang);
          inst.bridge.register();
        }
      } catch {
        // LSP server binary not found or failed to start
      }
    }
  }

  private scheduleIdleKill(_lang: string, inst: LspInstance): void {
    if (inst.idleTimer) clearTimeout(inst.idleTimer);
    inst.idleTimer = setTimeout(() => {
      if (inst.openDocs.size === 0) {
        inst.bridge?.dispose();
        inst.bridge = null;
        inst.client.shutdown();
        inst.idleTimer = null;
      }
    }, 5 * 60 * 1000);
  }

  registerLanguage(languageId: string, config: LspConfig): { dispose: () => void } {
    if (this.instances.has(languageId)) {
      return { dispose: () => {} };
    }
    const instance: LspInstance = {
      languageId,
      client: new LspClient(config),
      bridge: null,
      config,
      openDocs: new Map(),
      idleTimer: null,
    };
    this.instances.set(languageId, instance);
    this.init();
    return { dispose: () => this.unregisterLanguage(languageId) };
  }

  private unregisterLanguage(languageId: string): void {
    const inst = this.instances.get(languageId);
    if (!inst) return;
    if (inst.idleTimer) clearTimeout(inst.idleTimer);
    inst.bridge?.dispose();
    inst.client.shutdown();
    this.instances.delete(languageId);
  }

  shutdownAll(): void {
    for (const [, inst] of this.instances) {
      if (inst.idleTimer) clearTimeout(inst.idleTimer);
      inst.bridge?.dispose();
      inst.client.shutdown();
    }
    this.instances.clear();
    for (const fn of this.unsubFns) fn();
    this.unsubFns = [];
  }
}

export const lspManager = new LspManager();
