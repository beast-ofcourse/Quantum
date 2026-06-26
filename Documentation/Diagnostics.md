# Diagnostics System

A modular, provider-based diagnostics engine inspired by VS Code and Zed. Replaces the current ad-hoc `diagnosticStore` + `ProblemsPanel` with a proper layered architecture.

---

## 1. Architecture Overview

```
                    DiagnosticsService
                    (central orchestrator)
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
     LspProvider     CompilerProvider   CustomProvider
     (Monaco)        (build output)     (ESLint, AI, ...)
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                   DiagnosticsStore
                   (Zustand — single source of truth)
                           │
            ┌──────────────┼──────────────┬──────────────┐
            ▼              ▼              ▼              ▼
       ProblemsPanel   StatusBar     MarkerManager   ExplorerBadges
       (search,        (counts by     (editor          (file node
        filter,         severity,      squiggles,       decoration)
        navigate)       click→panel)   gutter, ruler)
```

### Design Principle

The store is the **sole source of truth**. Providers push diagnostics into the store. UI components and the MarkerManager read from the store. No component talks directly to a provider.

This decouples three concerns:
- **Collection** (providers) — how diagnostics are gathered
- **Storage** (store) — how they're organized and queried
- **Presentation** (panels, editor, status bar) — how they're displayed

---

## 2. Module Catalog

### `src/core/diagnostics/Diagnostic.ts`

The foundational type. Defines `Severity` enum and `Diagnostic` interface.

```typescript
enum Severity {
  Hint = 1,    // blue, informational
  Info = 2,    // blue, informational
  Warning = 4, // yellow, amber
  Error = 8,   // red
}

interface Diagnostic {
  path: string;          // absolute file path
  line: number;          // 1-based
  column: number;        // 1-based
  endLine: number;       // 1-based, optional
  endColumn: number;     // 1-based, optional
  severity: Severity;
  message: string;
  source: string;        // "typescript", "pylsp", "eslint", "build"
  code?: string | number; // error code from the tool
  quickFixes?: QuickFix[];
}

interface QuickFix {
  message: string;
  edit: {
    path: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    newText: string;
  };
}
```

### `src/core/diagnostics/DiagnosticProvider.ts`

Interface every provider implements.

```typescript
interface DiagnosticProvider {
  readonly id: string;              // unique name, e.g. "typescript-lsp"
  readonly label: string;           // display name, e.g. "TypeScript LSP"

  /** Returns all current diagnostics from this source. */
  getDiagnostics(): Diagnostic[];

  /**
   * Subscribe to changes. Returns unsubscribe function.
   * Called by DiagnosticsService on register().
   */
  onDidChange(callback: () => void): () => void;

  /** Optional: called when the service wants a fresh pull. */
  refresh?(): Promise<void>;

  /** Optional: called when the service disposes. */
  dispose?(): void;
}
```

### `src/core/diagnostics/DiagnosticsService.ts`

Central manager. Lifecycle:

1. Providers register with `registerProvider(provider)`
2. Service calls `provider.getDiagnostics()` and pushes to `DiagnosticsStore`
3. On `provider.onDidChange()`, re-pulls and re-merges
4. Merged result pushed to store via one `set()` call

```typescript
class DiagnosticsService {
  registerProvider(provider: DiagnosticProvider): void;
  unregisterProvider(id: string): void;
  refresh(): Promise<void>;
  getDiagnostics(): Diagnostic[];
  getByFile(): Map<string, Diagnostic[]>;
  getCounts(): { errors: number; warnings: number; infos: number; hints: number };
  dispose(): void;
}
```

**Merge rules (deduplication):**
- Same path + line + column + message + source = same diagnostic
- When two providers report the same file, diagnostics are concatenated
- No deduplication across different sources (a file can have both LSP and ESLint errors)

### `src/core/diagnostics/DiagnosticsStore.ts`

Zustand store. Read by all UI components. No component imports a provider.

```typescript
interface DiagnosticsState {
  // Flat list
  diagnostics: Diagnostic[];

  // Computed indexes (updated on every set)
  byFile: Record<string, Diagnostic[]>;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;

  // Actions
  setDiagnostics: (diagnostics: Diagnostic[]) => void;
  clearDiagnostics: (source?: string) => void;
  clearFile: (path: string) => void;
}
```

**Key behavior:** `setDiagnostics()` replaces the entire list. Providers push full snapshots, not deltas. This prevents stale diagnostics from lingering when a file is closed or a provider restarts.

### `src/core/diagnostics/LspProvider.ts`

Wraps Monaco's `monaco.editor.onDidChangeMarkers()`.

```typescript
class LspProvider implements DiagnosticProvider {
  id = "monaco-lsp";
  label = "Language Servers";

  constructor() {
    // Subscribe to monaco.editor.onDidChangeMarkers()
    // On change: read markers, map to Diagnostic[], call this._onChange()
  }

  getDiagnostics(): Diagnostic[] {
    // Read monaco.editor.getModelMarkers({}) → map to Diagnostic[]
  }

  onDidChange(cb: () => void): () => void;
}
```

This is the **bridge** between the old system (Monaco markers as source) and the new architecture. In the future, individual LSP servers can become standalone providers — but this single provider covers **all** LSP-backed languages in one file.

### `src/core/diagnostics/MarkerManager.ts`

The reverse bridge — reads from `DiagnosticsStore` and writes Monaco markers for editor squiggles, gutter icons, and overview ruler.

```typescript
class MarkerManager {
  constructor(private store: typeof useDiagnosticsStore) {}

  /** Subscribe to store changes → update Monaco markers */
  start(): void;

  /** Remove all markers */
  stop(): void;

  /** Apply currently stored diagnostics as Monaco markers */
  private apply(): void;
}
```

**Why this exists:** In the old system, Monaco markers were the source of truth. In the new system, the store is. `MarkerManager` ensures the editor **reflects** the store, not the other way around. This lets diagnostics come from non-Monaco sources (build output, ESLint, AI) and still show squiggles.

Mapping: `Diagnostic` → Monaco `editor.IMarkerData`
- `Severity.Error` → `MarkerSeverity.Error`
- `Severity.Warning` → `MarkerSeverity.Warning`
- `Severity.Info` → `MarkerSeverity.Info`
- `Severity.Hint` → `MarkerSeverity.Hint`

### `src/core/diagnostics/Events.ts`

Typed event bus for cross-module communication.

```typescript
type DiagnosticsEvent =
  | { type: "diagnostics-changed"; diagnostics: Diagnostic[] }
  | { type: "diagnostics-cleared"; source?: string }
  | { type: "provider-registered"; providerId: string }
  | { type: "provider-unregistered"; providerId: string };
```

Currently internal to the service. Exposed for future extension API use.

---

## 3. Data Flow (Detailed)

### Typing → Squiggles (LSP path)

```
User types in Monaco Editor
        │
        ▼
Language Server → textDocument/publishDiagnostics
        │
        ▼
MonacoBridge.setDiagnosticsHandler()
  → monaco.editor.setModelMarkers(model, langId, markers)
        │
        ▼
monaco.editor.onDidChangeMarkers() fires
        │
        ▼
LspProvider._onChange() → DiagnosticsService
  → LspProvider.getDiagnostics() reads markers from Monaco
  → DiagnosticsService.merge() → DiagnosticsStore.setDiagnostics()
        │
        ▼
DiagnosticsStore updates → UI re-renders
  → ProblemsPanel re-renders
  → StatusBar re-renders
  → MarkerManager.apply() → setModelMarkers() (redundant for LSP path,
     but necessary for non-LSP providers)
```

### Build → Problems (non-LSP path)

```
User runs build
        │
        ▼
CompilerProvider (future)
  → parses stdout/stderr → Diagnostic[]
  → calls DiagnosticsService
  → stored in DiagnosticsStore
        │
        ▼
MarkerManager.apply()
  → monaco.editor.setModelMarkers(model, "build", markers)
  → Squiggles appear in editor
  → Problems Panel shows them
```

---

## 4. UI Components

### ProblemsPanel (rewritten)

Current shortcomings:
- No search/filter
- No severity toggle
- Can't copy error text
- "Clear" doesn't clear LSP markers

Rewritten panel:

```
┌─────────────────────────────────────────────────┐
│ Problems  [🔍 Search…]  [🔴 5] [🟡 3] [🔵 2] [✕] │
├─────────────────────────────────────────────────┤
│                                                 │
│ ▼ src/core/diagnostics/                        │
│   🔴 line 27: Cannot find module 'react'       │
│          TypeScript  [ERRCODE:2307]             │
│   🟡 line 42: Variable 'x' is unused           │
│          TypeScript  [ERRCODE:6133]             │
│                                                 │
│ ▼ src/components/                              │
│   🔴 line 12: Type 'null' not assignable       │
│          TypeScript  [ERRCODE:2322]             │
│                                                 │
└─────────────────────────────────────────────────┘
```

Features:
- **Search bar** — filters by message text, file name, error code
- **Severity filter tabs** — All / Errors / Warnings / Info
- **Group by** — file (default), severity, none (flat list)
- **Copy error** — right-click or button copies `path:line:col - message`
- **Navigate** — click opens file at exact position
- **Quick fix** — if `quickFixes[]` present, shows lightbulb / "Fix" button

### StatusBar (updated)

```
❌ 5  ⚠️ 3  ℹ️ 2            ← instead of single total count
```

- Each severity is a clickable segment
- Click opens bottom panel and switches to Problems tab, filtered by that severity

### FileTreeNode (explorer badges)

Add diagnostic count badge next to file names:

```
src/
  core/
    diagnostics/
      Diagnostic.ts       🔴
      DiagnosticsStore.ts
      LspProvider.ts      ⚠️
```

Badge shows:
- 🔴 if file has errors
- ⚠️ if file has warnings only
- ℹ️ if file has info/hints only
- No badge if clean

---

## 5. Implementation Phases

### Phase 1 — Foundation (core models + store + service)

**Files to create:**
- `src/core/diagnostics/Diagnostic.ts`
- `src/core/diagnostics/DiagnosticProvider.ts`
- `src/core/diagnostics/DiagnosticsStore.ts`
- `src/core/diagnostics/DiagnosticsService.ts`
- `src/core/diagnostics/Events.ts`

**What works after this phase:**
- Can create `Diagnostic` objects
- Can register providers and push diagnostics to store
- Store has full computed indexes (`byFile`, counts)
- **Nothing visible in UI yet**

**Test coverage:**
- `Diagnostic` type construction
- `DiagnosticsStore` set/clear counts
- `DiagnosticsService` provider registration and merge

---

### Phase 2 — LSP Provider (bridge existing diagnostics)

**Files to create:**
- `src/core/diagnostics/LspProvider.ts`
- `src/core/diagnostics/MarkerManager.ts`

**Files to modify:**
- `src/App.tsx` — init `DiagnosticsService`, register `LspProvider`, start `MarkerManager`
- `src/lib/lsp/monacoBridge.ts` — remove direct `setModelMarkers` call (LspProvider reads from marker system instead)
- Remove `src/stores/diagnosticStore.ts` — replaced by new store
- Remove `initDiagnostics()` / `destroyDiagnostics()` calls from `MonacoEditor`

**What works after this phase:**
- All existing LSP diagnostics flow through the new store
- Editor squiggles work (via MarkerManager reading from store)
- Old store replaced — no duplicate data sources

---

### Phase 3 — Problems Panel rewrite

**Files to modify:**
- `src/components/terminal/ProblemsPanel.tsx` — full rewrite

**New features:**
- Search bar with debounced filtering
- Severity filter tabs (All / Errors / Warnings / Info)
- Group by severity option
- Copy error to clipboard
- Quick-fix button when available
- Proper clear that removes from store (not just Monaco markers)

**What works after this phase:**
- Rich interactive problems panel
- Search and filter working
- Copy and navigate working

---

### Phase 4 — StatusBar and Explorer badges

**Files to modify:**
- `src/components/layout/StatusBar.tsx`
- `src/components/explorer/FileTreeNode.tsx`

**StatusBar changes:**
- Replace single `errorCount + warningCount` with per-severity display
- Each segment clickable → opens bottom panel, filters by that severity

**Explorer badges changes:**
- Add diagnostic severity badge to file nodes
- Read from `DiagnosticsStore.byFile`
- Show 🔴/⚠️/ℹ️ based on highest severity

**What works after this phase:**
- Status bar shows rich diagnostic counts
- File explorer shows per-file diagnostic badges

---

### Phase 5 — Polish and edge cases

- Empty state illustrations
- Performance: virtualize large diagnostic lists (>1000 items)
- Performance: debounce MarkerManager updates
- Keyboard navigation in Problems Panel (↑↓→↵)
- Right-click context menu in Problems Panel (copy, copy all, clear file)

---

## 6. Migration Path

The refactor is **in-place** — the old `diagnosticStore.ts` is replaced, not parallel-run.

| Step | Action | Backward compat |
|------|--------|-----------------|
| 1 | Create new modules (`Diagnostic.ts`, `DiagnosticsStore.ts`, etc.) along side existing code | ✅ No change |
| 2 | Create `LspProvider` + `MarkerManager` | ✅ Both old and new work |
| 3 | Wire in `App.tsx`, remove old `initDiagnostics()` call | ⚠️ Must happen in same commit |
| 4 | Rewrite `ProblemsPanel` to read from new store | ⚠️ Must happen after step 3 |
| 5 | Update `StatusBar`, add explorer badges | ✅ Works independently |

**Risk:** Step 3 is the cutover point. Old `diagnosticStore` must be removed simultaneously with new `DiagnosticsService` initialization. All old consumers (`ProblemsPanel`, `StatusBar`) must be updated in the same commit.

---

## 7. Future Providers (not in scope for this refactor)

These implement `DiagnosticProvider` and register with `DiagnosticsService`:

| Provider | Source | Effort |
|----------|--------|--------|
| **CompilerProvider** | Parses build output (stderr) for `file(line,col): error MSG` patterns | 1-2 days |
| **EsLintProvider** | Run ESLint via Tauri, parse JSON output | 1-2 days |
| **WorkspaceScanner** | Scans for missing imports, unused files, circular deps | 3-5 days |
| **AiReviewProvider** | AI-powered code review via extension API | depends |

Each one plugs in with:

```typescript
diagnosticsService.registerProvider(new EsLintProvider(/* config */));
```

No UI changes needed — diagnostics appear in Problems Panel, Status Bar, Explorer badges, and editor squiggles automatically.

---

## 8. File Tree (final state)

```
src/
├── core/
│   └── diagnostics/
│       ├── Diagnostic.ts
│       ├── DiagnosticProvider.ts
│       ├── DiagnosticsStore.ts
│       ├── DiagnosticsService.ts
│       ├── Events.ts
│       ├── LspProvider.ts
│       └── MarkerManager.ts
├── components/
│   ├── terminal/
│   │   └── ProblemsPanel.tsx          ← rewritten
│   ├── layout/
│   │   └── StatusBar.tsx              ← updated
│   └── explorer/
│       └── FileTreeNode.tsx           ← updated (badges)
├── stores/
│   └── diagnosticStore.ts             ← DELETED
└── lib/
    └── lsp/
        └── monacoBridge.ts            ← simplified (remove setModelMarkers)
```
