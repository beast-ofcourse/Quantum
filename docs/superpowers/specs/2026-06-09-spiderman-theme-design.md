# Spider-Man Classic Theme — Design Spec

- **Date:** 2026-06-09
- **Status:** Approved
- **Theme Name:** `spiderman`

---

## Overview

A Spider-Man inspired theme for the Quantum code editor. Features a classic red/blue dark color palette, custom cursor with web thread trail, subtle background watermark, status bar Spidey-Sense indicator, and web-themed file icons.

---

## 1. Color Theme

### 1.1 Core Palette

| Role | Hex | Reference |
|------|-----|-----------|
| Background (deepest) | `#0A0F18` | Night sky, activity bar |
| Background (default) | `#0D111A` | Editor surface |
| Background (raised) | `#151B28` | Sidebar, widgets |
| Background (border) | `#2A3245` | Panel borders, separators |
| **Primary (Spidey Red)** | `#E23636` | Buttons, badges, cursor, scrollbar, tabs |
| **Secondary (Classic Blue)** | `#2B5BED` | Selections, focus rings, links |
| Foreground (primary) | `#E8EDF2` | Editor text, primary labels |
| Foreground (secondary) | `#8B95A5` | Line numbers, hints, secondary text |
| Success | `#2EA043` | Git additions |
| Warning | `#D29922` | Git modifications |
| Error | `#E23636` | Git deletions, errors |

### 1.2 Theme Definition

Full `ThemeDefinition` object for `src/lib/builtinThemes.ts`:

```typescript
{
  name: "spiderman",
  type: "dark",
  colors: {
    "editor.background": "#0D111A",
    "editor.foreground": "#E8EDF2",
    "editor.lineHighlightBackground": "#151B28",
    "editor.selectionBackground": "#2B5BED44",
    "editorCursor.foreground": "#E23636",
    "editorLineNumber.foreground": "#4A5568",
    "editorLineNumber.activeForeground": "#E8EDF2",
    "editorIndentGuide.background1": "#1E2740",
    "editorIndentGuide.activeBackground1": "#2A3245",
    "editorWidget.background": "#151B28",
    "editorWidget.border": "#2A3245",
    "editorSuggestWidget.background": "#0F1520",
    "editorSuggestWidget.border": "#2A3245",
    "editorSuggestWidget.selectedBackground": "#2B5BED33",
  },
  tokenColors: [],
  terminal: {
    background: "#0D111A",
    foreground: "#E8EDF2",
    cursor: "#E23636",
    cursorAccent: "#0D111A",
    selectionBackground: "#2B5BED44",
    black: "#1A1F2E",
    red: "#E23636",
    green: "#2EA043",
    yellow: "#D29922",
    blue: "#2B5BED",
    magenta: "#BC3F8C",
    cyan: "#39C5CF",
    white: "#E8EDF2",
    brightBlack: "#4A5568",
    brightRed: "#F44336",
    brightGreen: "#4CAF50",
    brightYellow: "#FFC107",
    brightBlue: "#5C7FEF",
    brightMagenta: "#D45C9E",
    brightCyan: "#64D8E3",
    brightWhite: "#F5F8FC",
  },
}
```

### 1.3 shadcn/Tailwind CSS Variables

Add to `src/index.css` as `.spiderman { ... }` class:

```css
.spiderman {
  --background: #0D111A;
  --foreground: #E8EDF2;
  --card: #151B28;
  --card-foreground: #E8EDF2;
  --popover: #0F1520;
  --popover-foreground: #E8EDF2;
  --primary: #E23636;
  --primary-foreground: #FFFFFF;
  --secondary: #1E2740;
  --secondary-foreground: #E8EDF2;
  --muted: #1E2740;
  --muted-foreground: #8B95A5;
  --accent: #2B5BED;
  --accent-foreground: #FFFFFF;
  --destructive: #E23636;
  --destructive-foreground: #FFFFFF;
  --border: #2A3245;
  --input: #2A3245;
  --ring: #E23636;
}
```

### 1.4 Registration

- Add `"spiderman"` to the `Theme` union type in `src/types/ui.ts`
- Add to toggle cycle in `src/stores/uiStore.ts`: `["dark", "light", "catppuccin-mocha", "spiderman"]`

---

## 2. Custom Cursor — Web Thread Trail

### 2.1 Behavior

- Monaco editor cursor rendered in Spider-Man red (`#E23636`)
- A thin red line trails behind the cursor during mouse movement
- Trail fades out over ~400ms with decreasing opacity
- Only visible during active mouse movement — disappears when idle
- Trail is drawn on a transparent canvas overlay positioned over the editor

### 2.2 Implementation

**File: `src/hooks/useCursorTrail.ts`**

A custom hook that:
1. Creates a `<canvas>` overlay positioned absolutely over the Monaco editor container
2. Tracks `mousemove` events on the editor
3. Draws the trail using `requestAnimationFrame` for smooth rendering
4. Each trail point is a small circle (radius ~2px) with decreasing opacity
5. Trail points older than 400ms are removed
6. Canvas is `pointer-events: none` so it doesn't interfere with editing

```typescript
interface TrailPoint {
  x: number;
  y: number;
  time: number;
}
```

**Performance:** Max 20 trail points at any time. Uses a single canvas with `willReadFrequently: false`. Hook auto-cleans up on unmount.

### 2.3 Activation

The trail activates only when the `spiderman` theme is active, controlled via a Zustand store selector.

---

## 3. Custom Background

### 3.1 Source Assets

- `welcome-page-image/Spidy-eyes.png` — the Spider-Man eyes image
- Used in two places at different opacities

### 3.2 Welcome Page Background

**File: `src/components/welcome/WelcomePage.tsx`**

- Full-size background image on the welcome/landing screen
- `background-size: cover` or `contain` depending on aspect ratio
- Positioned behind welcome content
- Darkened overlay on top for text readability

```css
.welcome-spiderman-bg {
  background-image: url("/welcome-page-image/Spidy-eyes.png");
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
```

### 3.3 Subtle Watermark

**File: `src/index.css`** — applied to the editor/shell container

- Same image at very low opacity (5%)
- Fixed position, centered
- Does NOT scroll with content

```css
.spiderman .shell-container::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("/welcome-page-image/Spidy-eyes.png");
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.05;
  pointer-events: none;
  z-index: 0;
}
```

### 3.4 Theme-Only Activation

Both backgrounds activate only when the `spiderman` theme is active. Applied via CSS class on `<html>` (same mechanism as existing themes).

---

## 4. Status Bar — Spidey-Sense Indicator

### 4.1 Behavior

- Red pulsing dot appears on the status bar when the project has errors or warnings
- Dot pulses with a CSS animation (scale + opacity oscillation)
- Pulse intensity/intent scales with severity:
  - **Warnings only:** Gentle pulse, normal red
  - **Errors:** Stronger pulse, brighter red with a subtle glow
  - **No issues:** Dot hidden or very faint (idle state)
- Hover tooltip shows: _"Spidey-Sense is tingling!"_

### 4.2 Implementation

**File: `src/components/layout/StatusBar.tsx`** (modify existing)

```tsx
// Inside StatusBar component
const diagnosticCount = useDiagnosticStore(state => state.diagnostics.length);
const errorCount = useDiagnosticStore(state => state.diagnostics.filter(d => d.severity === 'error').length);
```

```css
@keyframes spidey-sense-pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

.spidey-sense-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #E23636;
  animation: spidey-sense-pulse 1.5s ease-in-out infinite;
}

.spidey-sense-dot.severe {
  background: #FF1744;
  box-shadow: 0 0 6px #E23636;
  animation-duration: 0.8s;
}
```

### 4.3 State Integration

- Reads from the existing diagnostic/linter store
- Zero dependency on external services
- Only visible when `spiderman` theme is active

---

## 5. Custom File Icons — Web-Themed

### 5.1 Approach

Use CSS pseudo-elements and color overlays to theme existing file/folder icons rather than replacing the icon set entirely. This keeps the implementation lightweight and avoids icon font dependencies.

### 5.2 Folder Icons

- Folder icons get a subtle web-pattern overlay
- Color shifted to a warm red tint
- Open folder icon has a small "web strand" decoration

### 5.3 File Icons

- File icons get a small spider/web badge (pseudo-element)
- Standard file type colors (based on extension) remain but are slightly shifted toward the red/blue palette
- Git status badges (M, A, D, U) are recolored:
  - Modified → red-tinted
  - Added → blue-tinted  
  - Deleted → darker red

### 5.4 Implementation

**File: `src/components/explorer/FileTreeNode.tsx`** (modify existing)

CSS classes added for the spiderman theme variant:

```css
.spiderman .file-tree-folder {
  color: #E23636;
}

.spiderman .file-tree-folder::after {
  content: "🕸";
  font-size: 8px;
  opacity: 0.3;
  margin-left: 2px;
}

.spiderman .file-tree-file.git-modified {
  color: #E23636;
}

.spiderman .file-tree-file.git-added {
  color: #2B5BED;
}
```

---

## 6. Files to Modify

| File | Change |
|------|--------|
| `src/lib/builtinThemes.ts` | Add `"spiderman"` ThemeDefinition |
| `src/index.css` | Add `.spiderman` class + cursor trail CSS + watermark CSS |
| `src/types/ui.ts` | Add `"spiderman"` to Theme union |
| `src/stores/uiStore.ts` | Add to toggle cycle |
| `src/hooks/useCursorTrail.ts` | **NEW** — cursor trail hook |
| `src/components/layout/ShellLayout.tsx` | Mount `useCursorTrail` hook |
| `src/components/layout/StatusBar.tsx` | Add Spidey-Sense indicator |
| `src/components/explorer/FileTreeNode.tsx` | Add web-themed icon styling |
| `src/components/welcome/WelcomePage.tsx` | Add Spidy-eyes background |

---

## 7. Non-Goals (Explicitly Out of Scope)

- Sound effects
- Splash/loading animation
- Easter eggs or comic quotes
- Splash screen animations
- Any feature not listed in sections 1-5

---

## 8. Future Considerations

- Token colors for syntax highlighting (red for keywords, blue for strings, etc.)
- Spidey-Sense could extend to show count in the tooltip
- The cursor trail could optionally be disabled via settings
