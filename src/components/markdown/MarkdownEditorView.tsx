import { useMemo, useState, useCallback, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { MarkdownPreview } from "@/components/markdown/MarkdownPreview";
import { cn } from "@/lib/utils";
import {
  Eye,
  FileEdit,
  Columns2,
  FileText,
} from "lucide-react";

type ViewMode = "editor" | "preview" | "side-by-side";

export function MarkdownEditorView() {
  const activeTab = useEditorStore((s) => s.getActiveTab());
  const updateContent = useEditorStore((s) => s.updateContent);
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRatio = useRef(0);
  const editorScrollRatio = useRef(0);
  const isEditorScrolling = useRef(false);
  const isPreviewScrolling = useRef(false);

  const isMarkdown = useMemo(() => {
    if (!activeTab) return false;
    const path = activeTab.path.toLowerCase();
    return path.endsWith(".md") || path.endsWith(".mdx") || activeTab.language === "markdown";
  }, [activeTab]);

  const content = activeTab?.currentContent ?? "";
  const tabId = activeTab?.id ?? "";

  const modes: { mode: ViewMode; icon: typeof Eye; label: string }[] = [
    { mode: "editor", icon: FileEdit, label: "Editor" },
    { mode: "preview", icon: Eye, label: "Preview" },
    { mode: "side-by-side", icon: Columns2, label: "Split" },
  ];

  const handleEditorScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (isPreviewScrolling.current) return;
    isEditorScrolling.current = true;
    const el = e.currentTarget;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 0) {
      editorScrollRatio.current = el.scrollTop / maxScroll;
    }
  }, []);

  const handlePreviewScroll = useCallback((ratio: number) => {
    if (isEditorScrolling.current) return;
    isPreviewScrolling.current = true;
    previewScrollRatio.current = ratio;
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (tabId) {
        updateContent(tabId, e.target.value);
      }
    },
    [tabId, updateContent],
  );

  if (!isMarkdown || !activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <FileText className="size-8 opacity-40" />
          <span>Open a Markdown file to preview</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-2 py-1 shrink-0">
        <div className="flex items-center gap-1">
          <FileText className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">
            {activeTab.name}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {modes.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors cursor-pointer",
                viewMode === mode
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
              title={label}
            >
              <Icon className="size-3" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {(viewMode === "editor" || viewMode === "side-by-side") && (
          <div
            className={cn(
              "flex flex-col min-w-0",
              viewMode === "side-by-side" ? "w-1/2 border-r border-border" : "w-full",
            )}
          >
            <div className="flex items-center justify-between px-3 py-1 border-b border-border">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Editor
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {content.length} chars
              </span>
            </div>
            <textarea
              ref={editorRef}
              value={content}
              onChange={handleChange}
              onScroll={handleEditorScroll}
              onMouseUp={() => {
                isEditorScrolling.current = false;
                isPreviewScrolling.current = false;
              }}
              className="flex-1 resize-none bg-background text-foreground font-mono text-sm leading-relaxed
                p-4 outline-none border-none focus:ring-0
                selection:bg-primary/20"
              spellCheck={false}
              wrap="off"
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "side-by-side") && (
          <div
            className={cn(
              "flex flex-col min-w-0",
              viewMode === "side-by-side" ? "w-1/2" : "w-full",
            )}
          >
            <div className="flex items-center justify-between px-3 py-1 border-b border-border">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Preview
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <MarkdownPreview
                content={content}
                className="h-full"
                onScroll={handlePreviewScroll}
                scrollRatio={
                  isEditorScrolling.current ? editorScrollRatio.current : undefined
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
