# Language Server Protocol (LSP)

Quantum IDE features a built-in client for the **Language Server Protocol (LSP)**. By implementing the LSP client specification, Quantum decouples code intelligence logic from the editor interface. This allows any standard language server to feed diagnostics, autocomplete suggestions, and tooltips directly into the Monaco Editor.

---

## 1. LSP Client Architecture

The language server connection runs through a multi-tier bridge:

```
+--------------------+           Monaco Bridge          +--------------------+
|   Monaco Editor    | <==============================> |    LspManager      |
| (React UI Layer)   |                                  |   (TypeScript)     |
+--------------------+                                  +--------------------+
                                                                  ||
                                                            Tauri Command
                                                                  ||
                                                                  \/
                                                        +--------------------+
                                                        | Tauri Rust Backend |
                                                        |    (LSP Host)      |
                                                        +--------------------+
                                                                  ||
                                                            JSON-RPC / PTY
                                                                  ||
                                                                  \/
                                                        +--------------------+
                                                        |  Language Server   |
                                                        | (pyright, gopls)   |
                                                        +--------------------+
```

1. **Document Syncing:** When a file is opened, modified, or closed, the `LspManager` notifies the Rust backend. The backend updates the language server using standard LSP synchronization commands (`textDocument/didOpen`, `textDocument/didChange`, `textDocument/didClose`).
2. **Monaco Bridge:** When a user triggers autocomplete or hover cards inside Monaco, the request is intercepted by Monaco providers registered by `LspManager`. These providers request suggestions from the language server and translate the JSON-RPC response back into Monaco-readable schemas.

---

## 2. Server Lifecycle Management

Quantum automatically handles the execution state of language servers to conserve system resources:

* **Auto-Start:** Opening a file with a registered language extension (e.g., a `.py` file) triggers the Rust backend to check if the language server is running. If not, it spawns the server process automatically.
* **Idle Auto-Kill:** If no files of a specific language are open for an extended period (configurable, defaults to `10 minutes`), the editor sends a shutdown request to the language server and terminates the process to save memory.
* **Status Updates:** The active status of language servers is monitored and displayed in the Status Bar (e.g., "Pyright: Active" or "gopls: Spawning").

---

## 3. Pyright Integration

Quantum includes **Pyright** as a built-in, first-party language server for Python:

* **Bundling:** Pyright is compiled and bundled into the IDE packages during builds using the `npm run copy-pyright` script. This ensures Python code completions work out-of-the-box without requiring manual node module installations.
* **Configuration:** Quantum searches your workspace root for a `pyrightconfig.json` file. If found, it feeds configuration paths (like `venvPath`, `pythonPath`, and `exclude` rules) directly to the server on startup.

---

## 4. Registering Custom Language Servers

The Quantum Extension API allows developers to write extensions that register language servers for any language.

An extension registers an LSP server by calling the `lsp.register` module inside its `activate` function:

```javascript
export function activate(api) {
  // Register Rust Analyzer language server for .rs files
  const lspProvider = api.lsp.register("rust", {
    command: "rust-analyzer",
    args: [],
    options: {
      initializationOptions: {
        cargo: {
          allFeatures: true
        }
      }
    }
  });

  // Clean up when the extension is deactivated
  return () => {
    lspProvider.dispose();
  };
}
```

### Configuration Options
* **command:** The executable name or absolute path of the language server (must be accessible in the system path or inside the extension bundle).
* **args:** command-line arguments to feed the server (e.g., `["--stdio"]`).
* **initializationOptions:** Configuration parameters sent to the server during the handshake phase.
