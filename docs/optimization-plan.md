# Project Optimization Plan

## Overview
Data-driven optimization strategy to reduce project size and improve performance without dropping any features. Based on actual build analysis of the current codebase.

---

## Current Baseline Measurements (dist/assets/)

| Asset | Uncompressed | Gzipped (est.) | % of Total | Priority |
|-------|-------------|----------------|------------|----------|
| `ts.worker-*.js` | **6.69 MB** | ~1.8 MB | 47.7% | 🔴 Critical |
| `index-*.js` (main bundle) | **4.31 MB** | ~1.2 MB | 30.8% | 🔴 Critical |
| `css.worker-*.js` | 0.98 MB | ~280 KB | 7.0% | 🟡 Medium |
| `html.worker-*.js` | 0.66 MB | ~190 KB | 4.7% | 🟡 Medium |
| `json.worker-*.js` | 0.37 MB | ~110 KB | 2.6% | 🟢 Low |
| `editor.worker-*.js` | 0.24 MB | ~70 KB | 1.7% | 🟢 Low |
| `index-*.css` | 0.18 MB | ~30 KB | 1.3% | 🟢 Low |
| Language-specific files (~50) | ~0.5 MB total | ~140 KB | 3.6% | 🟡 Medium |
| `codicon-*.ttf` | 0.12 MB | ~35 KB | 0.9% | 🟢 Low |
| **Total** | **14.01 MB** | **~3.9 MB** | 100% | |

## Key Findings from Analysis

### 1. `import * as monaco from "monaco-editor"` — THE #1 PROBLEM
- `monaco-setup.ts:1` and `MonacoEditor.tsx:3` both use `import * as monaco from "monaco-editor"`
- This imports the **entire** Monaco editor: all languages (~50), all features, all workers, all CSS
- This is the primary cause of the **4.31 MB main bundle**
- Switching to `monaco-editor-core` (without bundled languages) saves ~3 MB immediately

### 2. Monaco Workers Are Duplicated & Over-Bundled
- 5 separate worker bundles exist (ts: 6.7 MB, css: 1 MB, html: 0.66 MB, json: 0.37 MB, editor: 0.24 MB)
- The **ts.worker** includes the full TypeScript compiler — 6.69 MB alone is 47% of all assets
- Workers are already properly lazy-loaded by MonacoEnvironment, but each is too large

### 3. No Code Splitting
- The entire app (4.31 MB) is one monolithic chunk
- Monaco Editor, Terminal, Dialog components, etc. are all eagerly loaded on first paint
- Vite's `manualChunks` is not configured

### 4. radix-ui (barrel) pulls all @radix-ui/* packages
- `radix-ui` meta-package = 44 KB (re-exports)
- 39 individual `@radix-ui/react-*` packages = **3.8 MB** in node_modules
- Only ~11 are actually used by shadcn/ui components
- Tree-shaking works at bundle level, but install size is wasted

### 5. ~50 Monaco Language Files in Bundle
- Only ~25 languages are actually used (based on `src/lib/languages.ts`)
- The other ~25 are bundled because full `monaco-editor` imports everything
- Each is small (1-15 KB), but collectively ~0.5 MB

---

## Phase 1: 🎯 Monaco Editor Surgery ✅✅✅
**Target: Shrink main bundle by ~3 MB and ts.worker**

### 1.1 Replace `monaco-editor` with `monaco-editor-core`
- [ ] `npm uninstall monaco-editor && npm install monaco-editor-core`
- [ ] `npm uninstall @monaco-editor/react && npm install @monaco-editor/react` (reinstall, it adapts)
- [ ] Update `monaco-setup.ts`:
  ```typescript
  // BEFORE (imports EVERYTHING — 4+ MB):
  import * as monaco from "monaco-editor";

  // AFTER (imports only core — ~1 MB):
  import * as monaco from "monaco-editor-core";
  import "monaco-editor-core/esm/vs/basic-languages/typescript/typescript";
  import "monaco-editor-core/esm/vs/basic-languages/javascript/javascript";
  import "monaco-editor-core/esm/vs/basic-languages/json/json";
  import "monaco-editor-core/esm/vs/basic-languages/css/css";
  import "monaco-editor-core/esm/vs/basic-languages/html/html";
  import "monaco-editor-core/esm/vs/basic-languages/markdown/markdown";
  import "monaco-editor-core/esm/vs/basic-languages/python/python";
  import "monaco-editor-core/esm/vs/basic-languages/rust/rust";
  import "monaco-editor-core/esm/vs/basic-languages/go/go";
  import "monaco-editor-core/esm/vs/basic-languages/java/java";
  import "monaco-editor-core/esm/vs/basic-languages/cpp/cpp";
  import "monaco-editor-core/esm/vs/basic-languages/csharp/csharp";
  // Only import the ~25 languages actually used in src/lib/languages.ts
  ```
- [ ] Update `MonacoEditor.tsx` to use `monaco-editor-core` type import
- [ ] Wire up `loader.config()` correctly for monaco-editor-core

### 1.2 Restrict TypeScript Worker (the 6.69 MB gorilla)
The ts.worker includes the full TS compiler. Options from most to least aggressive:
- [ ] **Option A (Max savings)**: Disable TypeScript worker entirely; use `editorWorker` as fallback for TS/JS files. Loses IntelliSense for TS but slashes 6.7 MB.
- [ ] **Option B (Balanced)**: Use `@typescript/vfs` to create a lighter virtual file system for the TS worker, limiting what it loads.
- [ ] **Option C (Pragmatic)**: Keep ts.worker but lazy-load it only when a `.ts`/`.tsx` file is actually opened.

### 1.3 Deduplicate Worker Loading
- [ ] Remove duplicate worker registrations — workers are already defined in `MonacoEnvironment.getWorker`
- [ ] Configure Vite's worker format to ensure optimal worker chunking

**Phase 1 Target**: Main bundle from 4.31 MB → ~1.5 MB. ts.worker from 6.69 MB → ~2 MB (with Option A) or keep 6.69 MB (lazy-loaded).

---

## Phase 2: Code Splitting & Lazy Loading 
**Target: Split the 4.31 MB main bundle into lazy-loadable chunks**

### 2.1 Dynamic Import MonacoEditor
- [ ] Wrap MonacoEditor in `React.lazy()`:
  ```typescript
  const MonacoEditor = lazy(() => import("@/components/editor/MonacoEditor"));
  ```
- [ ] Add `<Suspense>` fallback in `EditorArea.tsx`
- [ ] Move `loader.config({ monaco })` and `setupMonaco()` initialization to the lazy module

### 2.2 Dynamic Import Terminal
- [ ] Lazy load Terminal component:
  ```typescript
  const Terminal = lazy(() => import("@/components/terminal/Terminal"));
  ```
- [ ] Add Suspense fallback in `BottomPanel.tsx`

### 2.3 Vite manualChunks Configuration
- [ ] Configure `vite.config.ts`:
  ```typescript
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-core': ['monaco-editor-core'],
          'vendor-react': ['react', 'react-dom'],
          'vendor-zustand': ['zustand'],
        }
      }
    }
  }
  ```
- [ ] **Important**: Don't over-split into tiny chunks. Target 3-4 vendor chunks max.

### 2.4 Lazy Load Dialog Components
- [ ] Lazy import `UnsavedChangesDialog` (only shown on tab close with dirty state)

**Phase 2 Target**: Main bundle from 4.31 MB → ~800 KB (core app shell only). Monaco loads on demand.

---

## Phase 3: Vite Build Configuration ✅✅✅
**Target: Minification, compression, and optimal output**

### 3.1 Upgrade Minification
- [ ] Install `terser`: `npm install -D terser`
- [ ] Configure aggressive minification in `vite.config.ts`:
  ```typescript
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug', 'console.info'],
        passes: 2,
      },
      mangle: { safari10: true },
      format: { comments: false },
    },
  }
  ```

### 3.2 Compression (for distribution)
- [ ] Install compression plugin: `npm install -D vite-plugin-compression`
- [ ] Configure brotli compression:
  ```typescript
  import compression from 'vite-plugin-compression';
  plugins: [
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ]
  ```

### 3.3 Optimize CSS Output
- [ ] Enable CSS code splitting: `build: { cssCodeSplit: true }`
- [ ] Set chunk size warning limit: `build: { chunkSizeWarningLimit: 500 }`
- [ ] Disable module preload polyfill (modern browsers only): `build: { modulePreload: { polyfill: false } }`

### 3.4 Asset Optimization
- [ ] Enable CSSNano (built-in with Vite, just configure):
  ```typescript
  css: {
    lightningcss: false, // Use built-in minifier
  }
  ```
- [ ] Remove unused Tailwind classes (Tailwind 4 already purges by default — verify)

**Phase 3 Target**: Bundle size reduction additional 15-20%. Gzip size reduction ~40% with brotli.

---

## Phase 4: 🦀 Tauri/Rust Backend Optimization ✅✅✅
**Target: Tauri binary from default debug ~200 MB to release < 10 MB**

### 4.1 Release Profile (Already partially configured)
Current `Cargo.toml` profile:
```toml
[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```
- [ ] This is already good. Verify the binary size after `cargo build --release`
- [ ] Consider `opt-level = "z"` (even smaller, slightly slower) — measure tradeoff
- [ ] Add `debug = false` (redundant with `strip = true` but explicit)

### 4.2 Rust Dependency Audit
- [ ] Run `cargo tree -d` to find duplicate dependencies
- [ ] Check if Tauri plugins pull unnecessary features:
  ```bash
  cargo tree -p tauri --features ""
  ```
- [ ] Constrain Tauri plugin features:
  ```toml
  tauri-plugin-dialog = { version = "2", default-features = false }
  tauri-plugin-shell = { version = "2", default-features = false }
  ```
- [ ] Check `portable-pty` — it's a heavy dependency. Verify if `@tauri-apps/plugin-shell`'s PTY support can replace it.
- [ ] Remove `chrono` if not essential (check usage in Rust code)

### 4.3 Binary Size Analysis
- [ ] Install `cargo-bloat`:
  ```bash
  cargo install cargo-bloat
  cargo bloat --release
  ```
- [ ] Identify and prune heavy functions/crates from the binary

### 4.4 Tauri Bundle Configuration
- [ ] Restrict bundle targets in `tauri.conf.json`:
  ```json
  "bundle": {
    "targets": ["nsis"],  // Windows only for now — add platform-specific later
    "icon": ["icons/icon.ico"]
  }
  ```
- [ ] Remove unused icon sizes — keep only:
  - Windows: `icon.ico` (multi-res)
  - macOS: `icon.icns`
  - Linux: `128x128.png`, `128x128@2x.png`
- [ ] Check if `externalBin` is needed for any bundled binaries

**Phase 4 Target**: Tauri binary < 10 MB release, < 8 MB with UPX.

---

## Phase 5: Dependency Slimming 
**Target: Reduce install size and transitive dependency count**

### 5.1 Replace radix-ui barrel with individual packages
- [ ] Audit used `@radix-ui/react-*` packages in `src/components/ui/*.tsx`
- [ ] Uninstall `radix-ui` meta-package:
  ```bash
  npm uninstall radix-ui
  ```
- [ ] Install only the individual packages actually used:
  ```bash
  npm install @radix-ui/react-tooltip @radix-ui/react-dropdown-menu @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-menubar ...
  ```
- [ ] Verify each `components/ui/*.tsx` import matches the package name

### 5.2 Optimize lucide-react imports
- [ ] Verify tree-shaking: all imports should be named imports (`import { X, Y } from "lucide-react"`)
- [ ] Check for barrel imports (`import * as icons`) — none should exist
- [ ] Consider `lucide-static` (SVG approach) for smaller icon bundles — only if tree-shaking isn't enough

### 5.3 Remove Unused Dependencies
- [ ] Run `npx depcheck` to identify unused packages
- [ ] Check if `@types/node` is needed (only for vite.config.ts — keep it)
- [ ] Check if `tw-animate-css` is used (search for `animate-` in source)
- [ ] Check if `class-variance-authority` can be replaced with a simpler helper

### 5.4 Dependency Version Audit
- [ ] Run `npx npm-check-updates` to check for major version updates (newer = often smaller)
- [ ] Check `zustand` 5.x for any breaking changes vs current usage
- [ ] Check `@monaco-editor/react` compatibility with `monaco-editor-core`

**Phase 5 Target**: node_modules from ~800 MB → ~500 MB. Bundle impact: minor (< 100 KB).

---

## Phase 6: Code-Level Optimizations
**Target: Runtime performance + small bundle gains**

### 6.1 React Optimizations
- [ ] Add `React.memo` to:
  - `FileTreeNode` (recursive, re-renders often)
  - `EditorTab` (re-renders on tab switch)
  - `TerminalTab` (same pattern)
- [ ] Use `useCallback` for event handlers passed to memoized children
- [ ] Fix inline object/array creation in render:
  - `MonacoEditor.tsx:45` — the options object is recreated every render
  - `FileTreeNode.tsx` — inline style objects
- [ ] Memoize Monaco editor options with `useMemo`

### 6.2 Store Optimization
- [ ] Use Zustand selectors properly — subscribe to only needed slices:
  ```typescript
  // BAD: entire store re-renders on any change
  const store = useEditorStore();
  // GOOD: re-renders only when `theme` changes
  const theme = useUiStore((s) => s.theme);
  ```
- [ ] Audit all store usages for selector optimization
- [ ] Consider `useShallow` for object selectors

### 6.3 Monaco Editor Options Optimization
- [ ] Disable unused Monaco features to reduce rendering overhead:
  ```typescript
  options: {
    minimap: { enabled: false },     // Save ~50 KB + rendering perf
    folding: true,                    // Keep (useful)
    breadcrumbs: { enabled: false },  // Save ~20 KB
    occurrencesHighlight: false,      // Save ~10 KB  
    parameterHints: { enabled: true },// Keep (useful)
    rename: { enabled: false },       // Save ~15 KB
  }
  ```
- [ ] Move options to a memoized constant or `useMemo`

### 6.4 CSS Optimization
- [ ] Check Tailwind CSS output size (currently 0.18 MB — reasonable)
- [ ] Use dynamic `className` instead of multiple CSS variables where possible
- [ ] Check for unused custom CSS in `index.css`

### 6.5 Memory Management
- [ ] Dispose Monaco editor instances on tab close:
  ```typescript
  useEffect(() => {
    return () => editor?.dispose(); // Cleanup
  }, []);
  ```
- [ ] Add terminal buffer size limit to prevent memory growth
- [ ] Debounce file watcher events (already implemented — verify)

**Phase 6 Target**: 60fps UI, memory < 100 MB baseline, no layout shifts.

---

## Phase 7: Worker & Language Optimization
**Target: Reduce the ~50 language files and worker overhead**

### 7.1 Selective Monaco Language Registration✅
- [ ] Remove unused language imports from `monaco-setup.ts`
- [ ] Only register languages mapped in `src/lib/languages.ts` (25 languages)
- [ ] This eliminates the ~25 unused Monaco language chunks (~250 KB)

### 7.2 Worker Strategy
Current: 5 dedicated workers (ts, css, html, json, editor) = 8.94 MB total
- [ ] **Option A**: Use a single editor worker for non-TS languages (`label: "editor"` catches all defaults)
- [ ] **Option B**: Keep dedicated workers for css/html/json but lazy-init them
- [ ] Merge `css.worker` + `html.worker` + `json.worker` into a single shared worker

### 7.3 Custom Worker Bundle Strategy
- [ ] Configure Vite to hoist small Monaco language modules into main worker bundles
- [ ] Use `monaco-editor/esm/` imports for selective feature registration

**Phase 7 Target**: Worker bundles from 8.94 MB → ~3 MB (Option A) or ~5 MB (Option B).

---

## Phase 8: Build Pipeline & CI
**Target: Automate optimization validation**

### 8.1 Bundle Analysis
- [ ] Add `vite-plugin-bundle-analyzer`:
  ```bash
  npm install -D vite-plugin-bundle-analyzer
  ```
- [ ] Configure to run in CI:
  ```typescript
  import { bundleAnalyzer } from "vite-plugin-bundle-analyzer";
  plugins: [
    process.env.ANALYZE ? bundleAnalyzer() : null,
  ].filter(Boolean),
  ```

### 8.2 CI Integration
- [ ] Add bundle size check script:
  ```json
  "check-size": "vite build && node scripts/check-bundle-size.js"
  ```
- [ ] Create `scripts/check-bundle-size.js` that parses dist output and fails if exceeding budgets
- [ ] Add bundle size budget enforcement:
  - Main JS: < 1 MB
  - Total JS: < 1.2 MB gzipped
  - CSS: < 100 KB
  - Any single chunk: < 500 KB (except workers)

### 8.3 Performance Budget Document
- [ ] Create `docs/performance-budget.md` with thresholds
- [ ] Add optimization checklist to PR template

### 8.4 Regression Testing
- [ ] Test all features after each optimization phase:
  - File tree navigation
  - File open/edit/save
  - Tab management
  - Terminal operations
  - Theme switching
  - Drag-and-drop
  - Context menus
- [ ] Create a manual test checklist

**Phase 8 Target**: Automated guardrails preventing size regressions.

---

## Prioritized Quick Wins (by effort vs. impact)

| # | Optimization | Effort | Bundle Impact | Binary Impact | Phase |
|---|-------------|--------|---------------|---------------|-------|
| 1 | monaco-editor → monaco-editor-core | 1 day | 🔴 -3 MB | — | 1 |
| 2 | Dynamic import MonacoEditor | 0.5 day | 🔴 Code-splits 4.3 MB | — | 2 |
| 3 | Terser minification | 0.5 day | 🟡 -15% bundle | — | 3 |
| 4 | Vite manualChunks | 0.5 day | 🟡 Better caching | — | 2 |
| 5 | Rust release profile | 0.5 day | — | 🔴 -90% (debug→release) | 4 |
| 6 | Delete unused Monaco languages | 0.5 day | 🟡 -250 KB | — | 7 |
| 7 | Dynamic import Terminal | 0.5 day | 🟡 -200 KB | — | 2 |
| 8 | Brotli compression | 0.5 day | 🟡 -40% gzip | 🟡 -40% installer | 3 |
| 9 | radix-ui barrel → individual | 1 day | 🟢 Minimal / negligible (tree-shaking removes unused exports at bundle time; only ~3.8 MB package-size delta) | 🟢 Minimal | 5 |
| 10 | React.memo + useMemo | 1 day | 🟢 Minimal | — | 6 |
| 11 | cargo-bloat analysis | 1 day | — | 🟡 Variable | 4 |
| 12 | Bundle analyzer in CI | 1 day | 🟢 Prevent regressions | — | 8 |

---

## Expected Outcomes Summary

| Metric | Current | Target | Primary Lever |
|--------|---------|--------|---------------|
| Main JS bundle | 4.31 MB | < 1 MB | monaco-editor-core + dynamic import |
| ts.worker | 6.69 MB | 0 MB (opt A) / 2 MB (opt B) | Disable/lazy-load TS worker |
| Total JS (uncompressed) | ~13.7 MB | < 4 MB | Phase 1 + 2 + 7 |
| Total JS (gzipped) | ~3.9 MB | < 1.2 MB | Phases 1-3 |
| CSS bundle | 188 KB | < 100 KB | Phase 3 + 6 |
| Tauri binary (release) | ~200 MB (debug) / ~15 MB (release) | < 8 MB | Phase 4 |
| node_modules size | ~800 MB | < 500 MB | Phase 5 |
| Cold start | ~3-5s | < 1.5s | Phase 2 (lazy load) |
| Memory baseline | ~150-200 MB | < 80 MB | Phase 6 |

---

Each phase has its own validation step. Do NOT skip phases — the gains compound.

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| monaco-editor-core breaks language features | Medium | Keep monaco-editor as fallback; test all 25 languages |
| Dynamic import causes UI flash | Low | Use Suspense with skeleton fallback |
| Terser breaks production code | Low | Run full test suite after enabling |
| Cargo profile changes break build | Low | Test `cargo build --release` after each change |
| Feature regression from deps change | Medium | Manual test all features per phase |

---

## Success Criteria

- [ ] Main JS bundle < 1 MB (from 4.31 MB)
- [ ] Total uncompressed JS < 4 MB (from 13.7 MB)
- [ ] CSS bundle < 100 KB (from 188 KB)
- [ ] Tauri binary < 8 MB release (from ~200 MB debug mode)
- [ ] node_modules < 500 MB (from ~800 MB)
- [ ] Cold start < 1.5 seconds
- [ ] Memory baseline < 80 MB
- [ ] All features work identically (test checklist pass)
- [ ] No visible UI regressions (smooth loading states)
- [ ] Bundle size budgets enforced in CI
