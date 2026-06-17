# Unified Search Bar — Design Spec

**Date:** 2026-06-10
**Status:** Approved
**Feature:** Centered search bar in title bar, replacing QuickOpen/CommandPalette overlay

---

## Overview

Replace the modal QuickOpen (`Ctrl+P`) and CommandPalette (`Ctrl+Shift+P`) overlays with a single persistent search bar centered in the title bar. Supports multiple search modes via prefix characters, mirroring VS Code's quick-open behavior.

---

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Quantum  │  src/file.ts    [🔍 % search query  ⌘P]  │  — □ ×  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ▼ Dropdown results (absolute positioned, below title bar)       │
│  ┌──────────────────────────────────────────────┐               │
│  │ 🔍 Files (12 results) · search.ts, layout…  │               │
│  │ 📄 SearchSidebar.tsx          src/search     │               │
│  │ 📄 tauri/search.ts           src/tauri       │               │
│  │ ↑↓ navigate  ↵ select  Esc close            │               │
│  └──────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

Header uses three-column grid: left (title + file path), center (search bar), right (window controls). Search bar max-width 360px, min-width 200px.

---

## Search Modes

| Prefix | Mode       | Data Source            | Trigger                       |
|--------|------------|------------------------|-------------------------------|
| (none) | Files      | fileStore.fileTree     | `Ctrl+P`                      |
| `>`    | Commands   | commandRegistry        | `Ctrl+Shift+P` (prefills `>`) |
| `@`    | Symbols    | Monaco document symbols| `Ctrl+Shift+O` (prefills `@`) |
| `:`    | Goto Line  | —                      | `Ctrl+G` (prefills `:`)       |
| `%`    | Full-Text  | tauri search_in_files  | Type `%` manually              |

Prefix detected on every keystroke from query[0]. Mode indicator badge shown inside input. Query text after prefix used for filtering/searching.

---

## Components

### `src/stores/searchStore.ts`
- **State:** `query`, `results`, `activeIndex`, `isDropdownOpen`, `isLoading`
- **Actions:** `setQuery`, `setResults`, `setActiveIndex`, `setDropdownOpen`, `focusSearch(prefix?)`

### `src/components/search/SearchBar.tsx`
- Renders inside TitleBar center column
- Small search icon + input with mode badge + Ctrl+P hint
- Dropdown below with ScrollArea for results
- Keyboard: `↑↓` navigate, `Enter` select, `Escape` close/clear
- Debounce full-text search 300ms, fuzzy filter files/commands/symbols synchronously

### Integration
- **TitleBar.tsx:** three-column grid layout, SearchBar in center
- **ShellLayout.tsx:** remove QuickOpen import, retarget hotkeys to `focusSearch`

---

## Data Flow

1. User types/focuses search bar → `detectMode()` determines SearchMode
2. Results computed via `useMemo` (files/commands/goto) or debounced async (symbols/full-text)
3. Arrow keys set `activeIndex`, Enter calls `handleSelect()`
4. Selection closes dropdown, opens file / executes command / navigates cursor
5. Escape blurs input, dropdown closes, query persists

---

## Edge Cases

- **No root folder open:** File mode shows "Open a folder" message
- **No symbols:** Symbols mode shows "No symbols in current file"
- **Full-text search error:** Show error in dropdown footer
- **Empty query:** No results shown, mode indicator still visible
- **Narrow window (< 640px):** Hide keyboard shortcut badge, shrink bar
- **All themes supported:** Uses CSS variables (`--background`, `--border`, `--popover`)

---

## Files Changed

| File | Action |
|------|--------|
| `src/stores/searchStore.ts` | **CREATE** |
| `src/components/search/SearchBar.tsx` | **CREATE** |
| `src/components/layout/TitleBar.tsx` | **MODIFY** — add SearchBar, three-column layout |
| `src/components/layout/ShellLayout.tsx` | **MODIFY** — remove QuickOpen, retarget Ctrl+P/Shift+P |
| `src/components/command/QuickOpen.tsx` | **UNCHANGED** (no longer imported, safe to remove later) |
