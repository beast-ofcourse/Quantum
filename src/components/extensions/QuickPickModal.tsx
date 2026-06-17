import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fuzzyFilter } from "@/lib/fuzzySearch";
import { useModalStore } from "@/stores/modalStore";

export function QuickPickModal() {
  const modal = useModalStore((s) => s.modal);
  const closeModal = useModalStore((s) => s.closeModal);
  const resolveModal = useModalStore((s) => s.resolveModal);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const open = modal !== null;

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setInputVal("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (modal?.kind !== "quickpick") return [];
    return fuzzyFilter(modal.items, query, (s) => s);
  }, [query, modal]);

  const handleSubmit = useCallback(() => {
    if (!modal) return;
    if (modal.kind === "input") {
      resolveModal(inputVal || null);
    } else if (modal.kind === "quickpick") {
      const selected = filtered[activeIdx] ?? null;
      resolveModal(selected);
    }
  }, [modal, inputVal, filtered, activeIdx]);

  const handleEscape = useCallback(() => {
    closeModal();
  }, [closeModal]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleEscape();
        return;
      }
      if (modal?.kind !== "quickpick") return;
      if (e.key === "ArrowDown") {
        if (filtered.length === 0) return;
        e.preventDefault();
        setActiveIdx((p) => Math.min(p + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((p) => Math.max(p - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[activeIdx]) {
        e.preventDefault();
        handleSubmit();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, modal, filtered, activeIdx, handleSubmit, handleEscape]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[20vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleEscape();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-popover shadow-2xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={modal.kind === "input" ? inputVal : query}
            onChange={(e) => {
              if (modal.kind === "input") {
                setInputVal(e.target.value);
              } else {
                setQuery(e.target.value);
                setActiveIdx(0);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={modal.kind === "input" ? modal.prompt : modal.placeHolder ?? "Select..."}
            className="h-10 border-0 bg-transparent pl-9 pr-8 text-sm shadow-none focus-visible:ring-0"
          />
          {((modal.kind === "input" && inputVal) || (modal.kind === "quickpick" && query)) && (
            <button
              onClick={() => modal.kind === "input" ? setInputVal("") : setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {modal.kind === "quickpick" && (
          <>
            <div className="border-t border-border" />
            <ScrollArea className="max-h-56">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No matching items
                </p>
              ) : (
                <div className="py-1">
                  {filtered.map((item, i) => (
                    <button
                      key={item}
                      onClick={() => resolveModal(item)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm hover:bg-muted",
                        activeIdx === i && "bg-muted",
                      )}
                    >
                      <span className="flex-1 truncate">{item}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
}
