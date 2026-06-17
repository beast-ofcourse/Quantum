export interface MarkdownFileInfo {
  path: string;
  name: string;
  content: string;
}

export type MarkdownViewMode = "editor" | "preview" | "split";
