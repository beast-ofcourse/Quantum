# Performance Plan: Instant Startup + Large File Support

**Date:** 2026-06-27
**Goal A:** Cold startup <1s (interactive shell)
**Goal B:** 100MB+ files open without freezing

---

## A. Instant Startup (<1s)

**Diagnosis:** Shell renders slow because too many module-level imports, eager component mounts, and synchronous IPC chains block the main thread before first paint.

### A1 — Lazy Panel Imports
**Problem:** `panelRegistry.tsx` eagerly imports all 9 panels (FileTree 586 lines, SearchSidebar, GitSidebar, ExtensionsSidebar, TerminalPanel, ProblemsPanel, OutputPanel, MarkdownPreview, OutlinePanel) at module top. Their full import chains resolve at startup, even though only Explorer is visible.

**Fix:** Replace static imports with `Map<string, () => Promise<{ default: ComponentType }>>`. Only load `FileTree` eagerly (always visible on left dock). Others load on first navigation to that panel.

**Files:** `src/lib/panelRegistry.tsx`
**Effort:** ~30 min

### A2 — Remove Duplicate Session Restore
**Problem:** Both `App.tsx` useEffect and `ShellLayout.tsx` useEffect call `loadSession()` + `openFile()` for each persisted tab, doubling file-read IPC calls at startup.

**Fix:** Remove the duplicate call. Keep it in `ShellLayout.tsx` (runs after shell renders).

**Files:** `src/App.tsx`
**Effort:** 5 min

### A3 — Lazy Hidden Modals
**Problem:** CommandPalette, ShortcutCheatSheet, SettingsPanel, ThemeEditor, CloseConfirmDialog are always mounted in the DOM tree with visibility toggled via CSS/state. Their hooks and component trees initialize at startup.

**Fix:** Wrap each in `React.lazy()` + `<Suspense>`. Only mount when their respective state is toggled on.

**Files:** `src/components/layout/ShellLayout.tsx`
**Effort:** 15 min

### A4 — Defer Extension Host Init
**Problem:** `initExtensionHost()` runs eagerly on mount: `ensureBundledExtensions()` → `scanExtensions()` → for each extension: `readFile` + `blob URL` + `dynamic import()` + `activate()` with 10s timeout. This chain fires even with zero user extensions (still scans bundled).

**Fix:** Wrap in `requestIdleCallback()` with 2s timeout fallback. UI interactive before extensions start scanning.

**Files:** `src/App.tsx`
**Effort:** 5 min

### A5 — Defer Non-Urgent CSS/Icon Init
**Problem:** `initCSSInjector()` and `IconPackService.scanUserPacks()` each fire 2-3 IPC calls on startup.

**Fix:** Move to `requestIdleCallback()` alongside extension host init.

**Files:** `src/App.tsx`
**Effort:** 5 min

### A6 — Preload Monaco Chunk
**Problem:** Monaco bundle (~2MB) is loaded only on first file open via `React.lazy()`. User sees loading skeleton while browser fetches + parses the chunk.

**Fix:** Add `<link rel="modulepreload" href="/assets/monaco-{hash}.js">` to `index.html` so browser pre-fetches Monaco while React shell renders.

**Files:** `index.html`
**Effort:** 1 line

### A7 — Unify Monaco Import
**Problem:** `monaco-entry.ts` imports from `monaco-editor/esm/vs/editor/editor.all.js`. `bootstrap.ts` imports from `monaco-editor` bare package. Vite may create two separate module graph traversals.

**Fix:** Pass the monaco instance from `monaco-entry.ts` to `bootstrap.ts` instead of letting it import bare package.

**Files:** `src/lib/monaco-entry.ts`, `src/core/completion/bootstrap.ts`
**Effort:** 15 min

### A8 — Defer Cursor Trail
**Problem:** `useCursorTrail(".editor-area")` registers a `mousemove` listener at startup for cosmetic particle trail effect.

**Fix:** Defer attachment to `requestIdleCallback`.

**Files:** `src/components/layout/ShellLayout.tsx`
**Effort:** 5 min

---

## B. 100MB+ Files Without Freezing

**Diagnosis:** No file size check before load (full file into Rust string → IPC → JS), no Monaco performance config for large files, all editor features run at full power on every document regardless of size.

### B1 — Pre-Read Size Check
**Problem:** `editorStore.openFile()` calls `readFile(path)` directly. Tauri Rust backend calls `std::fs::read_to_string()` which loads entire file into memory. For 100MB+ files, this can OOM the Rust process or freeze.

**Fix:** Rust `read_file` command does `std::fs::metadata()` first. If >10MB, return `{ size: u64, truncated: true, content: first_10mb_string }`. JS receives structured response, never allocates the full string. Show truncated content with banner.

**Files:** `src-tauri/src/commands/fs.rs`, `src/tauri/fs.ts`, `src/stores/editorStore.ts`
**Effort:** ~30 min

### B2 — Large File Monaco Config
**Problem:** Monaco performance features not configured for large files. `largeFileOptimizations` (Monaco 0.52+) not set. `maxTokenizationLength` defaults to infinite. All visual features run at full power.

**Fix:** When `isLargeFile`, override editor options:
```ts
largeFileOptimizations: true,
maxTokenizationLength: 50000,
bracketPairColorization: { enabled: false },
stickyScroll: { enabled: false },
folding: false,
renderLineHighlight: "line",
smoothScrolling: false,
cursorSmoothCaretAnimation: "off",
inlayHints: { enabled: "off" },
wordWrap: "off",
minimap: { enabled: false },
```

**Files:** `src/components/editor/MonacoEditor.tsx`
**Effort:** 15 min

### B3 — ContentStore LRU Eviction
**Problem:** `ContentStore` is a plain `Map<string, string>` with no eviction policy. Opening 10 files >100MB each = 1GB+ memory.

**Fix:** Bounded LRU cache — max 5 entries or 200MB total. Use access-order tracking (double Map approach or simple sorted timestamps).

**Files:** `src/lib/contentStore.ts`
**Effort:** 30 min

### B4 — Git Gutter Guard
**Problem:** `useGitGutterDecorations` calls `git diff` for the file and creates per-line decoration objects for every changed line. On 100MB file with 10K+ changes, creates 10K+ decoration objects.

**Fix:** Skip if file is large (`isLargeFile` or file size threshold).

**Files:** `src/hooks/useGitGutterDecorations.ts`
**Effort:** 5 min

### B5 — Format-On-Save Guard
**Problem:** `editorStore.ts` format-on-save handler calls `editor.action.formatDocument` which freezes for seconds on large files.

**Fix:** Skip format if `isLargeFile`. Show warning toast.

**Files:** `src/stores/editorStore.ts`
**Effort:** 5 min

### B6 — Language Services Guard
**Problem:** `registerDefinitionProvider()`, `registerLanguageCompletions()`, `registerHoverProvider()` register unconditionally. For large files, these services scan the model on every trigger.

**Fix:** Skip registration if `isLargeFile`.

**Files:** `src/components/editor/MonacoEditor.tsx`
**Effort:** 5 min

### B7 — Diagnostics Guard
**Problem:** `initDiagnostics()` calls `monaco.editor.getModelMarkers({})` on every `onDidChangeMarkers` event, iterating every marker across every open model. Large files with many tokens generate many markers.

**Fix:** Skip if large file.

**Files:** `src/stores/diagnosticStore.ts`
**Effort:** 5 min

---

## Status

### ✅ Done (2026-06-27)
- **A2** — Removed duplicate session restore from App.tsx (ShellLayout's copy kept)
- **A3** — Lazy modals: CommandPalette, ShortcutCheatSheet, SettingsPanel, ThemeEditor → React.lazy + conditional mount
- **B2** — Large file Monaco config: largeFileOptimizations, maxTokenizationLength, dsiabled bracket/smoothScroll/folding/stickyScroll/inlayHints
- **B4** — Git gutter guard: skip decorations for files with `isLargeFile` flag
- **B5** — Format-on-save guard: skip format if `tab.isLargeFile`
- **B6** — Language services guard: skip definition/completion/hover/diagnostics registration for large files
- **B7** — Diagnostics guard: handled as part of B6 (same guard in handleMount)

### 🚧 Not Started
- **A1** — Lazy panel imports (panelRegistry.tsx)
- **A4** — Defer extension host to requestIdleCallback
- **A5** — Defer CSS/icon init to requestIdleCallback
- **A6** — Preload Monaco chunk (needs Vite plugin for hashed filenames)
- **A7** — Unify Monaco import
- **A8** — Defer cursor trail
- **B1** — Pre-read size check in Rust
- **B3** — ContentStore LRU eviction

## Effort Summary

| Phase | Items | Files | Est. Time | Status |
|-------|-------|-------|-----------|--------|
| **Quick wins** | A2, A3, B2, B4, B5, B6, B7 | ~8 files | ~2-3 hours | ✅ Done |
| **Medium** | A1, B1, B3 | ~4 files | ~1.5 hours | 🚧 |
| **Polish** | A4, A5, A6, A7, A8 | ~4 files | ~30 min | 🚧 |

---

## Key Decisions

1. **Large file threshold**: 5MB (matches current `isLargeFile` detection)
2. **Truncated load threshold**: 10MB — Rust returns first 10MB + metadata instead of full file
3. **ContentStore LRU bounds**: 5 entries OR 200MB, whichever hits first
4. **Extension deferral**: Extensions activate ~2s after interactive UI
5. **Large file UX**: Banner saying "Large file — some features disabled" with details
