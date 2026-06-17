import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { parseMarkdown } from "@/lib/markdownParser";
import {
  FileText,
  ListTree,
} from "lucide-react";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  fileName?: string;
  onScroll?: (ratio: number) => void;
  scrollRatio?: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const codeLanguageColors: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  python: "#3572A5",
  rust: "#dea584",
  go: "#00ADD8",
  java: "#b07219",
  ruby: "#701516",
  php: "#4F5D95",
  c: "#555555",
  cpp: "#f34b7d",
  csharp: "#178600",
  swift: "#ffac45",
  kotlin: "#F18E33",
  scala: "#c22d40",
  shell: "#89e051",
  bash: "#89e051",
  powershell: "#012456",
  sql: "#e38c00",
  html: "#e34c26",
  css: "#563d7c",
  json: "#292929",
  yaml: "#cb171e",
  markdown: "#083fa1",
  dockerfile: "#384d54",
  xml: "#0060ac",
  plaintext: "#666666",
};

const codeKeywords: Record<string, string[]> = {
  typescript: ["import", "from", "export", "default", "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "interface", "type", "extends", "implements", "async", "await", "new", "throw", "try", "catch", "finally", "this", "super", "true", "false", "null", "undefined", "typeof", "instanceof", "void", "delete", "in", "of", "as", "keyof", "readonly", "static", "private", "protected", "public", "abstract", "declare", "enum", "module", "namespace"],
  javascript: ["import", "from", "export", "default", "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "extends", "async", "await", "new", "throw", "try", "catch", "finally", "this", "super", "true", "false", "null", "undefined", "typeof", "instanceof", "void", "delete", "in", "of"],
  python: ["import", "from", "def", "class", "return", "if", "elif", "else", "for", "while", "try", "except", "finally", "with", "as", "async", "await", "yield", "lambda", "pass", "break", "continue", "raise", "and", "or", "not", "in", "is", "True", "False", "None", "self", "global", "nonlocal"],
  rust: ["fn", "let", "mut", "const", "if", "else", "for", "while", "loop", "match", "return", "struct", "enum", "impl", "trait", "use", "mod", "pub", "self", "super", "crate", "where", "as", "in", "ref", "move", "async", "await", "true", "false", "Some", "None", "Ok", "Err", "unsafe", "type", "dyn"],
  go: ["func", "package", "import", "var", "const", "type", "struct", "interface", "map", "chan", "go", "defer", "select", "case", "default", "if", "else", "for", "range", "switch", "break", "continue", "return", "true", "false", "nil", "make", "new", "append", "len", "cap"],
  java: ["package", "import", "class", "interface", "extends", "implements", "public", "private", "protected", "static", "final", "abstract", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "return", "throw", "throws", "try", "catch", "finally", "new", "this", "super", "true", "false", "null", "void"],
  cpp: ["#include", "using", "namespace", "class", "struct", "enum", "template", "typename", "virtual", "override", "const", "constexpr", "static", "extern", "inline", "public", "private", "protected", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "return", "new", "delete", "throw", "try", "catch", "this", "true", "false", "nullptr", "void"],
  csharp: ["using", "namespace", "class", "struct", "enum", "interface", "async", "await", "var", "const", "readonly", "static", "virtual", "override", "abstract", "sealed", "public", "private", "protected", "internal", "if", "else", "for", "foreach", "while", "do", "switch", "case", "break", "continue", "return", "throw", "try", "catch", "finally", "new", "this", "base", "true", "false", "null", "void", "int", "string", "bool", "double", "float", "char", "byte", "object", "var"],
  php: ["<?php", "namespace", "use", "class", "function", "return", "if", "else", "elseif", "for", "foreach", "while", "switch", "case", "break", "continue", "new", "throw", "try", "catch", "finally", "public", "private", "protected", "static", "const", "true", "false", "null", "echo", "array", "isset", "empty"],
  ruby: ["def", "class", "module", "require", "include", "extend", "if", "elsif", "else", "unless", "for", "while", "until", "do", "end", "return", "yield", "new", "throw", "catch", "begin", "rescue", "ensure", "true", "false", "nil", "self", "super"],
  swift: ["import", "class", "struct", "enum", "protocol", "extension", "func", "var", "let", "if", "else", "for", "while", "switch", "case", "break", "continue", "return", "throw", "try", "catch", "async", "await", "new", "self", "super", "true", "false", "nil", "guard", "defer", "in", "as", "is"],
};

function highlightLine(line: string, lang: string): string {
  const keywords = codeKeywords[lang] || [];
  let result = escapeHtml(line);
  if (!result) return result;

  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`\\b(${escaped})\\b`, "g"),
      '<span style="color:#cba6f7;">$1</span>',
    );
  }

  result = result.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    '<span style="color:#a6e3a1;">$1</span>',
  );

  result = result.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span style="color:#fab387;">$1</span>',
  );

  result = result.replace(
    /(\/\/.*$|#.*$)/gm,
    '<span style="color:#6c7086;">$1</span>',
  );

  return result;
}

function getCodeLanguage(label: string): string {
  return label || "plaintext";
}

function clipboardSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
}

function checkSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
}

function renderHtmlWithSyntaxHighlighting(html: string): string {
  return html.replace(
    /<pre(?: class="lang-([^"]*)")?><code(?: class="lang-[^"]*")?>([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      const langName = getCodeLanguage(lang || "");
      const langColor = codeLanguageColors[langName] || "#666666";
      const lines = code.split("\n");
      const highlighted = lines.map((l: string) => highlightLine(l, langName)).join("\n");
      const codeId = `cb-${Math.random().toString(36).slice(2, 8)}`;

      return `<div class="code-block-wrapper relative group my-4 rounded-lg overflow-hidden border border-border/10 shadow-sm">
<div class="code-block-header flex items-center gap-2 px-3.5 py-1.5 text-[11px] font-sans border-b border-border/10" style="background:${langColor}12;">
<span class="inline-block size-2.5 rounded-full opacity-80" style="background:${langColor};"></span>
<span class="font-semibold tracking-wider uppercase text-[10px]" style="color:${langColor};">${langName}</span>
</div>
<pre class="lang-${langName} m-0 overflow-x-auto text-sm leading-relaxed" data-code-id="${codeId}" style="background:#1e1e2e;color:#cdd6f4;padding:18px 16px;tab-size:2;"><code class="lang-${langName}">${highlighted}</code></pre>
<button type="button" class="code-copy-btn absolute top-2 right-2 hidden items-center gap-1 rounded px-2 py-0.5 text-[11px] cursor-pointer font-sans" data-code-id="${codeId}" style="background:rgba(30,30,46,0.9);color:#a6adc8;border:1px solid rgba(255,255,255,0.1);" aria-label="Copy code">${clipboardSvg()} Copy</button>
</div>`;
    },
  );
}

export function MarkdownPreview({
  content,
  className,
  fileName,
  onScroll,
  scrollRatio,
}: MarkdownPreviewProps) {
  const [showToc, setShowToc] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const prevScrollRatioRef = useRef(scrollRatio ?? -1);

  const { html, toc } = useMemo(() => parseMarkdown(content), [content]);

  const enhancedHtml = useMemo(
    () => renderHtmlWithSyntaxHighlighting(html),
    [html],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    function handleMouseOver(e: MouseEvent) {
      const wrapper = (e.target as HTMLElement).closest(".code-block-wrapper") as HTMLElement | null;
      if (!wrapper) return;
      const btn = wrapper.querySelector(".code-copy-btn") as HTMLElement | null;
      if (btn) btn.style.display = "flex";
    }

    function handleMouseOut(e: MouseEvent) {
      const wrapper = (e.target as HTMLElement).closest(".code-block-wrapper") as HTMLElement | null;
      if (!wrapper) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (wrapper.contains(related)) return;
      const btn = wrapper.querySelector(".code-copy-btn") as HTMLElement | null;
      if (btn) btn.style.display = "none";
    }

    function handleClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest(".code-copy-btn") as HTMLElement | null;
      if (!btn) return;
      const codeId = btn.getAttribute("data-code-id");
      if (!codeId) return;
      const pre = container.querySelector(`pre[data-code-id="${codeId}"]`);
      if (!pre) return;
      const code = pre.textContent || "";

      navigator.clipboard.writeText(code).then(() => {
        btn.innerHTML = `${checkSvg()} Copied`;
        setTimeout(() => {
          btn.innerHTML = `${clipboardSvg()} Copy`;
        }, 2000);
      }).catch(() => {});
    }

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseout", handleMouseOut);
    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseout", handleMouseOut);
      container.removeEventListener("click", handleClick);
    };
  }, []);

  useEffect(() => {
    if (!viewportRef.current) return;
    const viewport = viewportRef.current;

    if (scrollRatio !== undefined && scrollRatio !== prevScrollRatioRef.current) {
      prevScrollRatioRef.current = scrollRatio;
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      if (maxScroll > 0) {
        viewport.scrollTop = maxScroll * scrollRatio;
      }
    }
  }, [scrollRatio]);

  const handleScroll = useCallback(() => {
    if (!viewportRef.current || !onScroll) return;
    const el = viewportRef.current;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 0) {
      onScroll(el.scrollTop / maxScroll);
    }
  }, [onScroll]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const viewport = viewportRef.current;
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const [activeHeading, setActiveHeading] = useState<string | null>(null);

  useEffect(() => {
    if (!viewportRef.current || toc.length === 0) return;
    const viewport = viewportRef.current;

    const handleScrollUpdate = () => {
      let closest: string | null = null;
      let closestDist = Infinity;
      for (const entry of toc) {
        const el = viewport.querySelector(`#${CSS.escape(entry.id)}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top - 80);
        if (dist < closestDist) {
          closestDist = dist;
          closest = entry.id;
        }
      }
      setActiveHeading(closest);
    };

    viewport.addEventListener("scroll", handleScrollUpdate, { passive: true });
    handleScrollUpdate();
    return () => viewport.removeEventListener("scroll", handleScrollUpdate);
  }, [toc]);

  const scrollToHeading = useCallback((id: string) => {
    if (!viewportRef.current) return;
    const el = viewportRef.current.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (!content) {
    return (
      <div className={cn("flex items-center justify-center h-full text-muted-foreground text-sm", className)}>
        <div className="flex flex-col items-center gap-2">
          <FileText className="size-8 opacity-40" />
          <span>No content to preview</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full relative", className)}>
      <div className="relative flex-1 min-w-0">
        <ScrollArea className="h-full">
          <div
            ref={viewportRef}
            data-slot="scroll-area-viewport"
            className="h-full overflow-auto"
          >
            <div className="mx-auto max-w-prose px-8 py-6">
              <div
                ref={containerRef}
                className="markdown-preview
                  [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:pb-2 [&_h1]:border-b [&_h1]:border-border
                  [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:pb-1.5 [&_h2]:border-b [&_h2]:border-border
                  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2
                  [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mb-2
                  [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:mb-2
                  [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:mb-2
                  [&_p]:mb-4 [&_p]:leading-relaxed
                  [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/30 [&_a]:hover:decoration-primary
                  [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:bg-muted/30 [&_blockquote]:py-2 [&_blockquote]:pr-4 [&_blockquote]:rounded-r-lg [&_blockquote]:mb-4
                  [&_ul]:pl-6 [&_ul]:space-y-1 [&_ul]:list-disc [&_ul]:mb-4
                  [&_ol]:pl-6 [&_ol]:space-y-1 [&_ol]:list-decimal [&_ol]:mb-4
                  [&_li>input[type=checkbox]]:mr-2 [&_li>input[type=checkbox]]:accent-primary
                  [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
                  [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:bg-muted/50
                  [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-left
                  [&_hr]:my-8 [&_hr]:border-border
                  [&_img]:rounded-lg [&_img]:max-w-full [&_img]:h-auto
                  [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
                  [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0 [&_pre_code]:rounded-none [&_pre_code]:text-sm
                  [&_li]:leading-relaxed
                  [&_ul_task-list]:list-none [&_ul_task-list]:pl-0"
                dangerouslySetInnerHTML={{ __html: enhancedHtml }}
              />
            </div>
          </div>
        </ScrollArea>
        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
          {fileName && (
            <span className="flex items-center gap-1 rounded bg-background/80 border border-border px-2 py-1 text-xs text-muted-foreground">
              <FileText className="size-3" />
              {fileName}
            </span>
          )}
          {toc.length > 0 && (
            <button
              type="button"
              onClick={() => setShowToc(!showToc)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-xs border transition-colors cursor-pointer",
                showToc
                  ? "bg-accent text-foreground border-accent"
                  : "bg-background/80 border-border text-muted-foreground hover:text-foreground",
              )}
              title="Table of Contents"
            >
              <ListTree className="size-3.5" />
              ToC
            </button>
          )}
        </div>
      </div>
      {showToc && toc.length > 0 && (
        <div className="w-56 shrink-0 border-l border-border bg-background/50 overflow-y-auto">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
            Table of Contents
          </div>
          <nav className="p-2 space-y-0.5">
            {toc.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => scrollToHeading(entry.id)}
                className={cn(
                  "block w-full text-left rounded px-2 py-1 text-xs transition-colors cursor-pointer",
                  activeHeading === entry.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
                style={{ paddingLeft: `${8 + (entry.level - 1) * 12}px` }}
              >
                {entry.text}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
