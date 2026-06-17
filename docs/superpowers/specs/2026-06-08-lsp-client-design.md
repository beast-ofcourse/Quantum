# LSP Client — Design Spec

**Date:** 2026-06-08
**Status:** Draft
**Target:** Python language support via Pyright LSP, bundled in app

---

## Goal

Add standard-level Python IntelliSense (completions, hover, go-to-definition, signature help, inline diagnostics) by building a reusable LSP client core and a thin bundled Python extension.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   App Core (src/lib/lsp/)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐    │
│  │transport │──│  client  │──│  monacoBridge        │    │
│  │(Tauri    │  │(JSON-RPC)│  │(↔ Monaco providers)  │    │
│  │ shell)   │  │          │  └──────────────────────┘    │
│  └──────────┘  └──────────┘                               │
│                    │  ▲                                   │
│                    ▼  │                                   │
│  ┌──────────────────────┐                                 │
│  │      manager         │  singleton, routes events       │
│  └──────────────────────┘                                 │
└──────────────────────┬───────────────────────────────────┘
                       │ api.lsp.register("python", config)
┌──────────────────────▼───────────────────────────────────┐
│           Extension API (src/extensions/api/)              │
│  New: api.lsp namespace                                    │
└──────────────────────┬───────────────────────────────────┘
                       │ register("python", {binaryPath})
┌──────────────────────▼───────────────────────────────────┐
│      Python Extension (bundled, resources/extensions/)    │
│  Calls api.lsp.register("python", { ... })                │
└──────────────────────┬───────────────────────────────────┘
                       │ spawn stdin/stdout
┌──────────────────────▼───────────────────────────────────┐
│              Pyright Process (child)                       │
│  JSON-RPC 2.0 over stdio                                  │
└──────────────────────────────────────────────────────────┘
```

**Data flow:**
1. App starts → manager initializes, watches for LSP registrations
2. Extension activates → calls `api.lsp.register("python", { binaryPath, args, initializeOptions })`
3. User opens `.py` file → manager receives `editorBus` open event
4. Manager spawns Pyright via Tauri `Command`, sends `initialize` + `initialized`
5. Manager sends `textDocument/didOpen` with file content
6. Pyright responds with diagnostics → `monacoBridge` calls `monaco.editor.setModelMarkers()`
7. User types → `didChange` notification sent; requests (completion, hover, definition, signatureHelp) bridged through Monaco providers
8. User closes file → `didClose` notification sent
9. Extension deactivated → manager kills Pyright process

---

## Module Breakdown

### `src/lib/lsp/types.ts`
Minimal LSP protocol subset:
- Basic types: `Position`, `Range`, `Location`, `MarkupContent`, `MarkupKind`
- Protocol messages: `InitializeParams`, `InitializeResult`, `ServerCapabilities`, `DidOpenTextDocumentParams`, `DidChangeTextDocumentParams`, `DidCloseTextDocumentParams`, `TextDocumentContentChangeEvent`, `CompletionParams`, `CompletionItem`, `CompletionList`, `HoverParams`, `Hover`, `DefinitionParams`, `SignatureHelpParams`, `SignatureHelp`, `SignatureInformation`, `ParameterInformation`, `PublishDiagnosticsParams`, `Diagnostic`, `DiagnosticSeverity`
- Message envelope: `JsonRpcMessage`, `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcNotification`, `JsonRpcError`
- Constants: `Methods` enum (initialize, shutdown, textDocument/didOpen, etc.)

### `src/lib/lsp/jsonrpc.ts`
Wire protocol handler, no dependencies:
- `encodeMessage(msg)`: wraps JSON body with `Content-Length: N\r\n\r\n` headers
- `parseMessage(data)`: extracts Content-Length, parses JSON body
- `createRequest(method, params)`: returns `{id, method, params}`
- `createNotification(method, params)`: returns `{method, params}`
- `createResponse(id, result)`: returns `{id, result}`
- Stateful `MessageBuffer`: accumulates raw chunks, extracts complete messages

### `src/lib/lsp/transport.ts`
Process I/O via Tauri shell plugin:
- `SpawnedLspProcess` class wrapping Tauri `Command`
- `write(data: string)`: encodes + writes to stdin via `child.write()`
- `read(callback)`: subscribes to stdout events via `child.stdout.on('data')`
- `kill()`: terminates the process via `child.kill()`
- `onExit(callback)`: exit/error notification
- Handles stderr logging separately

### `src/lib/lsp/client.ts`
High-level LSP client, manages protocol lifecycle:
- `LspClient` class
- `initialize(workspaceUri)`: sends initialize → awaits InitializeResult → stores capabilities → sends initialized notification
- `openDocument(uri, text)`: sends didOpen notification
- `changeDocument(uri, text, version)`: sends didChange notification
- `closeDocument(uri)`: sends didClose notification
- `requestCompletions(params)`: sends completion request → awaits response → returns CompletionList
- `requestHover(params)`: sends hover request → awaits response → returns Hover
- `requestDefinition(params)`: sends definition request → awaits response → returns Location
- `requestSignatureHelp(params)`: sends signatureHelp request → awaits response → returns SignatureHelp
- `shutdown()`: sends shutdown → exit → kills process
- Internal pending request map: `Map<id, {resolve, reject, timeout}>`
- Handles incremental content sync (full text on each change for simplicity)

### `src/lib/lsp/monacoBridge.ts`
Bridges LSP to Monaco:
- `registerLanguageProviders(languageId, client)`: registers all 4 Monaco providers
  - `CompletionItemProvider`: `provideCompletionItems` → calls `client.requestCompletions()` → maps `CompletionItem[]` to Monaco format
  - `HoverProvider`: `provideHover` → calls `client.requestHover()` → maps content to Monaco `Hover`
  - `DefinitionProvider`: `provideDefinition` → calls `client.requestDefinition()` → maps to Monaco `Location`
  - `SignatureHelpProvider`: `provideSignatureHelp` → calls `client.requestSignatureHelp()` → maps to Monaco `SignatureHelp`
- `unregisterLanguageProviders(languageId)`: disposes all providers
- Subscribes to diagnostics: receives `PublishDiagnosticsParams` → calls `monaco.editor.setModelMarkers()` for the affected model

### `src/lib/lsp/manager.ts`
Singleton orchestrator:
- `registerLanguage(languageId, config)`: stores config, hooks into editorBus, creates client on first document open
- `unregisterLanguage(languageId)`: disposes providers, kills process
- Listens to `editorBus`:
  - `onOpen`: if language matches → spawn client if not running → send didOpen
  - `onChange`: send didChange with updated text
  - `onClose`: send didClose → if no more open docs, keep process alive (idle timeout)
  - `onActiveEditor`: track current URI for context
- Maintains `Map<languageId, {client, providers, config, openDocuments}>`
- Idle timeout: kills process after 5 minutes with no open documents

---

## Extension API Addition

### `src/extensions/api/lsp.ts`
```typescript
export function createLspApi(disposables: (() => void)[]) {
  return {
    register(languageId: string, config: LspConfig): Disposable {
      return manager.registerLanguage(languageId, config);
    }
  };
}
```

Added to `api.lsp` in `api/index.ts`.

### `api.extensionDir`
New property on the ExtensionAPI object. Set by the host on activation to the extension's directory path (e.g. `~/.code-editor/extensions/python/`). Lets extensions locate bundled files relative to themselves.

---

## Bundled Python Extension

### Location
- Source: `resources/extensions/python/`
- Runtime: copied to `~/.code-editor/extensions/python/` on first launch

### `package.json`
```json
{
  "name": "python",
  "displayName": "Python",
  "version": "1.0.0",
  "main": "index.js"
}
```

### `index.js`
```javascript
const binDir = api.extensionDir + "/bin";
const binaryPath = binDir + (process.platform === "win32" ? "/pyright.exe" : "/pyright");
api.lsp.register("python", {
  binaryPath,
  args: ["--stdio"],
  initializeOptions: {}
});
```

### Pyright Binary Acquisition
- Source: npm package `pyright@1.1.398` (or latest stable)
- Extracted from `node_modules/pyright/dist/` — contains platform-specific binary
- Added as a build step in `package.json` scripts (see implementation plan)
- Platform binaries: `pyright-win32-x64.exe` (Windows), `pyright-darwin-x64` (macOS Intel), `pyright-darwin-arm64` (macOS Apple Silicon), `pyright-linux-x64` (Linux)
- Renamed to `pyright.exe` / `pyright` for consistency
- Placed at `resources/extensions/python/bin/pyright(.exe)`

---

## First-Launch Installer

In `src/extensions/host.ts` (or a new `src/lib/extensionBundler.ts`):

```typescript
async function ensureBundledExtensions() {
  const extDir = await resolveHomeDir(".code-editor/extensions");
  // Copy resources/extensions/python/ to extDir/python/ if not exists
  // Preserves user modifications if extension already installed
}
```

Runs once before `scanExtensions()`. Copies bundled extension files, overwriting only if the bundled version is newer.

---

## Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| Pyright binary not found | Log warning, show toast, set extension error in store, graceful degradation (syntax highlighting still works) |
| Pyright process crashes | Auto-restart with exponential backoff (max 3 retries, 2s/4s/8s delays), show warning toast |
| JSON-RPC parse error | Log parse error, skip malformed message, continue processing |
| LSP request timeout | 10s timeout per request, reject promise gracefully, no crash |
| Multiple `.py` files open | Single Pyright process handles all via `didOpen`/`didClose` per file |
| Extension disabled | Manager unregisters language, kills process, disposes providers |
| App quit | `shutdown()` sent to Pyright → process exits cleanly |
| Invalid LSP response | Validate response shape, log mismatch, return null/empty to Monaco |
| File renamed/moved | Send `didClose` for old URI, `didOpen` for new URI (handled by editorBus change event) |

---

## Files Changed/Added

| File | Type | Purpose |
|---|---|---|
| `src/lib/lsp/types.ts` | New | LSP protocol types |
| `src/lib/lsp/jsonrpc.ts` | New | JSON-RPC wire protocol |
| `src/lib/lsp/transport.ts` | New | Tauri shell process wrapper |
| `src/lib/lsp/client.ts` | New | LSP client lifecycle, requests |
| `src/lib/lsp/monacoBridge.ts` | New | Monaco provider registrations |
| `src/lib/lsp/manager.ts` | New | Singleton orchestrator |
| `src/lib/lsp/index.ts` | New | Barrel exports |
| `src/extensions/api/lsp.ts` | New | api.lsp extension API |
| `src/extensions/api/index.ts` | Modified | Wire up api.lsp, add extensionDir to API |
| `src/extensions/host.ts` | Modified | Pass extensionDir to createAPI, call ensureBundledExtensions |
| `src/extensions/types.ts` | Modified | Add extensionDir to ExtensionAPI type |
| `resources/extensions/python/package.json` | New | Python extension manifest |
| `resources/extensions/python/index.js` | New | Python extension code |
| `resources/extensions/python/bin/.gitkeep` | New | Placeholder for pyright binary |
| `scripts/copy-pyright.js` | New | Build script to copy pyright binary from node_modules |
| `package.json` | Modified | Add postinstall/build step for pyright |
| `src-tauri/tauri.conf.json` | Modified | Add resources/extensions path |
| `src/lib/extensionBundler.ts` | New | Copies bundled extensions to user dir on first launch |

---

## Decisions Made

| Decision | Choice | Reasoning |
|---|---|---|
| Language server | Pyright | Self-contained binary, no Python runtime needed, ~7 MB, standard LSP |
| Bundling | Bundled in installer | Zero user setup, always available |
| Delivery | Core module + thin extension | Reusable architecture for future languages |
| Document sync strategy | Full text on each change | Simpler than incremental sync, negligible perf difference for typical file sizes |
| Process lifecycle | Spawn on first `.py` open, idle timeout 5 min | Balance between responsiveness and resource usage |
| Timeout | 10s per LSP request | Generous enough for heavy files, prevents hanging |
| Crash recovery | Exponential backoff, max 3 retries | Transient failures auto-recover, persistent failures surface to user |
