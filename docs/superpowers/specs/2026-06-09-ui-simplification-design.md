# UI Simplification

## Scope
5 CSS/structure changes to reduce visual weight and vertical space usage across the shell layout.

## Changes

### 1. DockTabs (`src/components/layout/DockTabs.tsx`)
- Remove `bg-muted/20` from header div
- Remove `border-b border-border`
- Change `h-9` to `h-7`
- The "single panel" header (icon + title) and multi-tab `DockTab` list both use same container

### 2. Sidebar (`src/components/layout/Sidebar.tsx`)
- Remove `bg-muted/20` from all `<aside>` wrapper divs
- Remove the `<header>` block (`h-9 shrink-0 ... uppercase`) from:
  - `FileTree.tsx` ("EXPLORER")
  - `SearchSidebar.tsx` ("SEARCH")
  - `GitSidebar.tsx` ("SOURCE CONTROL")
  - `ExtensionsSidebar.tsx` ("EXTENSIONS")
  - `Sidebar.tsx` extension view header
  - `PanelRenderer.tsx` panel header

### 3. StatusBar (`src/components/layout/StatusBar.tsx`)
- Change `h-6` to `h-5`
- Remove `bg-muted/40` (keep `border-t border-border`)

### 4. EditorTabs (`src/components/editor/EditorTabs.tsx`)
- Remove `bg-muted/20` from the tablist container
- Tab backgrounds and borders handled in `EditorTab.tsx`:
  - Remove tab background/border/shape styling
  - Active tab gets `border-b-2 border-primary` instead
  - Inactive tabs are text-only (no background, no border)
  - Container height `h-9` → `h-8`

### 5. TitleBar + MenuBar merge (`src/components/layout/TitleBar.tsx`)
- TitleBar becomes the single top bar at `h-9`
- Add inline menu buttons (File, View, Terminal, Layout, Theme) as `MenubarTrigger` elements directly in the TitleBar row, positioned to the left of the app title
- Menu content/dropdowns remain the same — each triggers the same `MenubarContent` from `MenuBar.tsx`
- `MenuBar.tsx` component: remove the standalone `<Menubar>` wrapper, keep only the menu definitions as a composable fragment, or keep them inline in TitleBar
- The hamburger menu stays for Show Menu Bar toggle etc
- Window controls (minimize/maximize/close) stay on the right

## Non-goals
- Changing any menu items, their actions, or keyboard shortcuts
- Changing the ActivityBar, LeftDock, RightDock, BottomDock, Resizer, or StatusItem components
- Any functional behavior changes beyond CSS and structure
