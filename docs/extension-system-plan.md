# Extension System Plan

Users write JS extensions and drop them in a folder. We scan, load, and give them an API.

---

## Extension Format

Extensions live in `~/.code-editor/extensions/`. Two formats supported:

### Full (recommended)
```
my-extension/
├── package.json    # { name, version, main: "index.js" }
└── index.js        # export function activate(api) { ... return () => cleanup }
```

### Minimal (no package.json)
```
my-extension/
└── index.js        # export function activate(api) { ... }
```
- Name derived from folder name
- Version defaults to `0.0.1`
- Main defaults to `index.js`

Users can `git clone` any extension repo directly into this folder.

---

## Extension API

```ts
interface ExtensionAPI {
  commands: {
    register(id: string, handler: (...args: any[]) => any): Disposable;
    execute(id: string, ...args: any[]): Promise<any>;
  };
  editor: {
    onOpen(cb: (doc: Document) => void): Disposable;
    onClose(cb: (doc: Document) => void): Disposable;
    onSave(cb: (doc: Document) => void): Disposable;
    onChange(cb: (e: ChangeEvent) => void): Disposable;
    onDidChangeActiveEditor(cb: (doc: Document | null) => void): Disposable;
    onDidChangeCursorPosition(cb: (e: CursorEvent) => void): Disposable;
    getActiveDocument(): Document | null;
    openFile(path: string): Promise<void>;
  };
  window: {
    showInfo(msg: string): void;
    showWarn(msg: string): void;
    showError(msg: string): void;
    showInput(prompt: string): Promise<string | null>;
    showQuickPick(items: string[], placeHolder?: string): Promise<string | null>;
  };
  statusBar: {
    create(opts: {
      text: string;
      alignment?: "left" | "right";
      priority?: number;       // higher = more left (default: 0)
      tooltip?: string;
      command?: string;        // command id to execute on click
    }): StatusBarItem;
  };
  views: {
    register(id: string, opts: {
      title: string;
      icon?: string;           // lucide icon name
      render: () => HTMLElement;
      onDispose?: () => void;
    }): Disposable;
  };
  settings: {
    get(key: string): any;
    set(key: string, value: any): void;
    onChanged(cb: (key: string, value: any) => void): Disposable;
  };
  fs: {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    listDir(path: string): Promise<string[]>;
    exists(path: string): Promise<boolean>;
  };
  monaco: {
    editor: typeof monaco.editor;
    languages: typeof monaco.languages;
    getEditor(): monaco.editor.IStandaloneCodeEditor | null;
  };
  storage: {
    get(key: string): any;
    set(key: string, value: any): void;
  };
}
```

### Extension lifecycle

```ts
// The extension exports activate() and optionally deactivate()
export function activate(api: ExtensionAPI) {
  // Use the API to register commands, hook events, etc.

  // Return a cleanup function (optional)
  return () => {
    // All Disposables returned by API calls auto-cleanup on deactivation
    // This is for any custom cleanup
  };
}
```

Key pattern: every `register*()` / `on*()` call returns a `Disposable`. When the extension is deactivated (reloaded, disabled, removed), ALL disposables are disposed automatically.

---

## Phase 1 — Foundation✅✅✅

### 1.1 Create extension types
`src/extensions/types.ts`

- `ExtensionManifest` — name, version, main, displayName, description
- `ExtensionAPI` — full interface
- `Disposable` — `{ dispose(): void }` + static `from(fn)` factory
- `ExtensionInfo` — manifest + isActive + error? + path
- `StatusBarItem` — `{ text: string; dispose(): void }`
- `Document` — `{ path: string; language: string; content: string; isDirty: boolean }`

### 1.2 Create extension scanner
`src/extensions/scanner.ts`

- `scanExtensions()` walks `~/.code-editor/extensions/`
- For each folder: look for `package.json`, fall back to minimal detection
- Auto-create `~/.code-editor/extensions/` on first run (if missing)
- Resolve `~` via Tauri IPC `resolve_home`
- Validate required fields, skip invalid ones with log
- Return `ExtensionManifest[]` with absolute paths

### 1.3 Create extension loader
`src/extensions/loader.ts`

- **Loading problem**: Extensions are files on disk. Browsers can't `import()` local files.
- **Solution**: Read via Tauri IPC → create `Blob` URL → `import()` from blob:

```ts
async function loadExtension(modPath: string) {
  const { read_file } = await import("@/tauri/fs");
  const content = await read_file(modPath);
  const blob = new Blob([content], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(url);
    return mod;
  } finally {
    URL.revokeObjectURL(url);  // Clean up after import caches the module
  }
}
```

- Handle both ESM (`export function activate`) and any module format
- Wrap import in try/catch, return error instead of throwing

### 1.4 Create extension API builder
`src/extensions/api.ts`

- `buildAPI(context: APIContext): ExtensionAPI` — constructs the full API object
- Each namespace is a separate factory function (files in `api/` dir)
- `APIContext` carries:
  - Command palette integration method
  - Editor store reference
  - Settings store reference
  - Monaco module reference (set after Monaco loads)
  - Disposable collector (all disposables are tracked for cleanup)

### 1.5 Create extension host
`src/extensions/host.ts`

- `init()` — called once on app startup
  - Ensure extensions folder exists
  - Scan for extensions
  - Activate each one
- `activateExtension(info: ExtensionManifest)`:
  - Build API object (fresh per extension)
  - Load main file via `loadExtension()`
  - Call `mod.activate(api)`, capture return value as cleanup function
  - Track all disposables created during activation
  - On error: set `info.error`, log details, continue
- `deactivateExtension(id: string)`:
  - Call cleanup function
  - Dispose all tracked disposables
  - Remove commands from palette, remove status items, etc.
- `reloadExtension(id: string)` — deactivate + activate
- All errors caught — one broken extension never blocks others

### 1.6 Create extension store
`src/extensions/store.ts`

```ts
interface ExtensionStore {
  extensions: Map<string, ExtensionInfo>;
  actions: {
    scan: () => Promise<void>;
    reload: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
  };
}
```

- Zustand store
- `scan()` calls scanner + activates new ones, deactivates removed ones
- `remove()` deletes folder from disk, removes from state
- Persist active/disabled state to localStorage (optional)

### 1.7 Wire into app
`src/App.tsx`

- In a `useEffect` on mount:
  - Wait for Monaco to load (capture the ref)
  - Store Monaco ref in `APIContext`
  - Call `host.init()`
- No blocking — Monaco and extensions load in parallel

### 1.8 CSP update
`src-tauri/tauri.conf.json`

- Current CSP: `script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:`
- Already has `blob:` — good, no changes needed for blob URL imports

### 1.9 Create Extensions sidebar
`src/components/extensions/ExtensionsSidebar.tsx`

- List all installed extensions
- Each card shows: name, version, active/inactive badge
- Red error badge with tooltip if activation failed
- Action buttons: Reload, Remove
- "Open Extensions Folder" button (reveals in file explorer via Tauri)
- "Install from GitHub" input (Phase 4 — placeholder for now)
- Replace the placeholder in `Sidebar.tsx`

### 1.10 Create "Hello World" starter template
`src/extensions/template.ts`

- Bundled template that users can scaffold
- Content:
```js
export function activate(api) {
  api.window.showInfo("Hello from my extension!");

  const cmd = api.commands.register("myExt.hello", () => {
    api.window.showInfo("Hello World!");
  });

  const status = api.statusBar.create({
    text: "My Extension Active",
    alignment: "right"
  });

  api.editor.onSave((doc) => {
    console.log("Saved:", doc.path);
  });

  // Return cleanup
  return () => {
    cmd.dispose();
    status.dispose();
  };
}
```

- "New Extension" button in sidebar scaffolds this into a new folder

---

## Phase 2 — Core API Implementations✅✅✅

### 2.1 Commands API
`src/extensions/api/commands.ts`

- Register command → add to CommandPalette's command list
- Unregister (dispose) → remove from CommandPalette
- `executeCommand` → look up handler, call with args
- CommandPalette already searches command list — extension commands just get added to the array
- Integration point: CommandPalette reads from a shared `Map<string, Command>` that extensions write to

### 2.2 Window API
`src/extensions/api/window.ts`

- `showInfo/showWarn/showError`:
  - Render a toast notification (use a simple portal-based toast component)
  - Auto-dismiss after 4s
  - Stack multiple toasts
- `showInput(prompt)`:
  - Render a modal overlay with text input
  - Return value or null on cancel/escape
- `showQuickPick(items, placeHolder?)`:
  - Reuse CommandPalette's search/filter component
  - Render as a modal overlay with fuzzy search
  - Return selected item or null

### 2.3 Editor API
`src/extensions/api/editor.ts`

- Event system based on a shared `EventEmitter`:
  - `onOpen` — fires when `editorStore.openFile` is called
  - `onClose` — fires when a tab is closed
  - `onSave` — fires after `editorStore.saveFile` completes
  - `onChange` — fires on Monaco model content change (debounced 300ms)
  - `onDidChangeActiveEditor` — fires on tab switch
  - `onDidChangeCursorPosition` — fires on Monaco cursor position change
- `getActiveDocument()` — reads from `editorStore.getState()`
- `openFile(path)` — delegates to `editorStore.getState().openFile(path)`
- Document events carry: `{ path, language, content, isDirty }`

### 2.4 StatusBar API
`src/extensions/api/statusBar.ts`

- Create item → add to a Zustand store array `extensionStatusItems`
- StatusBar component renders built-in items first, then extension items
- Items sorted by priority (higher = left)
- Dispose → remove from store, StatusBar re-renders
- Click handler: if `command` is set, call `commands.execute(command)`

### 2.5 Storage API
`src/extensions/api/storage.ts`

- Backed by `localStorage`
- Keys namespaced: `ext:${extName}:${key}`
- `get(key)` / `set(key, value)` — JSON serialize/deserialize values
- `onChanged` — subscribe to storage changes

### 2.6 Settings API
`src/extensions/api/settings.ts`

- `get(key)` — read from `settingsStore.getState()`, support dot notation
- `set(key, value)` — write via `settingsStore.getState().update(section, values)`
- `onChanged(cb)` — subscribe to `settingsStore`

---

## Phase 3 — Advanced API✅✅✅

### 3.1 Views API
`src/extensions/api/views.ts`

- `register(id, { title, icon, render, onDispose })`:
  - Register a custom sidebar view
  - Add to activity bar with the given lucide icon (or generic puzzle icon)
  - Create a container in the sidebar system
  - When view is active: call `render()`, mount returned `HTMLElement` into container via React ref
  - On view change or dispose: call `onDispose()`, clear container
- `ViewContainer` React component:
  - Receives HTMLElement via prop
  - `useEffect` to mount element into a `div` ref
  - `useEffect` cleanup to unmount

```tsx
function ViewContainer({ element }: { element: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = "";
      ref.current.appendChild(element);
    }
    return () => { element.remove(); };
  }, [element]);
  return <div ref={ref} className="h-full overflow-auto" />;
}
```

### 3.2 File System API
`src/extensions/api/fs.ts`

- Thin wrappers over Tauri IPC (`src/tauri/fs.ts`):
  - `readFile` → `invoke("read_file", { path })`
  - `writeFile` → `invoke("write_file", { path, content })`
  - `listDir` → `invoke("read_directory", { path })` → extract names
  - `exists` → `invoke("path_exists", { path })`
- All async, all return Promises

### 3.3 Monaco API
`src/extensions/api/monaco.ts`

- Store Monaco module reference when it's loaded (from `monaco-setup.ts`)
- `monaco.editor` — direct exposure of Monaco's editor namespace
- `monaco.languages` — direct exposure of languages namespace
- `getEditor()` — returns current `IStandaloneCodeEditor` instance from `MonacoEditor.tsx`
- This gives extensions full power:
  - Register completion/hover/formatting providers
  - Define themes
  - Add editor actions and keybindings
  - Decoration collections
  - Marker/squiggle management

---

## Phase 4 — GitHub Integration & Polish✅✅✅

### 4.1 Install from GitHub
`src/extensions/installer.ts`

- User pastes a GitHub URL
- Flow:
  1. Validate URL (must be `github.com/user/repo` or `github.com/user/repo/tree/branch`)
  2. Call GitHub API to get default branch name
  3. Download repo as ZIP: `https://api.github.com/repos/user/repo/zipball/main`
  4. Extract ZIP to `~/.code-editor/extensions/<name>/`
  5. Run scanner — new extension detected and activated

### 4.2 GitHub install UI
`src/components/extensions/InstallFromGitHub.tsx`

- Text input with placeholder: `https://github.com/user/repo`
- Validation: show green/red border on URL format
- Install button with progress indicator
- Error state: "Repository not found", "Invalid URL", "Network error"

### 4.3 Error handling polish
- Error sidebar: show extension name + error message on hover
- "View Error" button expands full stack trace
- Toast on extension crash: "Extension X crashed: {message}"
- Retry button on error state

### 4.4 Hot reload (watch mode)
- Use Tauri's `watch_directory` to watch `~/.code-editor/extensions/`
- On change: re-scan, reload affected extensions
- Or simpler: manual "Reload All" button
- Dev mode: auto-reload on every change when `NODE_ENV=development`

### 4.5 Extension template scaffolder
- "New Extension" button in Extensions sidebar
- Asks for name, description
- Creates `~/.code-editor/extensions/<name>/` with:
  - `package.json` (name, version, displayName, description)
  - `index.js` (Hello World template with basic API usage)

---

## File Structure

```
src/extensions/
├── types.ts             — All types & interfaces
├── scanner.ts           — Walk dir, read manifests
├── loader.ts            — Load JS files via Blob URL + import()
├── api.ts               — Build the full API object
├── api/
│   ├── commands.ts      — Command registration
│   ├── editor.ts        — Editor event hooks
│   ├── window.ts        — UI dialogs
│   ├── statusBar.ts     — Status bar items
│   ├── views.ts         — Sidebar views
│   ├── settings.ts      — Settings access
│   ├── fs.ts            — File system access
│   ├── monaco.ts        — Direct Monaco access
│   └── storage.ts       — Persistent key-value
├── host.ts              — Load, activate, lifecycle
├── store.ts             — Zustand store
├── template.ts          — Hello World template string
└── installer.ts         — GitHub install (Phase 4)

src/components/extensions/
├── ExtensionsSidebar.tsx     — Extension list view
├── ExtensionCard.tsx         — Individual card
├── InstallFromGitHub.tsx     — GitHub URL install (Phase 4)
└── ViewContainer.tsx         — Mount ext DOM in React (Phase 3)
```

---

## Files to modify

| File | Change |
|------|--------|
| `src/components/layout/Sidebar.tsx` | Render `ExtensionsSidebar` for `"extensions"` view & extension views for `"ext:*"` routes |
| `src/components/layout/ActivityBar.tsx` | "Extensions" icon already exists |
| `src/components/layout/StatusBar.tsx` | Render extension status bar items from store |
| `src/components/command/CommandPalette.tsx` | Include extension-registered commands |
| `src/components/editor/MonacoEditor.tsx` | Expose editor instance ref for `monaco.getEditor()` |
| `src/App.tsx` | Call `host.init()` on mount |
| `src/lib/monaco-setup.ts` | Store Monaco module ref for API |

---

## Key technical decisions

| Decision | Why |
|----------|-----|
| **Blob URL import** for loading extensions | Browsers can't `import()` local files. Tauri IPC read + Blob URL is the only clean way |
| **ESM only** | It's 2026. `import()` + Blob URL works natively with ES modules |
| **API passed as parameter, not global** | Each extension gets its own API instance with scoped state |
| **Return cleanup from activate()** | No need for `context.subscriptions` — cleaner pattern |
| **No package.json required** | Folder with `index.js` is valid — name from folder name |
| **Direct Monaco access** | Extensions can do anything Monaco supports without us building wrappers |
| **Main thread** | No Worker overhead. Extensions are user code they trust. Errors are caught. |
| **Disposable pattern everywhere** | Every registration returns a `Disposable`. Deactivation auto-cleans everything. |

---

## Build order

```
Phase 1 — Foundation
├── 1.1 types.ts
├── 1.2 scanner.ts
├── 1.3 loader.ts
├── 1.4 api.ts (stubs)
├── 1.5 host.ts
├── 1.6 store.ts
├── 1.7 Wire App.tsx
├── 1.8 CSP check
├── 1.9 ExtensionsSidebar.tsx
└── 1.10 template.ts
         ↓ TEST: extension folder appears in sidebar

Phase 2 — Core API
├── 2.1 Commands → CommandPalette
├── 2.2 Window → toasts, dialogs
├── 2.3 Editor → event hooks
├── 2.4 StatusBar → StatusBar component
├── 2.5 Storage → localStorage
└── 2.6 Settings → settingsStore
         ↓ TEST: extension can register a command and show "Hello World"

Phase 3 — Advanced API
├── 3.1 Views → sidebar view rendering
├── 3.2 FS → Tauri IPC wrappers
└── 3.3 Monaco → full Monaco access
         ↓ TEST: extension can add a sidebar view and Monaco completion provider

Phase 4 — GitHub & Polish
├── 4.1 GitHub install
├── 4.2 GitHub install UI
├── 4.3 Error polish
├── 4.4 Hot reload
└── 4.5 Extension scaffolder
         ↓ TEST: install extension from GitHub URL → it works
```
