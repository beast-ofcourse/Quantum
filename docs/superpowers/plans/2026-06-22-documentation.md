# IDE Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a comprehensive, multi-page professional documentation suite under a new folder `Documentation/` describing all IDE features (Overview, Getting Started, UI, Editor, Terminal, Source Control, Debugging, LSP, Extension System, Settings & Themes), and clean up all leftover traces of the deprecated "Quantum Swarm" feature.

**Architecture:** A set of 10 interconnected Markdown (.md) documents utilizing high-quality Markdown formatting, Mermaid diagrams, tables, and callouts following VS Code/JetBrains documentation styling.

**Tech Stack:** Markdown, Git, Mermaid.js

---

### Task 1: Clean up Quantum Swarm traces
**Files:**
- Modify: `README.md`
- Delete: `docs/superpowers/specs/2026-06-19-quantum-agent-mesh-design.md`

- [ ] **Step 1: Edit README.md**
  Remove lines 75-116 containing the "Multi-Agent Orchestration (Quantum Swarm) — In Progress" section and any other mentions of Swarm/Agent/locks.
- [ ] **Step 2: Delete deprecated spec**
  Delete the file `docs/superpowers/specs/2026-06-19-quantum-agent-mesh-design.md`.

### Task 2: Create Documentation Overview
**Files:**
- Create: `Documentation/Overview.md`

- [ ] **Step 1: Write Overview.md**
  Add high-level overview, architecture explanation (Tauri Rust backend + React/TS Frontend IPC boundary), component architecture Mermaid diagram, and complete tech stack table.

### Task 3: Create Getting Started Guide
**Files:**
- Create: `Documentation/GettingStarted.md`

- [ ] **Step 1: Write GettingStarted.md**
  Add prerequisites, installation instructions, script references, build details, and troubleshooting notes.

### Task 4: Create User Interface Guide
**Files:**
- Create: `Documentation/UserInterface.md`

- [ ] **Step 1: Write UserInterface.md**
  Add layout sections, panel configuration detail, alignment options, presets manager guide, and detachable panels description.

### Task 5: Create Code Editor Guide
**Files:**
- Create: `Documentation/CodeEditor.md`

- [ ] **Step 1: Write CodeEditor.md**
  Document Monaco editor integration, split view/tabs details, document outline tracking, and markdown preview features.

### Task 6: Create Terminal Guide
**Files:**
- Create: `Documentation/Terminal.md`

- [ ] **Step 1: Write Terminal.md**
  Document xterm.js integration, Tauri PTY shell detection, multi-session management, resize handling, and configurations.

### Task 7: Create Source Control Guide
**Files:**
- Create: `Documentation/SourceControl.md`

- [ ] **Step 1: Write SourceControl.md**
  Document the git status view, staging/unstaging, committing, remotes, branches, stashes, interactive rebase, tag management, worktrees, bisect, blame, git graph, and GitHub OAuth integration.

### Task 8: Create Debugging Guide
**Files:**
- Create: `Documentation/Debugging.md`

- [ ] **Step 1: Write Debugging.md**
  Document DAP connection, `launch.json` configuration schema, debugging controls, breakpoints, stack tracking, variable inspection, and debug console.

### Task 9: Create LSP Guide
**Files:**
- Create: `Documentation/LSP.md`

- [ ] **Step 1: Write LSP.md**
  Document Monaco bridge, language server lifecycle management, Pyright Python server bundling, and third-party LSP server registry API.

### Task 10: Create Extension System Guide
**Files:**
- Create: `Documentation/ExtensionSystem.md`

- [ ] **Step 2: Write ExtensionSystem.md**
  Document sandbox host, manifest schema (`package.json`), complete Extension API reference, and marketplace installation guide.

### Task 11: Create Settings and Themes Guide
**Files:**
- Create: `Documentation/SettingsThemes.md`

- [ ] **Step 1: Write SettingsThemes.md**
  Document visual theme editor, live preview, color groups, CSS overrides, settings manager UI, keybindings registry, and keyboard shortcuts cheat sheet.
