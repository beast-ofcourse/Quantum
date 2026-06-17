import { useState, useEffect, useCallback, useRef } from "react";
import {
  getCurrentEditor,
  getMonacoModule,
} from "@/extensions/editorRef";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, Logs } from "lucide-react";

interface OutlineSymbol {
  name: string;
  kind: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  children?: OutlineSymbol[];
}

const SYMBOL_KIND_ICONS: Record<string, string> = {
  Function: "ƒ",
  Method: "ƒ",
  Class: "C",
  Interface: "I",
  Module: "M",
  Variable: "v",
  Constant: "c",
  Property: "p",
  Enum: "E",
  Array: "a",
  Constructor: "C",
  Field: "p",
  EnumMember: "E",
  Struct: "S",
  TypeAlias: "T",
  Namespace: "N",
};

function getSymbolIcon(kind: string): string {
  return SYMBOL_KIND_ICONS[kind] ?? "?";
}

export function OutlinePanel() {
  const activeTab = useEditorStore((s) => s.getActiveTab());
  const [symbols, setSymbols] = useState<OutlineSymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [activeLine, setActiveLine] = useState<number>(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const editor = getCurrentEditor();

  // Track cursor line from active tab
  useEffect(() => {
    if (activeTab) {
      setActiveLine(activeTab.cursor.line);
    }
  }, [activeTab?.cursor.line, activeTab?.id]);

  // Subscribe to editor cursor changes for real-time highlight
  useEffect(() => {
    if (!editor) return;
    const disposable = editor.onDidChangeCursorPosition((e) => {
      setActiveLine(e.position.lineNumber);
    });
    return () => disposable.dispose();
  }, [editor, activeTab?.id]);

  // Fetch symbols when active tab changes
  const fetchSymbols = useCallback(() => {
    const ed = getCurrentEditor();
    const mm = getMonacoModule();
    if (!ed || !mm || !activeTab) {
      setSymbols([]);
      return;
    }

    setLoading(true);
    setError(null);

    const model = ed.getModel();
    if (!model) {
      setLoading(false);
      setSymbols([]);
      return;
    }

    (mm.languages as unknown as { executeDocumentSymbolProvider: (uri: unknown) => Promise<unknown> })
      .executeDocumentSymbolProvider(model.uri)
      .then((result: unknown) => {
        if (!result) {
          setSymbols([]);
          setLoading(false);
          return;
        }
        // result is DocumentSymbol[] — walk nested structure
        const items = flattenSymbols(result as DocumentSymbol[], mm);
        setSymbols(items);

        // Auto-expand items with children
        const hasChildren = items.some((s) => s.children && s.children.length > 0);
        if (hasChildren) {
          setExpanded(new Set(items.filter((s) => s.children?.length).map((s) => s.name)));
        } else {
          setExpanded(new Set());
        }

        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load symbols");
        setLoading(false);
      });
  }, [activeTab?.id]);

  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  // Debounced refresh on content change
  useEffect(() => {
    if (!activeTab) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchSymbols, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeTab?.currentContent]);

  const navigateToSymbol = useCallback(
    (sym: OutlineSymbol) => {
      const ed = getCurrentEditor();
      if (!ed) return;
      ed.revealRangeInCenter({
        startLineNumber: sym.range.startLineNumber,
        startColumn: sym.range.startColumn,
        endLineNumber: sym.range.startLineNumber,
        endColumn: sym.range.startColumn,
      });
      ed.setPosition({
        lineNumber: sym.range.startLineNumber,
        column: sym.range.startColumn,
      });
      ed.focus();
    },
    [],
  );

  const toggleExpand = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const isSymbolActive = useCallback(
    (sym: OutlineSymbol) =>
      activeLine >= sym.range.startLineNumber &&
      activeLine <= sym.range.endLineNumber,
    [activeLine],
  );

  if (!activeTab) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <Logs className="size-8 opacity-40" />
        <p className="text-xs">No file open</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
        <p className="text-xs text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border px-2">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          OUTLINE
        </span>
        {symbols.length > 0 && (
          <span className="text-[10px] text-muted-foreground/60">
            ({symbols.length})
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {loading && symbols.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Loading symbols…
          </p>
        ) : symbols.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No symbols found
          </p>
        ) : (
          symbols.map((sym) => (
            <div key={sym.name + sym.range.startLineNumber}>
              <button
                onClick={() => {
                  if (sym.children && sym.children.length > 0) {
                    toggleExpand(sym.name);
                  }
                  navigateToSymbol(sym);
                }}
                className={cn(
                  "flex w-full items-center gap-1 px-2 py-1 text-left text-xs hover:bg-muted transition-colors",
                  isSymbolActive(sym) && !sym.children?.length
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {sym.children && sym.children.length > 0 ? (
                  expanded.has(sym.name) ? (
                    <ChevronDown className="size-3 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" />
                  )
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <span className="flex size-3.5 shrink-0 items-center justify-center rounded bg-muted-foreground/10 text-[8px] font-mono text-muted-foreground">
                  {getSymbolIcon(sym.kind)}
                </span>
                <span className="truncate">{sym.name}</span>
                <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/50">
                  {sym.range.startLineNumber}
                </span>
              </button>
              {sym.children && expanded.has(sym.name) && (
                <div className="border-l border-border/50 ml-2.5 pl-2">
                  {sym.children.map((child) => (
                    <button
                      key={child.name + child.range.startLineNumber}
                      onClick={() => navigateToSymbol(child)}
                      className={cn(
                        "flex w-full items-center gap-1 pl-1 pr-2 py-0.5 text-left text-[11px] hover:bg-muted transition-colors rounded-sm",
                        isSymbolActive(child)
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <span className="flex size-3 shrink-0 items-center justify-center rounded bg-muted-foreground/10 text-[7px] font-mono text-muted-foreground">
                        {getSymbolIcon(child.kind)}
                      </span>
                      <span className="truncate">{child.name}</span>
                      <span className="ml-auto shrink-0 text-[8px] text-muted-foreground/50">
                        {child.range.startLineNumber}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DocumentSymbol {
  name: string;
  kind: number;
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  children?: DocumentSymbol[];
}

function flattenSymbols(
  raw: DocumentSymbol[],
  mm: { languages: { SymbolKind: Record<number, string> } },
): OutlineSymbol[] {
  function walk(symbols: DocumentSymbol[]): OutlineSymbol[] {
    return symbols.map((s) => ({
      name: s.name,
      kind: mm.languages.SymbolKind[s.kind] ?? "Symbol",
      range: {
        startLineNumber: s.range.startLineNumber,
        startColumn: s.range.startColumn,
        endLineNumber: s.range.endLineNumber,
        endColumn: s.range.endColumn,
      },
      children: s.children && s.children.length > 0 ? walk(s.children) : undefined,
    }));
  }
  return walk(raw);
}
