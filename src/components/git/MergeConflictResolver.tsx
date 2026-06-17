import { useState, useEffect } from "react";
import { AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useGitStore } from "@/stores/gitStore";
import { readFile } from "@/tauri/fs";
import { cn } from "@/lib/utils";

interface Props {
  path: string;
}

type ConflictSide = "ours" | "theirs" | "both";

export function MergeConflictResolver({ path }: Props) {
  const stage = useGitStore((s) => s.stage);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    readFile(path)
      .then((data) => { setContent(data); setLoading(false); })
      .catch((err) => { setError(String(err)); setLoading(false); });
  }, [path]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-yellow-500">
        Empty file.
      </div>
    );
  }

  const conflictBlocks = extractConflictBlocks(content);

  const handleAccept = (blockIndex: number, side: ConflictSide) => {
    const block = conflictBlocks[blockIndex];
    if (!block) return;
    setContent((prev) => {
      let replacement: string;
      if (side === "ours") replacement = block.ours;
      else if (side === "theirs") replacement = block.theirs;
      else replacement = `${block.ours}\n${block.theirs}`;
      return prev.replace(block.full, replacement);
    });
    setResolved((prev) => [...prev, `${blockIndex}`]);
  };

  const handleAcceptAll = (side: ConflictSide) => {
    setContent((prev) => {
      const blocks = extractConflictBlocks(prev);
      let result = prev;
      let cursor = 0; // Track position to avoid .replace() matching wrong block
      for (const block of blocks) {
        const startIdx = result.indexOf(block.full, cursor);
        if (startIdx === -1) continue;
        let replacement: string;
        if (side === "ours") replacement = block.ours;
        else if (side === "theirs") replacement = block.theirs;
        else replacement = `${block.ours}\n${block.theirs}`;
        result = result.slice(0, startIdx) + replacement + result.slice(startIdx + block.full.length);
        cursor = startIdx + replacement.length;
      }
      return result;
    });
    setResolved(conflictBlocks.map((_, i) => `${i}`));
  };

  const handleStage = async () => {
    await stage([path]);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-500">
          <AlertCircle className="size-4" />
          Merge Conflict
          <Badge variant="outline" className="text-[10px]">
            {conflictBlocks.length} conflict{conflictBlocks.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => handleAcceptAll("ours")}>
            Accept All Ours
          </Button>
          <Button variant="ghost" size="xs" onClick={() => handleAcceptAll("theirs")}>
            Accept All Theirs
          </Button>
          <Button
            size="xs"
            onClick={handleStage}
            disabled={resolved.length < conflictBlocks.length}
          >
            <Check className="mr-1 size-3" />
            Mark Resolved
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-3 font-mono text-xs">
        <div className="space-y-4">
          {conflictBlocks.map((block, idx) => (
            <div
              key={idx}
              className={cn(
                "rounded-md border p-2",
                resolved.includes(`${idx}`)
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-red-500/30 bg-red-500/5",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Conflict #{idx + 1}
                </span>
                {resolved.includes(`${idx}`) ? (
                  <Badge variant="outline" className="text-[9px] text-green-500">
                    Resolved
                  </Badge>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-5 text-[10px]"
                      onClick={() => handleAccept(idx, "ours")}
                    >
                      Accept Ours
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-5 text-[10px]"
                      onClick={() => handleAccept(idx, "theirs")}
                    >
                      Accept Theirs
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-5 text-[10px]"
                      onClick={() => handleAccept(idx, "both")}
                    >
                      Accept Both
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="rounded bg-muted/30 p-1 text-green-400/80">
                  {block.ours.split("\n").map((l, i) => (
                    <div key={i} className="leading-5">
                      {l}
                    </div>
                  ))}
                </div>
                <div className="text-center text-[10px] text-muted-foreground">=======</div>
                <div className="rounded bg-muted/30 p-1 text-red-400/80">
                  {block.theirs.split("\n").map((l, i) => (
                    <div key={i} className="leading-5">
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ConflictBlock {
  full: string;
  ours: string;
  theirs: string;
}

function advancePastLine(s: string, i: number): number {
  const nl = s.indexOf("\n", i);
  return nl === -1 ? s.length : nl + 1;
}

function extractConflictBlocks(content: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  const markerStart = "<<<<<<< ";
  const markerMid = "=======";
  const markerEnd = ">>>>>>> ";

  let pos = 0;
  while (pos < content.length) {
    const startIdx = content.indexOf(markerStart, pos);
    if (startIdx === -1) break;

    const oursStart = advancePastLine(content, startIdx);

    const midIdx = content.indexOf(markerMid, oursStart);
    if (midIdx === -1) break;

    const theirsStart = advancePastLine(content, midIdx);

    const endIdx = content.indexOf(markerEnd, theirsStart);
    if (endIdx === -1) break;

    const endLine = advancePastLine(content, endIdx);

    const ours = content.slice(oursStart, midIdx).trimEnd();
    const theirs = content.slice(theirsStart, endIdx).trimEnd();
    const full = content.slice(startIdx, endLine);

    blocks.push({ full, ours, theirs });
    pos = endLine;
  }

  return blocks;
}
