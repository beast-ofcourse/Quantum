import { Files, Search, GitBranch, Puzzle, Terminal as TerminalIcon, AlertCircle, Bug, FileText, BugPlay, FileJson } from "lucide-react";
import { FileTree } from "@/components/explorer/FileTree";
import { SearchSidebar } from "@/components/search/SearchSidebar";
import { GitSidebar } from "@/components/git/GitSidebar";
import { ExtensionsSidebar } from "@/components/extensions/ExtensionsSidebar";
import { TerminalPanel } from "@/components/layout/TerminalPanel";
import { ProblemsPanel } from "@/components/terminal/ProblemsPanel";
import { OutputPanel } from "@/components/terminal/OutputPanel";
import { DebugConsolePanel } from "@/components/terminal/DebugConsolePanel";
import { MarkdownPreview } from "@/components/markdown/MarkdownPreview";
import { DebugSidebar } from "@/components/debug/DebugSidebar";
import { OutlinePanel } from "@/components/outline/OutlinePanel";
import { useEditorStore } from "@/stores/editorStore";
import type { PanelDefinition, DockZone, PanelId } from "@/types/panelRegistry";
import { extensionViewRegistry } from "@/extensions/viewRegistry";

function MarkdownPreviewPanel() {
  const activeTab = useEditorStore((s) => s.getActiveTab());
  const content = activeTab?.currentContent ?? "";
  const fileName = activeTab?.name;
  return <MarkdownPreview content={content} fileName={fileName} />;
}

const builtinPanels: PanelDefinition[] = [
  { id: "explorer", title: "Explorer", icon: Files, component: FileTree, defaultZone: "left", showInActivityBar: true },
  { id: "search", title: "Search", icon: Search, component: SearchSidebar, defaultZone: "left", showInActivityBar: true },
  { id: "git", title: "Source Control", icon: GitBranch, component: GitSidebar, defaultZone: "left", showInActivityBar: true },
  { id: "extensions", title: "Extensions", icon: Puzzle, component: ExtensionsSidebar, defaultZone: "left", showInActivityBar: true },
  { id: "debug", title: "Run and Debug", icon: BugPlay, component: DebugSidebar, defaultZone: "right", showInActivityBar: true },
  { id: "outline", title: "Outline", icon: FileJson, component: OutlinePanel, defaultZone: "right", showInActivityBar: true },
  { id: "terminal", title: "Terminal", icon: TerminalIcon, component: TerminalPanel, defaultZone: "bottom" },
  { id: "problems", title: "Problems", icon: AlertCircle, component: ProblemsPanel, defaultZone: "bottom" },
  { id: "output", title: "Output", icon: TerminalIcon, component: OutputPanel, defaultZone: "bottom" },
  { id: "debug-console", title: "Debug Console", icon: Bug, component: DebugConsolePanel, defaultZone: "bottom" },
  { id: "markdown-preview", title: "Markdown Preview", icon: FileText, component: MarkdownPreviewPanel, defaultZone: "bottom" },
];

const dynamicPanels = new Map<PanelId, PanelDefinition>();

function buildExtensionViewPanel(view: { id: string; title: string; icon?: string }): PanelDefinition {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    puzzle: Puzzle, files: Files, search: Search, git: GitBranch, terminal: TerminalIcon,
    bug: Bug, bugplay: BugPlay, alert: AlertCircle, filetext: FileText,
  };
  return {
    id: view.id,
    title: view.title,
    icon: (view.icon && iconMap[view.icon.toLowerCase()]) || Puzzle,
    component: () => null, // Placeholder - rendered via PanelRenderer extension path
    defaultZone: "left",
    showInActivityBar: true,
  };
}

extensionViewRegistry.onChanged((views) => {
  dynamicPanels.clear();
  for (const v of views) {
    dynamicPanels.set(v.id, buildExtensionViewPanel(v));
  }
});

export function getAllPanels(): PanelDefinition[] {
  return [...builtinPanels, ...dynamicPanels.values()];
}

export function getPanel(id: PanelId): PanelDefinition | undefined {
  return builtinPanels.find((p) => p.id === id) ?? dynamicPanels.get(id);
}

export function getDefaultZone(id: PanelId): DockZone | undefined {
  return getPanel(id)?.defaultZone;
}

export function getPanelsByZone(zone: DockZone): PanelDefinition[] {
  return getAllPanels().filter((p) => p.defaultZone === zone);
}

export function getActivityBarPanels(): PanelDefinition[] {
  return getAllPanels().filter((p) => p.showInActivityBar);
}

export const DEFAULT_ZONES = {
  left: {
    panelIds: ["explorer", "search", "git", "extensions"] as PanelId[],
    activePanelId: "explorer" as PanelId,
    size: 260,
    isVisible: true,
  },
  right: {
    panelIds: ["debug", "outline"] as PanelId[],
    activePanelId: "outline" as PanelId,
    size: 260,
    isVisible: false,
  },
  bottom: {
    panelIds: ["terminal", "problems", "output", "debug-console", "markdown-preview"] as PanelId[],
    activePanelId: "terminal" as PanelId,
    size: 220,
    isVisible: false,
  },
} as const;
