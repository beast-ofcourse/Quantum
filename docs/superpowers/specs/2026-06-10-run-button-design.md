# Run Button — Editor Toolbar Design

## Summary

Add a VS Code-parity Run/Debug button group to the editor tab bar. Config dropdown + Play/Stop button with three visual states: idle (▶ green), running (■ red), paused (■ yellow).

## Components

### New: `RunButton.tsx`
Sits right of editor tabs in the tab bar row. Contains:
- **Config dropdown** — lists `.quantum/launch.json` configurations, click opens a popover to select. Auto-selects first config on load.
- **Play/Stop button** — ▶ green play when idle, ■ red stop when running, ■ yellow stop when paused. Click starts or stops the active session.
- States:
  - **Idle** — no session. Shows config name + green ▶. Click ▶ starts debug session.
  - **Running** — session active. Button turns ■ red. Click ■ stops session.
  - **Paused** — breakpoint hit. Button turns ■ yellow. Click ■ stops session.

### New: `src/lib/debugConfiguration.ts`
launch.json management service:
- `loadConfigs()` — reads `.quantum/launch.json`, parses configurations
- `saveConfigs(configs)` — writes configurations
- `createTemplate(type)` — returns a default Node.js/Python config
- `getDefaultConfig()` — returns first config or creates one

### Modified: `EditorArea.tsx`
Wraps `<EditorTabs />` and `<RunButton />` in a shared flex row. No other changes.

### Modified: `EditorTabs.tsx`
Removes `border-b border-border` from the tab container — that styling moves to the shared wrapper.

### Modified: `codeLensProvider.ts`
Wires `code-lens.run` command to `debugStore.startSession()`. The existing CodeLens displays "▶ Run {name}" and "Debug {name}" above functions/methods/classes.

### Modified: `ShellLayout.tsx`
Adds three keyboard shortcuts:
- `F5` — start/continue debugging
- `Ctrl+F5` — run without debugging
- `Shift+F5` — stop debugging

Also registers `Ctrl+Shift+D` to open the Debug sidebar.

### Modified: `DebugConfigDialog.tsx`
Refactored to read/write from `.quantum/launch.json` instead of standalone. Adds support for adding/editing/deleting configs.

## Data Flow

```
.quantum/launch.json
    │ DebugConfigurationService.loadConfigs()
    ▼
RunButton — reads configs, user picks one, clicks ▶
    │ debugStore.startSession(config)
    ▼
DapManager.startDebugging(config)
    │
    ▼
DebugSessionInstance → DapTransport → Debug Adapter Process
```

## Files Changed

| File | Action |
|------|--------|
| `src/lib/debugConfiguration.ts` | NEW |
| `src/components/debug/RunButton.tsx` | NEW |
| `src/components/layout/EditorArea.tsx` | MODIFY |
| `src/components/editor/EditorTabs.tsx` | MODIFY (minor) |
| `src/lib/codeLensProvider.ts` | MODIFY |
| `src/components/debug/DebugConfigDialog.tsx` | MODIFY |
| `src/components/layout/ShellLayout.tsx` | MODIFY |
| `README.md` | MODIFY |
