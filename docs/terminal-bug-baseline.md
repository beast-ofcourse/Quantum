# Terminal Bug Baseline — Before Evidence

Captured: 2026-07-02
Branch: `feat/terminal-refactor-phase-0-1`
StrictMode: enabled (`src/main.tsx`)

---

## Manual Repro Checklist

Run each scenario in dev build (`npm run dev`). Record pass/fail and any visible artifacts (black screen, flicker, wrong size, console errors).

### 1. First Terminal Open
- [ ] Open terminal panel: `Ctrl+\`` — terminal renders within <500ms
- [ ] No black/blank rect visible during mount
- [ ] Shell prompt visible, cursor blinking
- [ ] No console errors

### 2. Tab Switching (3+ tabs)
- [ ] Create 3 terminals: `Ctrl+Shift+\`` ×3
- [ ] Switch between tabs rapidly (click each tab 5× in succession)
- [ ] **Expected:** each switch <200ms, no black frame, scrollback preserved
- [ ] Switch back to tab 1 — previous output still visible (not lost)
- [ ] No console errors

### 3. Panel Visibility Toggle
- [ ] Toggle terminal panel via `Ctrl+\`` 10 times rapidly
- [ ] Terminal contents preserved after re-opening each time
- [ ] No blank/black state on re-open
- [ ] Console: count how many times Terminal mount/unmount fires

### 4. Horizontal Resizer Drag
- [ ] Drag bottom-panel resizer up/down fast
- [ ] Terminal cols/rows recalculate smoothly
- [ ] No visual overflow into editor area
- [ ] No "half-screen black" during drag
- [ ] Record: how many `fit()` calls per drag (from Phase 0 instrumentation)

### 5. Maximize Bottom Panel
- [ ] Click maximize button in bottom panel toolbar
- [ ] Terminal fills available height
- [ ] Click restore — terminal returns to previous size
- [ ] No flicker or black frame during transition
- [ ] Repeat 5× — consistent behavior each time

### 6. OS Window Resize
- [ ] Resize the OS window narrower/wider
- [ ] Terminal re-flows to available width
- [ ] No clipping or horizontal scroll mismatch

### 7. Heavy Output
- [ ] Run: `yes` (Linux/macOS) or `powershell "while(1){'a'*100}"` (Windows)
- [ ] Terminal renders output without freezing UI
- [ ] After 5s, press `Ctrl+C` — output stops cleanly

### 8. Non-ASCII Output
- [ ] Run: `echo "日本語 🎉 Powerline ▌│ whitespace"` (or OS equivalent)
- [ ] All characters render correctly — no `�` replacement chars
- [ ] Run a command with box-drawing chars (e.g., `tree` / `Get-ChildItem | Format-Table`)
- [ ] Lines align, no broken glyphs

### 9. Large Scrollback
- [ ] Run: `for ($i=0; $i -lt 2000; $i++) { echo \"line $i\" }`
- [ ] Scroll up — all lines present and selectable
- [ ] No performance degradation at 2000+ lines

### 10. Session Close & Re-open
- [ ] Close terminal tab (middle-click / context menu)
- [ ] Remaining tabs unaffected
- [ ] Open new terminal — new session works
- [ ] Close all terminals, re-open — fresh session starts clean

---

## Instrumentation: `fit()` Call Count & Container Size

Temporary console.time markers added to `Terminal.tsx`:

| Scenario | `doFit()` calls | Container w/h at call | Black frame visible? |
|---|---|---|---|
| First open | | | |
| Tab switch (1→2) | | | |
| Tab switch (2→3) | | | |
| Panel toggle (hide) | | | |
| Panel toggle (show) | | | |
| Resizer drag (slow) | | | |
| Resizer drag (fast) | | | |
| Maximize | | | |
| Restore | | | |
| OS window resize | | | |

---

## StrictMode Analysis (Code Review)

**Confirmed:** `src/main.tsx` line 9 — `<StrictMode>` wrapper is active.

**Root Cause #3 verified:**

1. React StrictMode double-invokes effects in dev (mount → cleanup → mount)
2. `attachToSession` at `terminalStore.ts:282` does destructive read: `buffer.data = []`
3. First (throwaway) mount's `attachToSession` drains the entire buffer
4. Cleanup runs `detach()` which removes the listener
5. Second (real) mount's `attachToSession` finds buffer empty → terminal stays blank until new output arrives

**Evidence chain:**
```
src/main.tsx:9          StrictMode active
terminalStore.ts:276     attachToSession called
terminalStore.ts:281-282  slice copied, buffer.data = []  <-- destructive
Terminal.tsx:127-130     attachToSession called in effect
Terminal.tsx:132-148     effect cleanup (detach + dispose)
```

**Prediction:** Disabling StrictMode will eliminate the blank-terminal-on-first-open bug in dev. In production builds (where StrictMode doesn't double-invoke), the bug manifests only if `attachToSession` is called twice for the same session through other code paths.

### To test manually
1. Temporarily remove `<StrictMode>` from `src/main.tsx`
2. `npm run dev`
3. Open terminal — should appear on first attempt every time
4. Revert change after testing

Result:
```
StrictMode ON:  [terminal appears / blank / intermittent]
StrictMode OFF: [terminal appears / blank / intermittent]
```

---

## Console Logs Snapshot

Paste relevant console output below:

```
[terminalStore] ...
[Terminal] fit failed: ...
[terminalStore] spawnPty failed: ...
```

---

## Environment

- OS: __________
- Shell: __________ (powershell / bash / zsh / fish)
- Build: dev (`npm run dev`)
- Tauri: yes / no (backend available)
