export interface ExtensionManifest {
  name: string;
  displayName: string;
  description: string;
  version: string;
  main: string;
  path: string;
}

export interface ExtensionInfo {
  id: string;
  manifest: ExtensionManifest;
  isActive: boolean;
  error: string | null;
}

export interface Disposable {
  dispose(): void;
}

export function disposableFrom(fn: () => void): Disposable {
  return { dispose: fn };
}

export interface StatusBarItem extends Disposable {
  text: string;
  setText(text: string): void;
  show(): void;
  hide(): void;
}

export interface Document {
  path: string;
  language: string;
  content: string;
  isDirty: boolean;
}

export interface ChangeEvent {
  path: string;
  content: string;
}

export interface CursorEvent {
  path: string;
  line: number;
  col: number;
}

export interface ExtensionAPI {
  extensionDir: string;
  commands: {
    register(id: string, handler: (...args: unknown[]) => unknown): Disposable;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
  };
  editor: {
    onOpen(cb: (doc: Document) => void): Disposable;
    onClose(cb: (doc: Document) => void): Disposable;
    onSave(cb: (doc: Document) => void): Disposable;
    onChange(cb: (e: ChangeEvent) => void): Disposable;
    onDidChangeActiveEditor(cb: (doc: Document | null) => void): Disposable;
    onDidChangeCursorPosition(cb: (e: CursorEvent) => void): Disposable;
    getActiveDocument(): Document | null;
    openFile(path: string): Promise<void>;
  };
  window: {
    showInfo(msg: string): void;
    showWarn(msg: string): void;
    showError(msg: string): void;
    showInput(prompt: string): Promise<string | null>;
    showQuickPick(items: string[], placeHolder?: string): Promise<string | null>;
  };
  statusBar: {
    create(opts: {
      text: string;
      alignment?: "left" | "right";
      priority?: number;
      tooltip?: string;
      command?: string;
    }): StatusBarItem;
  };
  views: {
    register(id: string, opts: {
      title: string;
      icon?: string;
      render: () => HTMLElement;
      onDispose?: () => void;
    }): Disposable;
  };
  settings: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    onChanged(cb: (key: string, value: unknown) => void): Disposable;
  };
  fs: {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    listDir(path: string): Promise<string[]>;
    exists(path: string): Promise<boolean>;
  };
  monaco: {
    editor: typeof import("monaco-editor").editor | null;
    languages: typeof import("monaco-editor").languages | null;
    getEditor(): import("monaco-editor").editor.IStandaloneCodeEditor | null;
  };
  lsp: {
    register(languageId: string, config: { binaryPath: string; args: string[]; initializeOptions?: Record<string, unknown> }): { dispose(): void };
  };
  storage: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
  };
}
