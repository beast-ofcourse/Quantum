# Extension System

Quantum IDE is designed from the ground up to be fully extensible. It features a sandboxed Extension Host that lets developers contribute new features, register commands, customize status bar entries, add custom views, and interface directly with the Monaco Editor.

---

## 1. Extension Host Sandbox

To ensure editor stability and security, extensions run inside a sandboxed environment:

* **Isolation:** Extensions do not have direct, unguided access to the main React DOM tree or browser globals that could freeze the editor. Instead, they interact with the IDE through a strictly defined JavaScript `api` interface passed during activation.
* **Lifecycle Hooks:** Every extension must export an `activate` function. This function receives the Quantum API object. Extensions can return a cleanup function (typically containing disposables) which Quantum calls when the extension is disabled or reloaded.
* **Hot-Reloading:** During development, Quantum watches the `~/.quantum/extensions/` directory. When an extension's file changes, Quantum automatically calls its cleanup/deactivate hook, unregisters its components, and re-activates the extension. This allows developers to see changes instantly without restarting the editor.

---

## 2. Extension Manifest (`package.json`)

Each extension must contain a manifest file named `package.json` at its root. This file contains metadata and informs Quantum how and when to load the extension.

### Example Manifest
```json
{
  "name": "prettier-formatter",
  "displayName": "Prettier Formatter",
  "description": "Formats your code using Prettier",
  "version": "1.0.0",
  "main": "dist/index.js",
  "activationEvents": [
    "onLanguage:javascript",
    "onLanguage:typescript"
  ],
  "contributes": {
    "commands": [
      {
        "command": "prettier.formatDocument",
        "title": "Format Document (Prettier)"
      }
    ],
    "views": [
      {
        "id": "prettierSettings",
        "title": "Prettier Settings",
        "icon": "settings"
      }
    ]
  }
}
```

---

## 3. Extension API Reference

When an extension is activated, its `activate(api)` function receives an entry API object. The table below lists the core modules available on the `api` namespace:

| Module | Core Methods | Description |
| :--- | :--- | :--- |
| **`commands`** | `register(id, callback)`, `execute(id, ...args)` | Registers custom editor commands that can be bound to keyboard shortcuts or run via the command palette. |
| **`editor`** | `activeEditor`, `onDidSave()`, `onDidChangeCursor()` | Provides access to active editor documents, selection offsets, and document change notifications. |
| **`window`** | `showInfo(msg)`, `showError(msg)`, `showQuickPick(options)` | Shows notifications, prompts, warning dialogs, and customizable quick-select dropdown lists. |
| **`statusBar`** | `createItem(text, alignment, priority)` | Adds items, status indicators, and text buttons into the main Status Bar. |
| **`views`** | `registerViewProvider(id, provider)` | Registers custom sidebar panels and web views into the activities layout docks. |
| **`settings`** | `get(key)`, `set(key, val)`, `onDidChange(callback)` | Interfaces with user configuration profiles to store preferences. |
| **`fs`** | `read(path)`, `write(path, data)`, `exists(path)` | Secure workspace file-system utilities wrapper. |
| **`storage`** | `get(key)`, `set(key, val)` | Provides key-value state persistence scoped to the specific extension. |
| **`monaco`** | Access to `monaco` global instance | Grants advanced access to register autocomplete providers, themes, and Monaco styling directly. |
| **`lsp`** | `register(languageId, config)` | Registers and launches custom language servers for language parsing. |

---

## 4. Example Extension Code

Here is a simple extension demonstrating how to register a command and add a status bar item:

```javascript
// dist/index.js

export function activate(api) {
  console.log("My extension has been activated!");

  // 1. Register a command
  const commandDisposable = api.commands.register("myExtension.sayHello", () => {
    api.window.showInfo("Hello World from Quantum Extension Host!");
  });

  // 2. Add a status bar item
  const statusBarItem = api.statusBar.createItem("Extension Active", "left", 100);
  statusBarItem.show();

  // 3. Return cleanup disposal hook
  return () => {
    commandDisposable.dispose();
    statusBarItem.dispose();
    console.log("My extension has been cleaned up.");
  };
}
```

---

## 5. Extension Marketplace

Quantum includes a built-in Extension Manager:

* **Installation Options:**
  * **Built-in Seed List:** Access popular packages directly (Prettier, ESLint, Python, Rust Analyzer, GitHub Copilot, Tailwind CSS support).
  * **Install from GitHub:** Provide a GitHub repository URL (e.g. `github.com/user/extension-name`). Quantum downloads the repo, resolves dependencies, and mounts it into the local extensions folder.
  * **VS Code Marketplace:** Fetch and extract compatible `.vsix` packages directly from the marketplace registry.
* **Management UI:** Enable, disable, configure, or uninstall extensions through the extensions activity view.
