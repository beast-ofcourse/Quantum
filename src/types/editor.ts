export interface Tab {
  id: string;
  path: string;
  name: string;
  language: string;
  isDirty: boolean;
  savedContent: string;
  currentContent: string;
  cursor: { line: number; col: number };
  encoding?: string;
  isLargeFile?: boolean;
  pinned?: boolean;
}

export interface EditorStoreState {
  openTabs: Tab[];
  activeTabId: string | null;
  openFile: (path: string) => Promise<void>;
  closeTab: (id: string, options?: { force?: boolean }) => Promise<boolean>;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  saveFile: (id: string) => Promise<void>;
  saveAll: () => Promise<void>;
  closeAll: (options?: { force?: boolean }) => Promise<void>;
  closeOthers: (id: string, options?: { force?: boolean }) => Promise<void>;
  closeToTheRight: (id: string) => void;
  togglePin: (id: string) => void;
  cycleTab: (direction: 1 | -1) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
  setCursor: (id: string, line: number, col: number) => void;
  handleExternalChange: (path: string) => void;
  pendingExternalChange: { path: string; tabName: string } | null;
  clearExternalChange: () => void;
  acceptExternalChange: (path: string) => Promise<void>;
  getActiveTab: () => Tab | null;
  lastClosedTab: { path: string; name: string } | null;
  setLastClosedTab: (tab: { path: string; name: string } | null) => void;
  tabHistory: string[];
  navigateBack: () => void;
  navigateForward: () => void;
  splitEditorId: string | null;
  setSplitEditor: (id: string | null) => void;
  toggleSplitEditor: (id: string) => void;
  splitPosition: number;
  setSplitPosition: (position: number) => void;
}
