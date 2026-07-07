# Integrated Terminal Refactor — Task Plan

Scope: `src/components/terminal/**`, `src/components/layout/TerminalPanel.tsx`, `src/components/layout/Dock.tsx`,
`src/components/layout/ShellLayout.tsx`, `src/components/layout/Resizer.tsx`, `src/stores/terminalStore.ts`,
`src/workers/terminal.worker.ts`, `src/lib/terminal-worker.ts`, `src/core/terminal/**`, `src-tauri/src/commands/pty.rs`.

This plan is based on an actual read-through of the current code, not speculation. Each task below names the
file(s) and the concrete defect found in them. Root-cause summary is at the bottom of this doc for reference
while working.

---

## Phase 0 — Baseline & Safety Net (½ day)

Goal: make the bugs reproducible and measurable *before* changing anything, so we can confirm each fix actually
fixes something.

- [ ] Write a manual repro checklist covering: open terminal panel first time, switch between 3+ tabs rapidly,
  toggle panel visibility (`Ctrl+\``) repeatedly, drag the horizontal `Resizer` fast, toggle "maximize bottom
  panel", resize the OS window, run a command with heavy/fast output (`yes`, `ls -la /` in a loop), print
  non-ASCII output (`echo "日本語 🎉"`).
- [ ] Add temporary `console.time`/`performance.mark` around `Terminal.tsx`'s `doFit()` and around the
  `ResizeObserver` callback so we can see, in dev tools, how many times fit runs per drag and what the
  container's `clientWidth`/`clientHeight` are at each call. Confirm the "0×0 container" hypothesis (see Root
  Cause #2 below) with real numbers before rewriting the sizing logic.
- [ ] Confirm current behavior under `StrictMode` (`src/main.tsx`) vs. a temporary non-StrictMode build, to
  verify the buffer-replay data loss described in Root Cause #3.
- [ ] Capture this checklist's results as a short `docs/terminal-bug-baseline.md` note (before/after evidence
  for the PR description).

No production code changes in this phase.

---

## Phase 1 — Delete Dead Code & Resolve Naming Collisions (½ day, low risk)

Goal: stop future-you (or an AI assistant) from editing the wrong file. Right now there are two files literally
named `TerminalPanel.tsx` and a whole unused service layer that looks like it's "the" terminal implementation
but isn't.

- [ ] Delete `src/ui/TerminalPanel.tsx`. It does not export `TerminalPanel` — it exports `ExecutionStatusPanel`,
  an unrelated "running processes" widget for the code-execution feature, and it is not imported anywhere in the
  codebase. If the running-processes widget is still wanted, rename the file to
  `src/components/execution/ExecutionStatusPanel.tsx` and wire it up deliberately; otherwise delete it outright.
- [ ] Delete `src/core/terminal/TerminalAdapter.ts` and `src/core/terminal/TerminalEvents.ts`. Verified unused
  (`grep` shows zero imports outside `src/core/terminal/` itself). This is a parallel, never-wired-up
  event-emitter abstraction for terminal I/O that duplicates what `terminalStore.ts` + Tauri events already do.
- [ ] Move `src/core/terminal/PtyService.ts` out of the `terminal/` folder — it's real, used code, but it powers
  the **code-execution / "Run" output** feature (`ExecutionService.ts`, `core/backend/spawn.ts`) via
  `@tauri-apps/plugin-shell`, which is a completely separate mechanism from the integrated terminal's PTY
  (`src-tauri/src/commands/pty.rs` + `terminalStore.ts`). Move it to `src/core/execution/PtyService.ts` so the
  two subsystems aren't filed under the same name.
- [ ] Add a short header comment to `src/stores/terminalStore.ts` and `src/components/terminal/Terminal.tsx`
  stating plainly: "this is the single source of truth for the integrated terminal; do not create parallel
  adapters." Cheap, but prevents this exact drift from happening again.
- [ ] Update `Documentation/Terminal.md` to match reality once Phase 1–4 land (tracked again in Phase 6).

Deliverable: a `git diff` that is close to pure deletions/moves, reviewable in minutes, with no behavior change.

---

## Phase 2 — Fix the Mount/Unmount Architecture (this is the main fix — 1.5–2 days)

### Root cause being fixed
`TerminalPanel.tsx` renders **only** the active session:
```tsx
{active ? (
  <Terminal session={active} ... />
) : (
  <TerminalEmptyState />
)}
```
Every tab switch destroys the previous `XTerm` instance, terminates its dedicated Web Worker, and detaches its
store listener (`Terminal.tsx` cleanup), then constructs a brand-new `XTerm`, a brand-new `Worker`, calls
`term.open(container)`, and runs a 3-stage fit cascade (sync `fit()` → double `requestAnimationFrame` → 300ms
`setTimeout` fallback). On top of that, `Dock.tsx` returns `null` entirely when the zone is hidden:
```tsx
if (!zoneState.isVisible || ...) return null;
```
so toggling the terminal panel (`Ctrl+\``) or toggling "maximize" tears everything down too. This is the
single biggest source of the black-screen/blank-terminal reports: there is a real window where the container
exists in the DOM but has not yet settled to its final size, or where the worker hasn't loaded/flushed its
first batch yet, and the user sees an unstyled black rect (the `background: bgColor` div with nothing painted
inside it) until the fallback timers fire.

### Tasks
- [ ] Change `TerminalPanel.tsx` to mount **one `<Terminal>` per session, always**, and use CSS
  (`hidden` / `display:none` via a conditional class, not conditional rendering) to show only the active one:
  ```tsx
  {sessions.map((s) => (
    <div key={s.id} className={cn("absolute inset-0", s.id !== activeSessionId && "hidden")}>
      <Terminal session={s} ... />
    </div>
  ))}
  ```
  Parent container needs `position: relative` for the absolutely-positioned children to stack correctly.
- [ ] Update `Terminal.tsx`'s mount effect (currently keyed only on `session.id`) to stop tearing down on every
  tab switch — since it will now only mount once per session lifetime (created / closed), not per activation.
- [ ] Because a hidden terminal keeps running, add a `visible` prop (derived from `activeSessionId === session.id`)
  and only run `fit()` / the `ResizeObserver` callback when `visible` is true, to avoid wasted work and
  `fit()` computing garbage cols/rows against a `display:none` (0×0) container. Re-run `fit()` once, on the
  frame after a session becomes visible again (its size may have changed while hidden).
- [ ] Change `Dock.tsx` to stop fully unmounting `PanelRenderer` when a zone is hidden. Instead of
  `if (!zoneState.isVisible) return null`, keep the tree mounted and toggle a `hidden` class on the wrapper, OR
  (lower risk, scoped alternative) special-case only the `bottom`/terminal zone to stay mounted-but-hidden while
  leaving other panel types' current unmount-on-hide behavior alone for now. Recommended: start scoped to
  terminal, revisit generalizing to all docks as a Phase 7 stretch item once this pattern is proven.
- [ ] Re-verify session close (`closeSession` in `terminalStore.ts`) still properly disposes the corresponding
  `<Terminal>`'s xterm instance/worker — closing a session should still fully tear down (this part of the
  lifecycle is correct today and should stay as-is, just gated on session removal instead of tab-switch).
- [ ] Regression check: confirm max-8-sessions guard (`MAX_TERMINAL_SESSIONS`) still makes sense given all 8 are
  now mounted simultaneously (8 xterm instances + 8 workers resident at once, see Phase 3 for why the worker
  should go away, which makes this cheaper).

Deliverable: switching tabs and toggling the panel no longer shows any blank/black frame, and terminal
scrollback/selection state survives tab switches (currently lost on every switch).

---

## Phase 3 — Fix Data Flow Correctness (1 day)

### Root cause being fixed
`terminalStore.ts`'s `attachToSession`:
```ts
attachToSession: (id, onData) => {
  const buffer = get().outputBuffers[id];
  if (!buffer) return () => {};
  const slice = ...;
  for (const data of slice) onData(data);
  buffer.data = [];               // <-- destructive
  buffer.listeners.add(onData);
  return () => buffer.listeners.delete(onData);
},
```
Replay is destructive: the buffer is cleared as soon as one consumer reads it. Combined with React 18
`StrictMode` (confirmed enabled in `src/main.tsx`) double-invoking effects in dev — mount → cleanup → mount
again — the *first* (thrown-away) mount's `attachToSession` call drains the buffer, so the second (real) mount's
replay finds nothing and the terminal opens blank until new output arrives. This is a fully reproducible
"terminal doesn't show up" bug in dev builds, and a latent one-time data-loss bug in prod if attach is ever
called twice for the same session (which Phase 2's changes make less likely, but the store method itself
should not rely on being called exactly once).

Separately, `src/lib/terminal-worker.ts` + `src/workers/terminal.worker.ts` implement a dedicated Web Worker
whose only job is to buffer strings and flush them every 16ms — pure string concatenation that doesn't need a
worker thread, at the cost of two `postMessage` serialization hops and a full worker-module load per terminal
tab (extra latency before first output paint). Shutdown is also racy:
```ts
worker.postMessage({ type: "shutdown" });
worker.terminate();   // no wait for the worker's final flush to arrive back
```
`terminate()` can kill the worker before its last `postMessage` is delivered, silently dropping trailing output.

### Tasks
- [ ] Make `attachToSession` non-destructive: instead of clearing `buffer.data` on replay, track a per-listener
  read offset (or switch to trimming the buffer only via the existing `TERMINAL_BUFFER_LIMIT` cap, not on
  attach). Multiple/duplicate attach calls should be safe and idempotent.
- [ ] Remove `src/workers/terminal.worker.ts` and `src/lib/terminal-worker.ts`. Replace with a simple in-component
  batching using `requestAnimationFrame` (collect writes since last frame into an array, join+write once per
  frame) directly in `Terminal.tsx`. This removes the worker-spinup latency, the double-serialization cost, and
  the shutdown race, while keeping the same "batch rapid writes" benefit.
- [ ] With Phase 2's "mount once per session" change, verify output arriving while a terminal is hidden
  (backgrounded tab) is still written to the xterm buffer (so scrollback is correct when the user switches
  back) — just skip the `fit()`/resize work while hidden, not the actual `term.write()`.
- [ ] Add a small unit test for `attachToSession` covering: replay-then-detach-then-reattach, and two concurrent
  attaches to the same session both receiving full backlog.

Deliverable: no more dev-mode blank terminal on first open; no dropped trailing output on tab close; less
latency before a terminal's first paint.

---

## Phase 4 — Layout & Resize Hardening (1 day)

### Root causes being fixed
1. `Dock.tsx`:
   ```tsx
   <div className="flex-1 overflow-hidden">
     <PanelRenderer panelId={zoneState.activePanelId} />
   </div>
   ```
   Missing `min-h-0`. In a flex column, a `flex-1` child's default `min-height: auto` means it won't shrink
   below its content's intrinsic size — during rapid resizes/toggles this can force the container taller than
   its allotted space for a frame or two, which is a classic cause of a panel visually overflowing into/over
   an adjacent region (matches the "half screen black" report) until the next layout pass corrects it.
2. `ShellLayout.tsx` uses two different sizing strategies for the same element depending on state
   (`flex: 0 1 ${zones.bottom.size}px` + `maxHeight` when normal, vs. `flex: "1 1 0%"` when
   `isBottomMaximized`), which doubles the number of states the terminal's `ResizeObserver` → `fit()` chain has
   to correctly react to, and doubles the chance of a transitional bad-size frame.
3. `Resizer.tsx` calls `onResize` synchronously on **every** `pointermove` event, which flows straight into
   `setZoneSize` (Zustand) → React re-render → layout reflow → `ResizeObserver` fires → rAF-scheduled `fit()` →
   an **async Tauri IPC call** (`resizePty`) to the Rust backend — with no throttling. Dragging the resizer can
   fire dozens of PTY-resize IPC calls per second.

### Tasks
- [ ] Add `min-h-0` (and `min-w-0` where relevant) to `Dock.tsx`'s panel wrapper div.
- [ ] Unify the bottom-panel sizing in `ShellLayout.tsx` to a single strategy — e.g. always use
  `flex: "1 1 0%"` plus a CSS custom property for the target height, or always use the explicit-px approach and
  just clamp `size` to the container's available height when maximized — rather than switching the sizing
  *mechanism* itself based on a boolean.
- [ ] Throttle `Resizer.tsx`'s drag updates: batch `pointermove` deltas with `requestAnimationFrame` (accumulate
  delta, apply once per frame) instead of calling `onResize` per raw event.
- [ ] Debounce the PTY-resize IPC call specifically (separate from the visual `fit()`, which can and should
  stay smooth/immediate): call `fit()` on every rAF-batched frame for visual responsiveness, but only call
  `useTerminalStore.getState().resize(...)` (the Tauri `invoke`) after drag stops or on a trailing debounce
  (~75–100ms of no movement). The shell doesn't need to know the true PTY size until the user stops dragging.
- [ ] In `Terminal.tsx`'s `doFit()`, add an explicit guard: if `container.clientWidth === 0 ||
  container.clientHeight === 0`, skip the fit and let the `ResizeObserver` retry once real dimensions exist,
  rather than calling `fit.fit()` against a zero-size container (which can produce a 0 or negative
  cols/rows and a corrupted render). This replaces the current "hope the 300ms timeout fixes it" approach with
  an actual condition check.
- [ ] Re-run the Phase 0 baseline checklist and confirm the black-frame-during-resize reports are gone.

Deliverable: dragging the terminal resizer feels smooth with no visible flashing, and the panel never
visually overflows its allotted space during resize/maximize transitions.

---

## Phase 5 — Backend Correctness (½ day)

### Root cause being fixed
`src-tauri/src/commands/pty.rs`, `reader_thread`:
```rust
let mut buf = [0u8; 4096];
...
Ok(n) => {
    let data = String::from_utf8_lossy(&buf[..n]).into_owned();
    let _ = app.emit(&stdout_event(&session_id), data);
}
```
Each `read()` call is decoded independently with `from_utf8_lossy`. A multi-byte UTF-8 character (box-drawing
glyphs, emoji, non-English text, some prompt themes/Powerline fonts) that happens to straddle two 4096-byte
reads gets corrupted into `�` replacement characters on both sides of the split. Not the black-screen bug, but
a real, user-visible correctness bug in the same subsystem — worth fixing in the same pass since it touches the
exact same code path being refactored.

### Tasks
- [ ] Replace the per-chunk `from_utf8_lossy` with a stateful decoder that carries any incomplete trailing
  UTF-8 sequence over to the next `read()` call (e.g. buffer up to 3 leftover bytes and prepend them before
  decoding the next chunk).
- [ ] Fix the worker-removal-adjacent shutdown ordering: ensure `kill_pty` / process teardown flushes any final
  buffered reader output before the session is removed from `state.sessions`, so the last bit of output (e.g. a
  process's final error message before exit) isn't dropped.
- [ ] Add a small Rust test (or at least a documented manual test) that spawns a shell, prints a string with a
  multi-byte character positioned to straddle a 4096-byte boundary, and confirms correct decoding.

Deliverable: non-ASCII terminal output renders correctly regardless of chunk boundaries.

---

## Phase 6 — Tests, Docs & Regression Prevention (1 day)

- [ ] Component test for `Terminal.tsx` / `TerminalPanel.tsx`: mount 3 sessions, switch active session
  repeatedly, assert the previously-active xterm instance is *not* disposed (Phase 2 behavior) and that no
  session's container reports `0×0` at the moment it becomes active.
- [ ] Unit tests for `terminalStore.ts`: `attachToSession` idempotency/non-destructive replay (Phase 3),
  buffer trimming at `TERMINAL_BUFFER_LIMIT`, session close cleanup.
- [ ] Unit test for `uiStore.ts`'s `setZoneSize` clamping interacting with the unified sizing strategy from
  Phase 4 (min/max bounds still respected under the new single sizing mechanism).
- [ ] If Playwright/`tauri-driver` E2E is available in this repo (check `package.json`/CI config — not
  confirmed during this audit), add one smoke test: open terminal, run a command, switch tabs, drag resizer,
  toggle maximize, toggle panel visibility, assert no console errors and a non-empty rendered terminal at the
  end. If no E2E harness exists yet, note that as a follow-up rather than adding a new test framework mid-refactor.
- [ ] Update `Documentation/Terminal.md` to describe the new architecture: mount-once-per-session model, why
  there's no more dedicated worker, the debounced-resize IPC behavior, and the single source of truth note
  added in Phase 1.
- [ ] PR description: paste the before/after evidence from the Phase 0 baseline doc.

---

## Phase 7 — Optional / Follow-up (not required to fix the reported bugs)

- [ ] Consider generalizing the "mount once, hide via CSS" pattern from Phase 2 to *all* dock panels
  (`Dock.tsx`), not just the terminal, if it proves valuable — e.g. Source Control or Extensions panels losing
  scroll position on every zone toggle today. Separate PR; don't bundle with the terminal fix.
- [ ] Decide the fate of the `ExecutionStatusPanel` widget removed/renamed in Phase 1 — wire it up somewhere
  deliberate (e.g. a small status-bar indicator) or drop it for good.
- [ ] Revisit `MAX_TERMINAL_SESSIONS = 8` now that all sessions stay mounted simultaneously (Phase 2) — confirm
  8 concurrent xterm instances is still an acceptable memory/CPU footprint, especially on lower-end machines.

---

## Root Cause Summary (for quick reference)

| Symptom reported | Primary cause | File(s) |
|---|---|---|
| Half-screen black rect | Missing `min-h-0` on flex dock container + dual sizing strategies + unthrottled resize IPC causing transitional bad-size frames | `Dock.tsx`, `ShellLayout.tsx`, `Resizer.tsx` |
| Terminal doesn't show up | Full unmount/remount of xterm+worker on every tab switch / panel toggle, racing against layout settling; destructive buffer replay dropping output under StrictMode's double-effect | `TerminalPanel.tsx`, `Dock.tsx`, `Terminal.tsx`, `terminalStore.ts` |
| General misbehavior / confusion when debugging | Dead duplicate `TerminalPanel.tsx`, unused `TerminalAdapter`/`TerminalEvents` abstraction, misplaced `PtyService.ts` — three plausible-looking-but-wrong places to look for "the" terminal code | `src/ui/TerminalPanel.tsx`, `src/core/terminal/*` |
| Corrupted characters in output (bonus finding) | UTF-8 chunk-boundary splitting in the PTY reader | `src-tauri/src/commands/pty.rs` |

**Suggested order:** Phase 0 → 1 → 2 → 3 → 4 → 5 → 6. Phases 1–3 are the ones most likely to eliminate the
reported black-screen/no-show bugs; do not skip Phase 0's baseline capture, since it's the only way to prove
each phase actually helped.
