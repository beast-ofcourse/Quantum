# Panel & Layout + Theming System Design

**Date:** 2026-06-08
**Status:** Draft → Refined (Phases 3-4 detailed)
**Project:** Quantum Code Editor

---

## 1. Overview

Add two major customization systems to Quantum:
1. **Panel & Layout** — movable panels between dock zones, multi-window, layout presets
2. **Theming** — custom color themes, icon packs, CSS injection

---

## 2. Panel & Layout System

### 2.1 Panel Registry

A central registry file (`src/lib/panelRegistry.ts`) defines every panel in the editor. Each panel is registered with its default dock zone, icon, and lazy-loaded component.

```ts
interface PanelDefinition {
  id: PanelId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
  defaultZone: DockZone;
  showInActivityBar?: boolean;  // default: false for bottom panels
}

type DockZone = "left" | "right" | "bottom";
type PanelId = string;
```

Default panels:

| ID | Title | Icon | Default Zone | Activity Bar |
|----|-------|------|-------------|-------------|
| explorer | Explorer | Files | left | yes |
| search | Search | Search | left | yes |
| git | Source Control | GitBranch | left | yes |
| extensions | Extensions | Puzzle | left | yes |
| terminal | Terminal | TerminalIcon | bottom | no |
| problems | Problems | AlertCircle | bottom | no |
| output | Output | Terminal | bottom | no |
| debug-console | Debug Console | Bug | bottom | no |

Right dock starts empty — users move panels there via context menu.

### 2.2 Dock Zones (uiStore changes)

The flat `sidebarOpen/sidebarWidth/sidebarView/terminalOpen/terminalHeight` state is replaced by a unified `zones` object:

```ts
interface DockState {
  panelIds: PanelId[];          // ordered list, e.g. ["explorer", "search", "git"]
  activePanelId: PanelId | null;
  size: number;                 // width (left/right) or height (bottom) in px
  isVisible: boolean;
}

zones: {
  left: DockState;
  right: DockState;
  bottom: DockState;
}
```

- Each dock renders its `activePanelId` component via the Panel Registry.
- A **tab strip** appears at the top of each dock when it holds multiple panels. Clicking tabs switches `activePanelId`.
- `size` is persisted via `localStorage` (same as current sidebar width).

### 2.3 Moving Panels Between Docks

Two mechanisms, **Phase 2 ships context menu first**:

1. **Context menu** (Phase 2) — right-click dock tab → "Move to Left / Right / Bottom". Updates `zones[source].panelIds` (remove) → `zones[target].panelIds` (add). If target dock was hidden, it becomes visible.
2. **Drag tab** (future) — drag panel tab between docks with visual drop indicators.

### 2.4 ShellLayout Refactoring

Old layout:
```
[ActivityBar] [Sidebar] [Resizer] [EditorArea]
                                   [BottomPanel]
                             [StatusBar]
```

New layout:
```
[ActivityBar] [LeftDock] [Resizer] [EditorArea] [Resizer] [RightDock]
                                        [Resizer]
                                        [BottomDock]
                                   [StatusBar]
```

- `Sidebar.tsx` → replaced by `LeftDock` rendering from `zones.left`
- `BottomPanel.tsx` → replaced by `BottomDock` rendering from `zones.bottom`
- New `RightDock` component on the right side
- All share a single `Dock` component parametrized by zone
- Each dock renders its own `Resizer` next to the editor area

### 2.5 ActivityBar Changes

ActivityBar continues to show the same icons (explorer, search, git, extensions) but targeting panels by ID instead of `SidebarView`:

- On click: find which dock the panel belongs to → toggle that dock's visibility + activate the panel
- If panel already active in its dock → close the dock
- Indicators show activity across ALL docks (not just left sidebar)

### 2.6 Empty Dock Auto-Hide

A dock with `panelIds: []` auto-hides (`isVisible: false`). This prevents empty frames from rendering.

### 2.7 Multi-window (Phase 3)

Detach any panel from its dock into a standalone OS window. Re-attach it back to any dock.

#### 2.7.1 Capability Requirements

Add permissions to `src-tauri/capabilities/default.json`:
```
core:window:allow-create          — create secondary WebviewWindows
core:window:allow-set-focus       — focus existing window on re-click
core:window:allow-center          — center on first open
core:window:allow-set-size        — restore saved geometry
core:window:allow-set-position    — restore saved position
core:window:allow-close           — close child windows
core:window:allow-destroy         — cleanup on main window close
core:webview:allow-create-webview-window
core:window:allow-set-always-on-top
```

**Windows array** in capabilities must be widened from `["main"]` to `["main", "panel-*"]` (or omitted to allow all).

#### 2.7.2 Detached Window Tracking

Add to `uiStore`:

```ts
detachedWindows: Record<PanelId, string>;  // panelId → Tauri window label

detachPanel(panelId: PanelId): void;       // remove from dock → create WebviewWindow
attachPanel(panelId: PanelId, zone: DockZone): void;  // close window → add to dock
focusDetachedPanel(panelId: PanelId): void;            // focus existing window
```

- Window label convention: `"panel-{panelId}"` (e.g. `"panel-terminal"`)
- When a panel is detached, it's removed from its dock's `panelIds` (same as moving out)
- When re-attached, it's added back to the target dock's `panelIds`

#### 2.7.3 URL-Based Routing for Secondary Windows

Secondary windows navigate to `{appUrl}?panel={panelId}`. The React app detects this at root level:

```
/?panel=terminal  → renders StandalonePanelShell (no menu, no activity bar)
                  ← ShellLayout
```

Detection in `App.tsx`:
```ts
const params = new URLSearchParams(window.location.search);
const standalonePanel = params.get("panel");
if (standalonePanel) {
  render(<StandalonePanelShell panelId={standalonePanel} />);
} else {
  render(<ShellLayout />);
}
```

#### 2.7.4 StandalonePanelShell Component

`src/components/layout/StandalonePanelShell.tsx`:

```
┌──────────────────────┐
│ TitleBar (native)     │
│ ┌──────────────────┐ │
│ │ PanelRenderer      │ │
│ │ (full height)      │ │
│ └──────────────────┘ │
└──────────────────────┘
```

- Uses only `TitleBar` (decorations: false, so custom title bar is needed)
- Renders `PanelRenderer` with the panel ID in a full-height container
- Listens for Tauri events from the main window:
  - `theme-changed` → update CSS variables
  - `file-changed` / `git-changed` → refresh panel data (panels subscribe to stores directly)
- Emits no events itself (it's a read-only view)

#### 2.7.5 WebviewWindow Creation

```ts
// In DetachPanelService or directly in uiStore action:
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

async function detachPanel(panelId: string, zone: DockZone) {
  // 1. Remove from dock
  const state = useUiStore.getState();
  state.removePanelFromDock(panelId, zone);

  // 2. Restore saved geometry or use defaults
  const saved = loadPanelWindowPos(panelId);
  const webview = new WebviewWindow(`panel-${panelId}`, {
    url: `/?panel=${panelId}`,
    title: getPanelDefinition(panelId)?.title ?? panelId,
    width: saved?.width ?? 500,
    height: saved?.height ?? 400,
    x: saved?.x,
    y: saved?.y,
    center: !saved,
    decorations: false,
  });

  // 3. Wait for creation
  await webview.once("tauri://created");

  // 4. Track in store
  state.registerDetachedWindow(panelId, `panel-${panelId}`);
}
```

#### 2.7.6 State Sync Protocol

Main window → child windows via Tauri `emit`:

| Event | Payload | When |
|-------|---------|------|
| `theme-changed` | `{ themeName: string, cssVars: Record<string, string> }` | Theme change |
| `app-closing` | `{}` | Main window close → closes children |

Child windows listen on mount via `listen()` and clean up on unmount.

**Theme sync**: Maintain the same `:root` CSS variables. Since both windows load the same app, sharing via Tauri events is sufficient.

**Store-based sync**: Panels (e.g. terminal, problems) subscribe directly to Zustand stores. Since each window has its own JS context, stores are NOT shared. Child windows get a fresh store instance. Panels that need data from the main window (e.g., explorer file tree) should use Tauri events or access the filesystem directly.

**Decision**: For Phase 3, secondary windows are *display-only* for panels that work with local state (terminal, problems, output, debug-console). Panels requiring shared state (explorer, git, search) remain dock-only for now. This is documented and can be lifted later with a more sophisticated state sync layer.

#### 2.7.7 Context Menu Changes

Update `DockTab.tsx` context menu:

```
Move to Left          ← existing
Move to Right         ← existing
Move to Bottom        ← existing
──────────────────────
Open in New Window    ← NEW (always shown for docked panels)
──────────────────────
Close                 ← existing (remove from dock)
```

When panel is already detached, the "Open in New Window" item is hidden (no panel tab exists in any dock).

#### 2.7.8 ActivityBar for Detached Panels

When a panel is detached and its ActivityBar icon is clicked:
1. If the detached window exists → focus it (`windowLabel.setFocus()`)
2. If the detached window was closed → re-attach the panel to its default dock and toggle visibility

Implementation in `ActivityBar.tsx`:
```ts
async function handlePanelClick(panelId: string) {
  const { detachedWindows, focusDetachedPanel, togglePanel, zones } = useUiStore.getState();
  if (detachedWindows[panelId]) {
    await focusDetachedPanel(panelId);
  } else {
    togglePanel(panelId);
  }
}
```

#### 2.7.9 Window Geometry Persistence

Save/Restore helper in `src/lib/panelWindowPositions.ts`:

```ts
interface PanelWindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  monitor?: string;  // future: track which monitor
}

const STORAGE_KEY = "quantum-panel-window-geometry";

function savePanelWindowPos(panelId: string, geo: PanelWindowGeometry): void;
function loadPanelWindowPos(panelId: string): PanelWindowGeometry | null;
function clearPanelWindowPos(panelId: string): void;
```

- Saved on `onResized` / `onMoved` events via `getCurrentWebviewWindow().onResized()`, `onMoved()`
- Restored when `new WebviewWindow(...)` is created
- Cleared when panel is re-attached

#### 2.7.10 Cleanup on App Close

In `App.tsx`, before destroying the main window:
```ts
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Emit app-closing to all child windows
await getCurrentWebviewWindow().emit("app-closing");
// Child windows listen and self-close
```

Each child window's `StandalonePanelShell` listens:
```ts
listen("app-closing", () => {
  getCurrentWebviewWindow().close();
});
```

### 2.8 Layout Presets (Phase 4)

Save/load snapshots of the full `zones` state. Built-in presets are read-only factories; custom presets are user-saved.

#### 2.8.1 Type Changes

Add `"Layout"` to `CommandCategory` in `src/types/commands.ts`:
```ts
export type CommandCategory =
  | "File" | "Edit" | "View" | "Terminal" | "Git"
  | "Help" | "Settings" | "Extension" | "Layout";
```

#### 2.8.2 uiStore Additions

Add to persisted state:
```ts
savedPresets: Record<string, Zones>;  // user-saved presets (replayable)

// Actions:
savePreset(name: string): void;       // snapshot current zones → savedPresets[name]
loadPreset(name: string): void;       // replace zones with savedPresets[name] or built-in
deletePreset(name: string): void;     // remove from savedPresets
getPresetNames(): string[];           // ["Default", "Minimal", "Git Review", ...]
```

`partialize` includes `savedPresets` for persistence.

#### 2.8.3 Built-in Presets (Factory Functions)

Defined in `src/lib/layoutPresets.ts`:

```ts
export const BUILT_IN_PRESETS: Record<string, () => Pick<Zones, "left" | "right" | "bottom">> = {
  "Default": () => ({
    left: {
      panelIds: ["explorer", "search", "git", "extensions"],
      activePanelId: "explorer",
      size: 260,
      isVisible: true,
    },
    right: {
      panelIds: [],
      activePanelId: null,
      size: 260,
      isVisible: false,
    },
    bottom: {
      panelIds: ["terminal", "problems", "output", "debug-console"],
      activePanelId: "terminal",
      size: 220,
      isVisible: true,
    },
  }),

  "Minimal": () => ({
    left:  { panelIds: [], activePanelId: null, size: 260, isVisible: false },
    right: { panelIds: [], activePanelId: null, size: 260, isVisible: false },
    bottom: { panelIds: [], activePanelId: null, size: 220, isVisible: false },
  }),

  "Git Review": () => ({
    left:  { panelIds: ["explorer"], activePanelId: "explorer", size: 220, isVisible: true },
    right: { panelIds: ["git"], activePanelId: "git", size: 300, isVisible: true },
    bottom: { panelIds: [], activePanelId: null, size: 220, isVisible: false },
  }),
};
```

Built-in presets are factories (not static data) so they always produce fresh DockState objects and cannot be mutated by accident.

#### 2.8.4 savePreset / loadPreset Behavior

**Save:**
```ts
savePreset(name: string) {
  const { left, right, bottom } = useUiStore.getState().zones;
  set((state) => ({
    savedPresets: { ...state.savedPresets, [name]: { left, right, bottom } },
  }));
}
```

**Load:**
```ts
loadPreset(name: string) {
  const preset = BUILT_IN_PRESETS[name]?.() ?? savedPresets[name];
  if (preset) set({ zones: preset });
}
```

If `name` matches a built-in preset, the factory is called. Otherwise it's looked up in `savedPresets`. Unknown names are silently ignored.

#### 2.8.5 Command Palette Commands

Register in `ShellLayout.tsx` alongside existing command providers:

| Command ID | Label | Category | Action |
|-----------|-------|----------|--------|
| `layout.preset.default` | Layout: Default | Layout | `loadPreset("Default")` |
| `layout.preset.minimal` | Layout: Minimal | Layout | `loadPreset("Minimal")` |
| `layout.preset.gitReview` | Layout: Git Review | Layout | `loadPreset("Git Review")` |
| `layout.preset.save` | Layout: Save Preset | Layout | Prompt for name → `savePreset(name)` |
| `layout.preset.manage` | Layout: Manage Presets | Layout | Show QuickPick → Load / Delete selected |

#### 2.8.6 Prompt for Preset Name

`layout.preset.save` needs a name input. Two approaches:

**Approach A (simpler):** Use `window.prompt()` for Phase 4. No new dependency.

**Approach B (better):** Use the existing `api.window` extension API to show an input dialog:
```ts
const { showInput } = await import("@/extensions/api/window");
const name = await showInput({
  title: "Save Layout Preset",
  prompt: "Enter a name for this layout preset:",
  placeholder: "e.g. My Workspace",
});
if (name) useUiStore.getState().savePreset(name);
```

Use **Approach B** for consistency with the rest of the app.

#### 2.8.7 Manage Presets QuickPick

`layout.preset.manage` shows a QuickPick with all user-saved presets + a "Delete" action:

```
Select a preset to load:
  ┌──────────────────────────────┐
  │ Default (built-in)           │
  │ Minimal (built-in)           │
  │ Git Review (built-in)        │
  │ ──────────────────────────── │
  │ My Workspace                 │
  │ Debug Layout                 │
  │ ──────────────────────────── │
  │ [x] Delete a preset...       │
  └──────────────────────────────┘
```

If "Delete a preset..." is selected, show a second QuickPick of user presets only. On confirm, `deletePreset(name)` and show a confirmation toast.

Implementation uses the existing `showQuickPick` from `src/extensions/api/window.ts`:
```ts
const presets = Object.keys(useUiStore.getState().savedPresets);
const actions = [...BUILTIN_NAMES.map(n => ({ label: n, description: "built-in" })), null, ...presets.map(n => ({ label: n, description: "custom" })), null, { label: "Delete a preset...", description: "Remove a saved preset" }];
const result = await showQuickPick(actions, { title: "Load Layout Preset" });
if (result) {
  if (result.label === "Delete a preset...") {
    // Show delete quickpick
  } else {
    loadPreset(result.label);
  }
}
```

#### 2.8.8 Preset File Export (Future Enhancement)

Optional: save/load presets as `.json` files in `.quantum/layouts/`. This enables sharing presets across machines. Deferred to post-Phase 4.

#### 2.8.9 Visual Feedback

When a preset is applied:
- Show a brief toast notification: `"Layout preset '{name}' applied"`
- Provide undo capability if feasible: store previous zones before applying, show "Undo" action in toast

### 2.9 Key Architecture Decisions

- All state in `uiStore` (extended)
- Tab context menu uses existing Radix `ContextMenu` primitive
- Panels are `React.Suspense` boundaries for lazy loading
- Resize handles use existing `Resizer` component
- `BottomPanel.tsx` refactored — terminal, problems, output, debug-console each become independent registered panels

---

## 3. Theming System

### 3.1 Current State Analysis

The existing theme system is distributed across four files with hardcoded values:

| File | Role | Limitation |
|------|------|-----------|
| `src/index.css` | 3 CSS class blocks (`:root`=light, `.dark`, `.catppuccin-mocha`) | Cannot extend; `:root`=light is fragile |
| `src/lib/monaco-setup.ts` | 3 hardcoded `defineTheme()` calls | Cannot add new themes |
| `src/lib/terminal-theme.ts` | 3 hardcoded xterm `ITheme` objects | Cannot add new themes |
| `src/hooks/useTheme.ts` | Applies CSS class to `<html>` | No custom CSS variable injection |
| `src/components/editor/useMonacoTheme.ts` | Calls `editor.setTheme()` with hardcoded names | No dynamic theme support |
| `src/hooks/useTerminalTheme.ts` | Switch on 3 hardcoded themes | No dynamic theme support |

**Additional issues:**
- Two `Theme` type definitions: `types/ui.ts` has `"light"|"dark"|"catppuccin-mocha"`; `types/settings.ts` has `"light"|"dark"` only
- `catppuccin-mocha` missing from `SettingsPanel.tsx` and `MenuBar.tsx` theme selectors
- No `.quantum/` directory exists yet
- No theme JSON format or discovery mechanism

### 3.2 Type Unification

**`src/types/ui.ts`** — widen `Theme` to accept custom theme names:
```ts
export type Theme = "light" | "dark" | "catppuccin-mocha" | (string & {});
```
This allows union autocomplete for built-ins while accepting any string for custom themes.

**`src/types/settings.ts`** — remove the duplicate `general.theme` field (it only has `"light"|"dark"` and is never used as the source of truth). Replace with:
```ts
// Remove the 'theme' field from GeneralSettings.
// Theme is managed exclusively by uiStore.
// SettingsPanel should read/write useUiStore directly.
```

### 3.3 Theme JSON Schema

Theme files are JSON with three top-level sections:

```json
{
  "name": "Ocean Dark",
  "type": "dark",
  "colors": { ... },
  "tokenColors": [ ... ],
  "terminal": { ... },
  "semanticHighlighting": true
}
```

**`name`** — display name (used in UI and as lookup key)
**`type`** — `"dark"` | `"light"` (determines base color scheme and Monaco base theme)
**`colors`** — flat map of ~75 semantic color keys → hex strings
**`tokenColors`** — VS Code-compatible TextMate scope array for Monaco syntax highlighting
**`terminal`** — xterm.js color definitions (background, foreground, cursor, 16 ANSI colors)
**`semanticHighlighting`** — optional, enables Monaco semantic tokens (default: false)

#### 3.3.1 Semantic Color Keys (~75 keys)

Each key maps to a CSS custom property. Groups:

| Group | Keys | CSS Variable Pattern | Count |
|-------|------|---------------------|-------|
| Editor | background, foreground, lineHighlight, selectionBackground, selectionForeground, wordHighlight, wordHighlightStrong, findMatch, findMatchHighlight, rangeHighlight, cursorForeground, invisibles | `--editor-*` | 12 |
| Sidebar/Docks | background, foreground, border, sectionHeaderBackground, sectionHeaderForeground | `--sidebar-*` | 5 |
| Terminal | background, foreground, cursor, cursorAccent, selectionBackground, ansiBlack..ansiWhite, ansiBrightBlack..ansiBrightWhite | `--terminal-*` | 19 |
| Tabs | activeBackground, activeForeground, inactiveBackground, inactiveForeground, border, hoverBackground | `--tab-*` | 6 |
| ActivityBar | background, foreground, border, badgeBackground, badgeForeground, inactiveForeground | `--activity-*` | 6 |
| StatusBar | background, foreground, border, warningBackground, warningForeground, errorBackground, errorForeground, itemHoverBackground | `--status-*` | 8 |
| TitleBar | background, foreground, border | `--title-*` | 3 |
| Input | background, foreground, border, placeholderForeground, optionBackground, optionForeground | `--input-*` | 6 |
| List/Tree | background, foreground, hoverBackground, hoverForeground, activeBackground, activeForeground, focusBackground, focusForeground, inactiveSelectionBackground, errorForeground, warningForeground | `--list-*` | 11 |
| Button | background, foreground, hoverBackground, border, secondaryBackground, secondaryForeground, secondaryHoverBackground | `--button-*` | 7 |
| Scrollbar | sliderBackground, sliderHoverBackground, sliderActiveBackground, border | `--scrollbar-*` | 4 |
| Git | addedForeground, modifiedForeground, deletedForeground, renamedForeground, stageBackground, conflictForeground, untrackedForeground, ignoredForeground | `--git-*` | 8 |
| Diff | insertedBackground, insertedForeground, removedBackground, removedForeground, border | `--diff-*` | 5 |
| Panel/Output | background, foreground, border, inputBorder, sectionBorder | `--panel-*` | 5 |
| Badge | background, foreground | `--badge-*` | 2 |
| Extension | buttonBackground, buttonForeground, buttonHoverBackground | `--extension-*` | 3 |
| Breadcrumb | background, foreground, focusForeground | `--breadcrumb-*` | 3 |
| Snippet | tabStopBackground, finalTabStopBackground | `--snippet-*` | 2 |
| Watermark | background, foreground | `--watermark-*` | 2 |

**Minimum viable set (~40 keys):** A minimal theme JSON needs only 40 keys (editor, sidebar, terminal, tabs, activity, status, button, scrollbar, list). All missing keys fall back to the current CSS class values.

#### 3.3.2 `tokenColors` Format (Monaco)

```json
"tokenColors": [
  {
    "name": "Comment",
    "scope": ["comment", "punctuation.definition.comment"],
    "settings": { "foreground": "#6c7086", "fontStyle": "italic" }
  },
  {
    "name": "String",
    "scope": "string",
    "settings": { "foreground": "#a6e3a1" }
  }
]
```

Same format as VS Code `tokenColors`. Passed to Monaco `monaco.editor.defineTheme()`.

#### 3.3.3 `terminal` Section Format (xterm)

```json
"terminal": {
  "background": "#1e1e2e",
  "foreground": "#cdd6f4",
  "cursor": "#f5e0dc",
  "cursorAccent": "#1e1e2e",
  "selectionBackground": "#45475a80",
  "ansiBlack": "#45475a",
  "ansiRed": "#f38ba8",
  "ansiGreen": "#a6e3a1",
  "ansiYellow": "#f9e2af",
  "ansiBlue": "#89b4fa",
  "ansiMagenta": "#f5c2e7",
  "ansiCyan": "#94e2d5",
  "ansiWhite": "#bac2de",
  "ansiBrightBlack": "#585b70",
  "ansiBrightRed": "#f38ba8",
  "ansiBrightGreen": "#a6e3a1",
  "ansiBrightYellow": "#f9e2af",
  "ansiBrightBlue": "#89b4fa",
  "ansiBrightMagenta": "#f5c2e7",
  "ansiBrightCyan": "#94e2d5",
  "ansiBrightWhite": "#a6adc8"
}
```

### 3.4 Built-in Theme Registry

Built-in themes are stored as static JSON constants (not files) in `src/lib/builtinThemes.ts`. Each is a hardcoded `ThemeDefinition` object following the same schema as file-based themes:

```ts
export const BUILTIN_THEMES: ThemeDefinition[] = [
  { name: "Dark", type: "dark", colors: { ... }, tokenColors: [...], terminal: {...} },
  { name: "Light", type: "light", colors: { ... }, tokenColors: [...], terminal: {...} },
  { name: "Catppuccin Mocha", type: "dark", colors: { ... }, tokenColors: [...], terminal: {...} },
];
```

These replace the hardcoded CSS class blocks and separate Monaco/terminal theme definitions. The `type` field determines:
- Monaco base: `"dark"` → `"vs-dark"`, `"light"` → `"vs"`
- Tailwind `color-scheme`: `"dark"` → dark, `"light"` → light

### 3.5 Theme Types

New type file: `src/types/theme.ts`

```ts
export interface ThemeDefinition {
  name: string;
  type: "dark" | "light";
  colors: Partial<Record<ThemeColorKey, string>>;
  tokenColors?: TokenColorEntry[];
  terminal?: TerminalTheme;
  semanticHighlighting?: boolean;
}

export type ThemeColorKey = string;  // e.g. "editor.background", "sidebar.foreground"

export interface TokenColorEntry {
  name?: string;
  scope: string | string[];
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
}

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  ansiBlack: string;
  ansiRed: string;
  ansiGreen: string;
  ansiYellow: string;
  ansiBlue: string;
  ansiMagenta: string;
  ansiCyan: string;
  ansiWhite: string;
  ansiBrightBlack: string;
  ansiBrightRed: string;
  ansiBrightGreen: string;
  ansiBrightYellow: string;
  ansiBrightBlue: string;
  ansiBrightMagenta: string;
  ansiBrightCyan: string;
  ansiBrightWhite: string;
}
```

### 3.6 Theme Service (`themeService.ts`)

Singleton service at `src/lib/themeService.ts`:

```ts
class ThemeService {
  private themes: Map<string, ThemeDefinition> = new Map();
  private builtinLoaded = false;

  /** Register built-in themes */
  private loadBuiltins(): void;

  /** Scan `.quantum/themes/*.json` via Tauri fs API */
  async scanUserThemes(): Promise<void>;

  /** Get all available themes (built-in + user) */
  getAllThemes(): ThemeDefinition[];

  /** Get theme by name (returns undefined for unknown) */
  getTheme(name: string): ThemeDefinition | undefined;

  /** Apply a theme by name — the core action */
  applyTheme(name: string): void;

  /** Convert ThemeDefinition → CSS custom property string */
  toCSSVars(def: ThemeDefinition): Record<string, string>;

  /** Convert ThemeDefinition → Monaco IStandaloneThemeData */
  toMonacoTheme(def: ThemeDefinition): monaco.editor.IStandaloneThemeData;

  /** Convert ThemeDefinition → xterm ITheme */
  toTerminalTheme(def: ThemeDefinition): TerminalTheme;

  /** Start file watcher on `.quantum/themes/` for hot-reload */
  startWatching(): Promise<() => void>;
}
```

**`applyTheme(name)` flow:**
1. Look up theme by name in registry
2. Generate CSS vars → set on `document.documentElement.style`
3. Generate Monaco theme → `monaco.editor.defineTheme(monacoId, data)` → `monaco.editor.setTheme(monacoId)`
4. Generate xterm theme → iterate all terminal instances → `term.options.theme = xtermTheme`
5. Set `colorScheme` on `<html>` based on `type`
6. Update `uiStore.theme` with the theme name

**CSS variable injection strategy:**
- Built-in themes: continue using CSS class on `<html>` (e.g. `<html class="dark">`)
- Custom/user themes: inject via `document.documentElement.style.setProperty(key, value)` for each color
- Built-in CSS classes remain as fallback defaults when a custom theme omits certain keys
- On switching from custom→builtin: clear `style` properties, set CSS class
- On switching from builtin→custom: remove CSS class, set `style` properties

### 3.7 `useThemeManager` Hook

**Replaces** `useTheme.ts` (CSS), `useMonacoTheme.ts` (Monaco), `useTerminalTheme.ts` (xterm) — single hook at `src/hooks/useThemeManager.ts`:

```ts
export function useThemeManager() {
  const themeName = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const isBuiltin = themeName === "light" || themeName === "dark" || themeName === "catppuccin-mocha";

  useEffect(() => {
    const service = ThemeService.getInstance();
    service.applyTheme(themeName);
  }, [themeName]);

  return {
    currentTheme: themeName,
    availableThemes: ThemeService.getInstance().getAllThemes(),
    setTheme,
    isBuiltin,
  };
}
```

**Migration from existing hooks:**
- `useTheme.ts` → delete, logic absorbed into `ThemeService.applyTheme()` + `useThemeManager`
- `useMonacoTheme.ts` → delete, Monaco theme setting absorbed into `ThemeService.applyTheme()` (which calls `defineTheme` + `setTheme`)
- `useTerminalTheme.ts` → delete, xterm theme setting absorbed into `ThemeService.applyTheme()`
- All call sites (`ShellLayout.tsx`, `StandalonePanelShell.tsx`, `MonacoEditor.tsx`, `Terminal.tsx`) switch to `useThemeManager()`
- `SetupMonaco.ts` — the `defineTheme` calls for the 3 hardcoded themes move into `ThemeService.loadBuiltins()`

### 3.8 Discovery Mechanism

**User themes location:** `.quantum/themes/<name>.json`

**Discovery flow:**
1. On app startup, `ThemeService.scanUserThemes()` is called
2. In Tauri: uses `@tauri-apps/plugin-fs` to check if `.quantum/themes/` directory exists, then reads all `*.json` files
3. In browser dev mode: no-op (user themes not available without Tauri)
4. Each JSON is parsed and validated against the schema
5. Invalid themes are logged but do not crash discovery
6. Results are merged with built-in themes (user themes override built-ins with same name)

**Hot-reload flow:**
1. On initial scan, start a file watcher on `.quantum/themes/*.json`
2. On file change: re-parse the changed file
3. If the changed theme is currently active → re-apply it
4. If the changed theme has errors → keep the previous version, log the error

### 3.9 Theme Application Edge Cases

| Scenario | Behavior |
|----------|----------|
| Theme name not found | Fall back to `"dark"`, log warning |
| Theme JSON malformed | Log error, keep current theme |
| Terminal not yet mounted | Store theme, apply when terminal mounts |
| Monaco editor not yet mounted | Store theme, apply when editor mounts (via subscription) |
| Custom theme omits keys | Omitted keys use CSS fallback from current class (`:root`/`.dark`/`.catppuccin-mocha`) |
| Theme file deleted while active | Keep current state, try fallback to built-in on next change |

### 3.10 Theme Editor (Phase 6)

Modal UI for creating/editing color themes. Opened via command palette (`theme.edit`).

#### 3.10.1 Component Structure

```
src/
  components/
    theme/
      ThemeEditor.tsx         — modal wrapper, tab/group navigation
      ColorGroup.tsx          — collapsible section for one color group
      ColorField.tsx          — single color input (hex + color picker)
      ThemeEditorToolbar.tsx  — Start from, Save, Export, Reset buttons
      ThemePreview.tsx        — live preview panel showing sample UI
```

#### 3.10.2 Modal Layout

```
┌─────────────────────────────────────────────────────┐
│ Theme Editor — Ocean Dark                      [X] │
├────────────────┬────────────────────────────────────┤
│                │                                    │
│  ▸ Editor      │  Editor Background                 │
│  ▸ Sidebar     │  [───#1e1e2e───] [■]              │
│  ▸ Terminal    │  Editor Foreground                 │
│  ▸ Tabs        │  [───#cdd6f4───] [■]              │
│  ▸ ActivityBar │  Line Highlight                    │
│  ▸ StatusBar   │  [───#313244───] [■]              │
│  ▸ TitleBar    │  Selection Background              │
│  ▸ Input       │  [───#45475a───] [■]              │
│  ▸ List/Tree   │  ...                               │
│  ▸ Button      │                                    │
│  ▸ Scrollbar   │  [Reset Group]                     │
│  ▸ Git         │                                    │
│  ▸ Panel       │                                    │
│                │                                    │
├────────────────┴────────────────────────────────────┤
│ Start from: [Dark ▼]   [Save] [Export] [Reset All]  │
└─────────────────────────────────────────────────────┘
```

#### 3.10.3 Interaction

- **Left sidebar**: Collapsible color groups. Click expands/collapses.
- **Right area**: Color fields for the selected group. Scrollable.
- **Color field**: Label + hex input (editable text) + native `<input type="color">` swatch. Changing either updates the other.
- **Live preview**: Theme changes are applied in real-time as the user edits. The editor modal is semi-transparent or side-by-side so underlying UI reflects changes.
- **Start from dropdown**: Choose a base theme (Dark, Light, Catppuccin Mocha, or previously saved custom). Populates all colors from that theme.
- **Save**: Writes to `.quantum/themes/<name>.json` via Tauri fs plugin.
- **Export**: Downloads as `<name>.json` file (for browser mode).
- **Reset Group**: Resets all colors in the current group to their original values in the base theme.
- **Reset All**: Resets all colors to the base theme.
- **Close [X]**: Prompt to save if unsaved changes exist.

#### 3.10.4 Color Groups (11 groups, ~75 fields)

| Group | Keys | Count |
|-------|------|-------|
| Editor | editor.background, .foreground, .lineHighlight, .selectionBackground, .selectionForeground, .wordHighlight, .wordHighlightStrong, .findMatch, .findMatchHighlight, .rangeHighlight, .cursorForeground, .invisibles | 12 |
| Sidebar/Docks | sidebar.background, .foreground, .border, .sectionHeaderBackground, .sectionHeaderForeground | 5 |
| Terminal | terminal.background, .foreground, .cursor, .cursorAccent, .selectionBackground, ansiBlack..ansiWhite, ansiBrightBlack..ansiBrightWhite | 19 |
| Tabs | tab.activeBackground, .activeForeground, .inactiveBackground, .inactiveForeground, .border, .hoverBackground | 6 |
| ActivityBar | activity.background, .foreground, .border, .badgeBackground, .badgeForeground, .inactiveForeground | 6 |
| StatusBar | status.background, .foreground, .border, .warningBackground, .warningForeground, .itemHoverBackground | 7 |
| TitleBar | title.background, .foreground, .border | 3 |
| Input Controls | input.background, .foreground, .border, .placeholderForeground, .optionBackground, .optionForeground | 6 |
| List/Tree | list.background, .foreground, .hoverBackground, .hoverForeground, .activeBackground, .activeForeground, .focusBackground, .focusForeground, .errorForeground, .warningForeground | 10 |
| Button | button.background, .foreground, .hoverBackground, .border, .secondaryBackground, .secondaryForeground, .secondaryHoverBackground | 7 |
| Scrollbar | scrollbar.sliderBackground, .sliderHoverBackground, .sliderActiveBackground, .border | 4 |
| Git Decorations | git.addedForeground, .modifiedForeground, .deletedForeground, .conflictForeground | 4 |

Total: ~89 fields (including terminal ANSI). The "minimum viable" set of 40 common fields are marked as primary; the rest are advanced/collapsible.

#### 3.10.5 Save Mechanism

```ts
async function saveTheme(def: ThemeDefinition): Promise<void> {
  // 1. Prompt for name if new: "Save theme as: [Ocean Dark]"
  // 2. Serialize to JSON with 2-space indent
  const json = JSON.stringify(def, null, 2);
  // 3. Write to .quantum/themes/<name>.json
  // In Tauri: use @tauri-apps/plugin-fs writeTextFile
  // In browser: use localStorage fallback
  // 4. Register the theme in ThemeService
  // 5. Apply it
}
```

#### 3.10.6 Unsaved Changes Detection

Track a `dirty` flag. Set `dirty = true` on any color change. On close:
- If `dirty`: show "Save changes before closing?" dialog (Save / Discard / Cancel)
- If `!dirty`: close immediately

#### 3.10.7 Token Colors Section (Deferred)

Full token color editing (TextMate scope tree, foreground/background/fontStyle per scope) is complex and deferred. Phase 6 ships only:
- Ability to view the `tokenColors` JSON as read-only text
- "Edit token colors" button → opens a JSON editor
- Full GUI editing of token colors → post-Phase 6

### 3.11 Icon Packs (Phase 7)

JSON mapping file extensions → icon names. Dropped in `.quantum/icons/`. Default pack built-in.

#### 3.11.1 Icon Pack Format

```json
{
  "name": "Minimal Icons",
  "version": "1.0.0",
  "icons": {
    ".ts": "typescript",
    ".tsx": "react-ts",
    ".js": "javascript",
    ".jsx": "react",
    ".json": "json",
    ".md": "markdown",
    "folder": "folder-default",
    "folder-src": "folder-src",
    "file-default": "file"
  }
}
```

#### 3.11.2 Service

`iconPackService.ts` — singleton that:
- Discovers `.quantum/icons/*.json` files
- Resolves icon name → lucide-react icon component
- Provides `getIcon(filePath)` which matches by extension then falls back to `file-default`
- Provides `getFolderIcon(dirPath)` which matches by folder name patterns
- Built-in pack as default
- Hot-reload via file watcher

### 3.12 CSS Injection (Phase 7)

`.quantum/custom.css` injected at load time. Hot-reload via existing filesystem watcher.

#### 3.12.1 Injection Mechanism

```ts
class CSSInjector {
  private styleEl: HTMLStyleElement | null = null;

  async load(): Promise<void> {
    // 1. Read .quantum/custom.css via Tauri fs
    // 2. Create <style id="quantum-custom-css"> in <head>
    // 3. Set content to file content
    // 4. Start file watcher for hot-reload
  }

  async reload(): Promise<void> {
    // Re-read file, replace style content
  }

  dispose(): void {
    // Remove style element, stop watcher
  }
}
```

#### 3.12.2 Specificity

Custom CSS is injected last (after all theme CSS), with `!important` disallowed by convention. The injected stylesheet has `data-qa="custom-css"` attribute for debug identification.

---

## 4. File Structure Changes

### 4.1 Phases 1-2

```
src/
  types/
    panelRegistry.ts      NEW — PanelDefinition, DockZone, PanelId, DockState types
    theme.ts              NEW — ThemeDefinition, ThemeColorKey, TokenColorEntry, TerminalTheme
    icons.ts              NEW — IconPack, IconDefinition types

  lib/
    panelRegistry.ts      NEW — central panel registry with all built-in panels
    themeService.ts       NEW — singleton theme service (apply, convert, scan, watch)
    builtinThemes.ts      NEW — Dark, Light, Catppuccin Mocha as ThemeDefinition constants
    iconPackService.ts    NEW — singleton icon pack discovery + resolution
    cssInjector.ts        NEW — custom CSS injection + hot-reload

  stores/
    uiStore.ts            MODIFIED — zones state replacing flat sidebar/terminal state

  hooks/
    useThemeManager.ts    NEW — replaces useTheme + useMonacoTheme + useTerminalTheme
    useTheme.ts           DELETED — absorbed into useThemeManager
    useTerminalTheme.ts   DELETED — absorbed into useThemeManager

  components/
    layout/
      Dock.tsx            NEW — generic dock rendering with tab strip
      LeftDock.tsx        NEW — left dock zone wrapper
      RightDock.tsx       NEW — right dock zone wrapper
      BottomDock.tsx      NEW — bottom dock zone wrapper
      DockTab.tsx         NEW — individual dock tab with context menu
      DockTabs.tsx        NEW — tab strip for a dock
      PanelRenderer.tsx   NEW — resolves PanelId → component and renders it
      ActivityBar.tsx     MODIFIED — targets panels by ID, supports multiple docks
      ShellLayout.tsx     MODIFIED — renders LeftDock, RightDock, BottomDock
      BottomPanel.tsx     MODIFIED — replaced by BottomDock; TerminalPanel extracted
    terminal/
      TerminalPanel.tsx   NEW — extracted from BottomPanel, standalone terminal content
      useMonacoTheme.ts   DELETED — absorbed into useThemeManager
    sidebar/
      Sidebar.tsx         DELETED — replaced by Dock + LeftDock
    theme/
      ThemeEditor.tsx     NEW — full modal with group nav + color fields
      ColorGroup.tsx      NEW — collapsible color group section
      ColorField.tsx      NEW — hex input + color picker swatch
      ThemeEditorToolbar.tsx  NEW — start from, save, export, reset
      ThemePreview.tsx    NEW — live preview panel
```

---

## 5. Implementation Phases

### Phase 1: Panel Registry + Dock Infrastructure
- Create types: `PanelDefinition`, `DockZone`, `PanelId`, `DockState`
- Create `panelRegistry.ts` with all built-in panels
- Extend `uiStore` with `zones` replacing flat sidebar/terminal state
- Create `DockTab.tsx`, `DockTabs.tsx`, `Dock.tsx`, `PanelRenderer.tsx`
- Create `LeftDock.tsx`, `RightDock.tsx`, `BottomDock.tsx`
- Create `TerminalPanel.tsx` (extracted from BottomPanel)
- Update `ShellLayout.tsx` with new layout
- Update `ActivityBar.tsx` to target panels by dock

### Phase 2: Move Panels Between Docks
- Add right-click context menu on dock tabs (Move to Left/Right/Bottom)
- Add `movePanel` action to uiStore
- Handle edge cases (move last panel, auto-hide empty dock)
- ActivityBar indicators show panels active in any dock

### Phase 3: Multi-window
- Add capability permissions (`allow-create`, `allow-set-focus`, etc.) to `capabilities/default.json`
- URL-based routing (`/?panel=panelId`) in `App.tsx`
- Create `StandalonePanelShell.tsx` — full-height panel in secondary window
- Add `detachedWindows` tracking + `detachPanel`/`attachPanel`/`focusDetachedPanel` to `uiStore`
- Implement `WebviewWindow` creation with geometry restore
- Add "Open in New Window" to `DockTab` context menu
- Implement Tauri event sync (`theme-changed`, `app-closing`)
- Create `panelWindowPositions.ts` for geometry persistence
- App-close cleanup (emit `app-closing` → children self-close)

### Phase 4: Layout Presets
- Add `"Layout"` to `CommandCategory` in `commands.ts`
- Create `layoutPresets.ts` with built-in preset factory functions
- Add `savedPresets` state + `savePreset`/`loadPreset`/`deletePreset` to `uiStore`
- Register Layout commands in `ShellLayout.tsx` (Default, Minimal, Git Review, Save, Manage)
- Implement save-prompt via existing `showInput` API
- Implement preset browser via existing `showQuickPick` API (load + delete)
- Toast notification on preset apply

### Phase 5: Theme System
- Unify `Theme` type in `types/ui.ts` (widen to `string & {}`) and remove `general.theme` from `types/settings.ts`
- Create `src/types/theme.ts` — `ThemeDefinition`, `ThemeColorKey`, `TokenColorEntry`, `TerminalTheme`
- Create `src/lib/themeService.ts` — singleton service with `applyTheme()`, `toCSSVars()`, `toMonacoTheme()`, `toTerminalTheme()`, `scanUserThemes()`, `startWatching()`
- Create `src/lib/builtinThemes.ts` — 3 built-in themes as `ThemeDefinition` constants (Dark, Light, Catppuccin Mocha)
- Create `src/hooks/useThemeManager.ts` — replaces `useTheme.ts` + `useMonacoTheme.ts` + `useTerminalTheme.ts`
- CSS variable injection strategy: classes for built-in, `style.setProperty()` for custom
- Switch `ShellLayout.tsx`, `StandalonePanelShell.tsx`, `MonacoEditor.tsx`, `Terminal.tsx` to `useThemeManager()`
- Delete old hooks: `useTheme.ts`, `useMonacoTheme.ts`, `useTerminalTheme.ts`
- Remove hardcoded `defineTheme()` calls from `monaco-setup.ts` (move to `ThemeService.loadBuiltins()`)
- Remove hardcoded xterm theme objects from `terminal-theme.ts` (move to `builtinThemes.ts`)
- Fix `SettingsPanel.tsx` and `MenuBar.tsx` to show all themes and read from `uiStore.theme`
- Auto-discovery from `.quantum/themes/` (Tauri fs) with caching and error handling
- Hot-reload via file watcher on `.quantum/themes/*.json`

### Phase 6: Theme Editor
- Create `ThemeEditor.tsx` — full-page modal with left group nav + right color fields
- Create `ColorGroup.tsx` — collapsible section for one group (e.g. "Editor", "Terminal")
- Create `ColorField.tsx` — hex input + native `<input type="color">` swatch
- Create `ThemeEditorToolbar.tsx` — Start from dropdown, Save, Export, Reset All buttons
- Create `ThemePreview.tsx` — live preview panel showing sample code/text
- 11 color groups with ~89 fields (including 19 terminal colors)
- Unsaved changes detection (dirty flag + save prompt on close)
- Save writes to `.quantum/themes/<name>.json` via Tauri fs or localStorage fallback
- Export downloads as JSON file (browser-compatible)
- Token colors section: read-only JSON view only (full GUI deferred)
- Register `theme.edit` command in command palette

### Phase 7: Icon Packs + CSS Injection
- Create `src/types/icons.ts` — `IconPack`, `IconDefinition` types
- Create `src/lib/iconPackService.ts` — singleton that discovers `.quantum/icons/*.json`, resolves to lucide-react icons
- Built-in default icon pack
- File extension → icon name mapping with folder pattern matching
- Create `src/lib/cssInjector.ts` — reads `.quantum/custom.css`, injects as `<style>`, hot-reloads
- File watcher integration for both icon packs and CSS
