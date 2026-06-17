export type FileNodeKind = "file" | "directory";

export interface FileNode {
  name: string;
  path: string;
  kind: FileNodeKind;
  children?: FileNode[];
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export interface ReadDirResult {
  entries: FileEntry[];
  gitignore: string | null;
}

export interface FsChangeEvent {
  root: string;
  kind: "create" | "modify" | "remove" | "access" | "any" | "other" | string;
  paths: string[];
}

export interface FileTreeWorkerRequest {
  type: "build";
  requestId: string;
  rootPath: string;
  entries: FileEntry[];
  gitignore: string | null;
  showHidden: boolean;
}

export interface FileTreeWorkerResponse {
  type: "built" | "error";
  requestId: string;
  tree?: FileNode[];
  error?: string;
}
