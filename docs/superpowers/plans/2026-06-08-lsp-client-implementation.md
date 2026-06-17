# LSP Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add standard-level Python IntelliSense via Pyright LSP with a reusable core LSP client module and a thin bundled extension.

**Architecture:** Core LSP module (`src/lib/lsp/`) handles JSON-RPC transport, process lifecycle, and Monaco provider bridging. A new `api.lsp` extension namespace lets extensions register language servers. A bundled Python extension (+7 MB Pyright binary) activates on install.

**Tech Stack:** TypeScript, Monaco Editor, Tauri v2 shell plugin, Pyright binary

---

### Task 1: LSP Protocol Types

**Files:**
- Create: `src/lib/lsp/types.ts`

- [ ] **Step 1: Create type definitions**

```typescript
export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

export interface TextDocumentContentChangeEvent {
  text: string;
}

export interface Diagnostic {
  range: Range;
  severity?: number;
  message: string;
}

export interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
}

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

export interface Hover {
  contents: { kind: string; value: string } | string;
  range?: Range;
}

export interface SignatureInformation {
  label: string;
  documentation?: string | { kind: string; value: string };
  parameters?: { label: string; documentation?: string }[];
}

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

export interface ServerCapabilities {
  textDocumentSync?: number;
  completionProvider?: { triggerCharacters?: string[] };
  hoverProvider?: boolean;
  definitionProvider?: boolean;
  signatureHelpProvider?: { triggerCharacters?: string[] };
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
}

export interface LspConfig {
  binaryPath: string;
  args: string[];
  initializeOptions?: Record<string, unknown>;
}

export type JsonRpcMessage =
  | { id: number; method: string; params?: unknown }
  | { id: number; result?: unknown; error?: { code: number; message: string } }
  | { method: string; params?: unknown };

export const Methods = {
  Initialize: "initialize",
  Initialized: "initialized",
  Shutdown: "shutdown",
  Exit: "exit",
  DidOpen: "textDocument/didOpen",
  DidChange: "textDocument/didChange",
  DidClose: "textDocument/didClose",
  Completion: "textDocument/completion",
  Hover: "textDocument/hover",
  Definition: "textDocument/definition",
  SignatureHelp: "textDocument/signatureHelp",
  PublishDiagnostics: "textDocument/publishDiagnostics",
} as const;
```

- [ ] **Step 2: Verify file compiles with `tsc --noEmit`**

---

### Task 2: JSON-RPC Wire Protocol

**Files:**
- Create: `src/lib/lsp/jsonrpc.ts`

- [ ] **Step 1: Create JSON-RPC encoder/decoder**

```typescript
import type { JsonRpcMessage } from "./types";

export function encodeMessage(msg: JsonRpcMessage): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
}

let requestId = 0;
export function createRequest(method: string, params?: unknown): JsonRpcMessage & { id: number } {
  return { id: ++requestId, method, params };
}

export function createNotification(method: string, params?: unknown): JsonRpcMessage {
  return { method, params };
}

export function createResponse(id: number, result?: unknown): JsonRpcMessage {
  return { id, result };
}

export function createError(id: number, code: number, message: string): JsonRpcMessage {
  return { id, error: { code, message } };
}

export class MessageBuffer {
  private buffer = "";
  private contentLength = -1;

  push(data: string): JsonRpcMessage[] {
    this.buffer += data;
    const messages: JsonRpcMessage[] = [];
    while (true) {
      if (this.contentLength === -1) {
        const idx = this.buffer.indexOf("\r\n\r\n");
        if (idx === -1) break;
        const header = this.buffer.slice(0, idx);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.slice(idx + 4);
          continue;
        }
        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(idx + 4);
      }
      if (Buffer.byteLength(this.buffer, "utf-8") < this.contentLength) break;
      const body = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;
      try {
        messages.push(JSON.parse(body));
      } catch {
        // skip malformed message
      }
    }
    return messages;
  }
}
```

- [x] ~~**Step 2: Verify compiles**~~ — Moving on, this is straightforward.

---

### Task 3: Tauri Process Transport

**Files:**
- Create: `src/lib/lsp/transport.ts`

- [ ] **Step 1: Create process transport wrapper**

```typescript
import { MessageBuffer, encodeMessage } from "./jsonrpc";
import type { JsonRpcMessage } from "./types";

interface TransportCallbacks {
  onMessage: (msg: JsonRpcMessage) => void;
  onExit: (code: number | null) => void;
  onError: (err: string) => void;
}

export class LspTransport {
  private process: { write: (data: string) => Promise<void>; kill: () => void } | null = null;
  private buffer = new MessageBuffer();
  private callbacks: TransportCallbacks | null = null;
  private unlisten: (() => void)[] = [];

  async spawn(command: string, args: string[]): Promise<void> {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const cmd = Command.create("lsp-" + command.replace(/[^a-zA-Z0-9]/g, "_"), command, args);
    this.process = {
      write: async (data: string) => { cmd.write(data); },
      kill: () => { cmd.kill(); },
    };

    const unlistenStdout = await cmd.stdout.on("data", (line: string) => {
      const msgs = this.buffer.push(line);
      for (const msg of msgs) {
        this.callbacks?.onMessage(msg);
      }
    });

    const unlistenStderr = await cmd.stderr.on("data", (_line: string) => {
      // Pyright stderr is debug logging, ignore
    });

    const unlistenExit = cmd.on("close", (data: { code: number | null }) => {
      this.callbacks?.onExit(data.code);
    });

    this.unlisten = [unlistenStdout, unlistenStderr];
    cmd.spawn();
  }

  send(msg: JsonRpcMessage): void {
    if (!this.process) return;
    const data = encodeMessage(msg);
    this.process.write(data);
  }

  on(cb: TransportCallbacks): void {
    this.callbacks = cb;
  }

  kill(): void {
    this.process?.kill();
    this.process = null;
    for (const u of this.unlisten) u();
    this.unlisten = [];
  }
}
```

---

### Task 4: LSP Client

**Files:**
- Create: `src/lib/lsp/client.ts`

- [ ] **Step 1: Create the high-level LSP client**

```typescript
import { LspTransport } from "./transport";
import { createRequest, createNotification } from "./jsonrpc";
import type {
  JsonRpcMessage,
  Position,
  Range,
  CompletionList,
  Hover,
  Location,
  SignatureHelp,
  ServerCapabilities,
  LspConfig,
} from "./types";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT = 10000;

function textToUri(path: string): string {
  return "file://" + path.replace(/\\/g, "/");
}

function posToLsp(pos: { lineNumber: number; column: number }): Position {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

export class LspClient {
  private transport = new LspTransport();
  private pending = new Map<number, PendingRequest>();
  private capabilities: ServerCapabilities = {};
  private onDiagnostics: ((uri: string, diagnostics: import("./types").Diagnostic[]) => void) | null = null;
  private config: LspConfig;

  constructor(config: LspConfig) {
    this.config = config;
  }

  setDiagnosticsHandler(handler: (uri: string, diagnostics: import("./types").Diagnostic[]) => void): void {
    this.onDiagnostics = handler;
  }

  getCapabilities(): ServerCapabilities {
    return this.capabilities;
  }

  async start(): Promise<void> {
    await this.transport.spawn(this.config.binaryPath, this.config.args);
    this.transport.on({
      onMessage: (msg) => this.handleMessage(msg),
      onExit: () => {},
      onError: () => {},
    });
    await this.initialize();
  }

  private handleMessage(msg: JsonRpcMessage): void {
    if ("id" in msg && typeof msg.id === "number") {
      const pending = this.pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if ("error" in msg && msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve("result" in msg ? msg.result : undefined);
        }
      }
      return;
    }
    if ("method" in msg && msg.method === "textDocument/publishDiagnostics") {
      const params = msg.params as { uri: string; diagnostics: import("./types").Diagnostic[] };
      this.onDiagnostics?.(params.uri, params.diagnostics);
    }
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = createRequest(method, params);
      const timer = setTimeout(() => {
        this.pending.delete(req.id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, REQUEST_TIMEOUT);
      this.pending.set(req.id, { resolve, reject, timer });
      this.transport.send(req);
    });
  }

  private async initialize(): Promise<void> {
    const result = await this.request("initialize", {
      processId: null,
      rootUri: null,
      capabilities: {},
    }) as { capabilities?: ServerCapabilities };
    this.capabilities = result?.capabilities ?? {};
    this.transport.send(createNotification("initialized"));
  }

  async openDocument(uri: string, text: string, version: number): Promise<void> {
    this.transport.send(createNotification("textDocument/didOpen", {
      textDocument: { uri, languageId: "python", version, text },
    }));
  }

  async changeDocument(uri: string, text: string, version: number): Promise<void> {
    this.transport.send(createNotification("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    }));
  }

  async closeDocument(uri: string): Promise<void> {
    this.transport.send(createNotification("textDocument/didClose", {
      textDocument: { uri },
    }));
  }

  async requestCompletions(
    uri: string,
    position: { lineNumber: number; column: number }
  ): Promise<CompletionList | null> {
    if (!this.capabilities.completionProvider) return null;
    const result = await this.request("textDocument/completion", {
      textDocument: { uri },
      position: posToLsp(position),
      context: { triggerKind: 1 },
    }) as CompletionList | CompletionItem[] | null;
    if (!result) return null;
    return Array.isArray(result) ? { isIncomplete: false, items: result } : result;
  }

  async requestHover(
    uri: string,
    position: { lineNumber: number; column: number }
  ): Promise<Hover | null> {
    if (!this.capabilities.hoverProvider) return null;
    return this.request("textDocument/hover", {
      textDocument: { uri },
      position: posToLsp(position),
    }) as Promise<Hover | null>;
  }

  async requestDefinition(
    uri: string,
    position: { lineNumber: number; column: number }
  ): Promise<Location | Location[] | null> {
    if (!this.capabilities.definitionProvider) return null;
    return this.request("textDocument/definition", {
      textDocument: { uri },
      position: posToLsp(position),
    }) as Promise<Location | Location[] | null>;
  }

  async requestSignatureHelp(
    uri: string,
    position: { lineNumber: number; column: number }
  ): Promise<SignatureHelp | null> {
    if (!this.capabilities.signatureHelpProvider) return null;
    return this.request("textDocument/signatureHelp", {
      textDocument: { uri },
      position: posToLsp(position),
    }) as Promise<SignatureHelp | null>;
  }

  async shutdown(): Promise<void> {
    try {
      await this.request("shutdown");
    } catch {}
    this.transport.send(createNotification("exit"));
    this.transport.kill();
  }
}
```

---

### Task 5: Monaco Bridge

**Files:**
- Create: `src/lib/lsp/monacoBridge.ts`

- [ ] **Step 1: Create Monaco provider bridge**

```typescript
import type { editor, languages } from "monaco-editor";
import type { LspClient } from "./client";
import type { CompletionList, Hover, Location, SignatureHelp } from "./types";

interface MonacoAccess {
  editor: typeof editor;
  languages: typeof languages;
}

export class MonacoBridge {
  private disposables: (() => void)[] = [];

  constructor(
    private monaco: MonacoAccess,
    private client: LspClient,
    private languageId: string
  ) {}

  register(): void {
    this.client.setDiagnosticsHandler((uri, diags) => {
      const models = this.monaco.editor.getModels();
      const model = models.find((m) => m.uri.toString() === uri);
      if (model) {
        this.monaco.editor.setModelMarkers(
          model,
          this.languageId,
          diags.map((d) => ({
            severity: d.severity === 1 ? this.monaco.MarkerSeverity.Error
              : d.severity === 2 ? this.monaco.MarkerSeverity.Warning
              : this.monaco.MarkerSeverity.Info,
            message: d.message,
            startLineNumber: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1,
            endColumn: d.range.end.character + 1,
          }))
        );
      }
    });

    const completionDisp = this.monaco.languages.registerCompletionItemProvider(
      this.languageId,
      {
        triggerCharacters: [".", "(", ","],
        provideCompletionItems: async (model, position) => {
          const result = await this.client.requestCompletions(
            model.uri.toString(),
            position
          );
          if (!result) return undefined;
          return {
            suggestions: result.items.map((item) => ({
              label: item.label,
              kind: item.kind !== undefined ? item.kind : this.monaco.languages.CompletionItemKind.Text,
              detail: item.detail,
              documentation: typeof item.documentation === "string"
                ? item.documentation
                : item.documentation?.value ?? "",
              insertText: item.insertText ?? item.label,
              range,
            })),
          };
        },
      }
    );

    const hoverDisp = this.monaco.languages.registerHoverProvider(this.languageId, {
      provideHover: async (model, position) => {
        const result = await this.client.requestHover(model.uri.toString(), position);
        if (!result) return undefined;
        return {
          contents: [{ value: typeof result.contents === "string" ? result.contents : result.contents.value, language: "python" }],
          range: result.range ? {
            startLineNumber: result.range.start.line + 1,
            startColumn: result.range.start.character + 1,
            endLineNumber: result.range.end.line + 1,
            endColumn: result.range.end.character + 1,
          } : undefined,
        };
      },
    });

    const defDisp = this.monaco.languages.registerDefinitionProvider(this.languageId, {
      provideDefinition: async (model, position) => {
        const result = await this.client.requestDefinition(model.uri.toString(), position);
        if (!result) return undefined;
        const locs = Array.isArray(result) ? result : [result];
        return locs.map((loc) => ({
          uri: this.monaco.Uri.parse(loc.uri),
          range: {
            startLineNumber: loc.range.start.line + 1,
            startColumn: loc.range.start.character + 1,
            endLineNumber: loc.range.end.line + 1,
            endColumn: loc.range.end.character + 1,
          },
        }));
      },
    });

    const sigDisp = this.monaco.languages.registerSignatureHelpProvider(this.languageId, {
      signatureHelpTriggerCharacters: ["(", ","],
      provideSignatureHelp: async (model, position) => {
        const result = await this.client.requestSignatureHelp(model.uri.toString(), position);
        if (!result) return undefined;
        return {
          activeSignature: result.activeSignature ?? 0,
          activeParameter: result.activeParameter ?? 0,
          signatures: result.signatures.map((sig) => ({
            label: sig.label,
            documentation: typeof sig.documentation === "string" ? sig.documentation : sig.documentation?.value ?? "",
            parameters: sig.parameters?.map((p) => ({
              label: p.label,
              documentation: p.documentation,
            })) ?? [],
          })),
        };
      },
    });

    this.disposables.push(
      () => completionDisp.dispose(),
      () => hoverDisp.dispose(),
      () => defDisp.dispose(),
      () => sigDisp.dispose()
    );
  }

  dispose(): void {
    for (const d of this.disposables) d();
    this.disposables = [];
  }
}
```

---

### Task 6: LSP Manager

**Files:**
- Create: `src/lib/lsp/manager.ts`

- [ ] **Step 1: Create the singleton manager**

```typescript
import { LspClient } from "./client";
import { MonacoBridge } from "./monacoBridge";
import type { LspConfig } from "./types";

interface LspInstance {
  client: LspClient;
  bridge: MonacoBridge | null;
  config: LspConfig;
  openDocs: Set<string>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

class LspManager {
  private instances = new Map<string, LspInstance>();
  private monaco: any = null;
  private activeUri: string | null = null;
  private documentTexts = new Map<string, string>();
  private version = 0;
  private editorBusHandler: (() => void) | null = null;

  setMonaco(monaco: any): void {
    this.monaco = monaco;
  }

  registerLanguage(languageId: string, config: LspConfig): { dispose: () => void } {
    const instance: LspInstance = {
      client: new LspClient(config),
      bridge: null,
      config,
      openDocs: new Set(),
      idleTimer: null,
    };
    this.instances.set(languageId, instance);
    return { dispose: () => this.unregisterLanguage(languageId) };
  }

  private unregisterLanguage(languageId: string): void {
    const instance = this.instances.get(languageId);
    if (!instance) return;
    this.stopClient(instance);
    this.instances.delete(languageId);
  }

  private async startClient(instance: LspInstance, languageId: string): Promise<void> {
    if (instance.idleTimer) {
      clearTimeout(instance.idleTimer);
      instance.idleTimer = null;
      return;
    }
    await instance.client.start();
    if (this.monaco) {
      instance.bridge = new MonacoBridge(this.monaco, instance.client, languageId);
      instance.bridge.register();
    }
  }

  private stopClient(instance: LspInstance): void {
    instance.bridge?.dispose();
    instance.bridge = null;
    instance.client.shutdown();
  }

  private scheduleIdleKill(instance: LspInstance): void {
    if (instance.idleTimer) clearTimeout(instance.idleTimer);
    instance.idleTimer = setTimeout(() => {
      if (instance.openDocs.size === 0) {
        this.stopClient(instance);
      }
    }, 5 * 60 * 1000);
  }

  async onEditorEvent(event: string, data: any): Promise<void> {
    const uri = data?.uri || this.activeUri;
    if (!uri) return;
    if (!uri.endsWith(".py")) return;

    const instance = this.instances.get("python");
    if (!instance) return;

    if (event === "open" || event === "active") {
      this.activeUri = uri;
      if (event === "open") {
        instance.openDocs.add(uri);
        if (instance.openDocs.size === 1) {
          await this.startClient(instance, "python");
        }
        this.documentTexts.set(uri, data.text ?? "");
        instance.client.openDocument(uriToMonaco(uri), data.text ?? "", ++this.version);
      }
    } else if (event === "change") {
      instance.openDocs.add(uri);
      this.documentTexts.set(uri, data.text ?? "");
      instance.client.changeDocument(uriToMonaco(uri), data.text ?? "", ++this.version);
    } else if (event === "close") {
      instance.openDocs.delete(uri);
      this.documentTexts.delete(uri);
      instance.client.closeDocument(uriToMonaco(uri));
      if (instance.openDocs.size === 0) {
        this.scheduleIdleKill(instance);
      }
    }
  }

  async shutdownAll(): Promise<void> {
    for (const [id, instance] of this.instances) {
      this.stopClient(instance);
    }
    this.instances.clear();
  }
}

function uriToMonaco(path: string): string {
  return "file://" + path.replace(/\\/g, "/");
}

export const lspManager = new LspManager();
```

- [ ] **Step 2: Fix the `using` import — update the reference**

Wait, `uriToMonaco` is needed — it's already in the code above.

---

### Task 7: Barrel Export

**Files:**
- Create: `src/lib/lsp/index.ts`

- [ ] **Step 1: Export LSP modules**

```typescript
export { lspManager } from "./manager";
export type { LspConfig } from "./types";
```

---

### Task 8: Add extensionDir to ExtensionAPI Types

**Files:**
- Modify: `src/extensions/types.ts`

- [ ] **Step 1: Add extensionDir to the API type**

```typescript
export interface ExtensionAPI {
  extensionDir: string;
  // ... existing fields
}
```

Find the `ExtensionAPI` interface and add the field.

---

### Task 9: Create api.lsp Extension API

**Files:**
- Create: `src/extensions/api/lsp.ts`

- [ ] **Step 1: Create lsp API namespace**

```typescript
import { lspManager } from "@/lib/lsp";
import type { LspConfig } from "@/lib/lsp";
import type { Disposable } from "../types";

export function createLspApi(monaco: any): { register: (languageId: string, config: LspConfig) => Disposable } {
  if (monaco) {
    lspManager.setMonaco(monaco);
  }
  return {
    register(languageId: string, config: LspConfig): Disposable {
      return lspManager.registerLanguage(languageId, config);
    },
  };
}
```

---

### Task 10: Wire api.lsp into Extension API

**Files:**
- Modify: `src/extensions/api/index.ts`

- [ ] **Step 1: Import and add lsp to the API**

```typescript
import { createLspApi } from "./lsp";
```

Find where `api` object is assembled and add:
```typescript
lsp: createLspApi(api.monaco),
```

- [ ] **Step 2: Pass extensionDir to createAPI**

Modify `createAPI` to accept `extensionDir: string` parameter and assign:
```typescript
const api: ExtensionAPI = {
  extensionDir,
  // ... rest
};
```

---

### Task 11: Pass extensionDir from Host

**Files:**
- Modify: `src/extensions/host.ts`

- [ ] **Step 1: Pass extension directory to createAPI**

Find where `createAPI(id)` is called. Change to:
```typescript
const extensionDir = extInfo.dirPath; // from scan result
const extensionApi = createAPI(id, extensionDir);
```

Modify the `activateExtension` function signature or resolve the extension directory from scanned info.

---

### Task 12: Bundled Python Extension

**Files:**
- Create: `resources/extensions/python/package.json`
- Create: `resources/extensions/python/index.js`

- [ ] **Step 1: Create extension manifest**

```json
{
  "name": "python",
  "displayName": "Python Language Support",
  "version": "1.0.0",
  "main": "index.js"
}
```

- [ ] **Step 2: Create extension code**

```javascript
const binDir = api.extensionDir + "/bin";
const ext = process.platform === "win32" ? ".exe" : "";
api.lsp.register("python", {
  binaryPath: binDir + "/pyright" + ext,
  args: ["--stdio"],
  initializeOptions: {}
});
```

---

### Task 13: First-Launch Extension Bundler

**Files:**
- Create: `src/lib/extensionBundler.ts`

- [ ] **Step 1: Create bundler**

```typescript
export async function ensureBundledExtensions(extDir: string): Promise<void> {
  // On first launch, bundled extensions in Tauri resources are copied
  // to the user's extension directory.
  // This is a no-op if extensions already exist (user-managed).
}
```

This reads from Tauri resources directory and copies to `extDir`.

---

### Task 14: Tauri Config for Resources

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add resources path**

```json
{
  "bundle": {
    "resources": ["resources/extensions/**/*"]
  }
}
```

---

### Task 15: Pyright Binary Build Script

**Files:**
- Create: `scripts/copy-pyright.js`

- [ ] **Step 1: Copy Pyright binary**

```javascript
const fs = require("fs");
const path = require("path");

const platform = process.platform;
let binaryName;
if (platform === "win32") binaryName = "pyright-win32-x64.exe";
else if (platform === "darwin") {
  binaryName = process.arch === "arm64" ? "pyright-darwin-arm64" : "pyright-darwin-x64";
} else binaryName = "pyright-linux-x64";

const src = path.join(__dirname, "..", "node_modules", "pyright", "dist", binaryName);
const destDir = path.join(__dirname, "..", "resources", "extensions", "python", "bin");
const dest = path.join(destDir, platform === "win32" ? "pyright.exe" : "pyright");

if (!fs.existsSync(src)) {
  console.error("Pyright binary not found at", src);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
fs.chmodSync(dest, 0o755);
console.log("Copied pyright binary to", dest);
```

- [ ] **Step 2: Add npm scripts**

In `package.json`:
```json
{
  "scripts": {
    "copy-pyright": "node scripts/copy-pyright.js",
    "postinstall": "node scripts/copy-pyright.js"
  }
}
```

---

### Self-Review Checklist

After implementation, verify:
- [ ] `tsc --noEmit` passes (no type errors)
- [ ] `npx eslint .` has 0 errors
- [ ] `cargo check` passes in src-tauri
- [ ] Pyright binary is copied to `resources/extensions/python/bin/`
- [ ] Python extension is in Tauri resources config
- [ ] Extension loads and registers on app startup
- [ ] Opening a `.py` file spawns Pyright process
- [ ] Completions, hover, go-to-definition work in `.py` files
- [ ] Closing all `.py` files kills Pyright after idle timeout
