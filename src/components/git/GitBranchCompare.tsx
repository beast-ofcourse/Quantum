import { useState } from "react";
import { GitBranch, ArrowRight, ArrowLeft, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useGitStore } from "@/stores/gitStore";

function BranchSelect({
  value, onChange, label, branches, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  branches: { name: string }[];
  placeholder: string;
}) {
  return (
    <div className="flex-1 relative">
      <label className="text-[10px] font-medium text-muted-foreground">{label}</label>
      <div className="mt-1 relative">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full h-7 text-xs font-mono">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Select branch...</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function GitBranchCompare() {
  const branches = useGitStore((s) => s.branches);
  const branchCompareResult = useGitStore((s) => s.branchCompareResult);
  const compareBranches = useGitStore((s) => s.compareBranches);
  const setBranchCompareBase = useGitStore((s) => s.setBranchCompareBase);
  const setBranchCompareHead = useGitStore((s) => s.setBranchCompareHead);
  const branchCompareBase = useGitStore((s) => s.branchCompareBase);
  const branchCompareHead = useGitStore((s) => s.branchCompareHead);
  const error = useGitStore((s) => s.error);
  const [loading, setLoading] = useState(false);

  const localBranches = branches.filter((b) => !b.isRemote);
  const baseBranch = branchCompareBase || (localBranches.find((b) => b.isHead)?.name ?? "");
  const headBranch = branchCompareHead || (localBranches.length > 1 ? localBranches.find((b) => !b.isHead)?.name ?? "" : "");

  const handleCompare = async () => {
    if (!baseBranch || !headBranch) return;
    setLoading(true);
    try {
      await compareBranches(baseBranch, headBranch);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <GitBranch className="size-3.5" />
          Branch Compare
        </div>
      </header>
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-2">
          <BranchSelect
            value={baseBranch}
            onChange={setBranchCompareBase}
            label="Base"
            branches={localBranches}
            placeholder="Select branch..."
          />
          <ArrowRight className="size-4 text-muted-foreground mt-6 shrink-0" />
          <BranchSelect
            value={headBranch}
            onChange={setBranchCompareHead}
            label="Head"
            branches={localBranches}
            placeholder="Select branch..."
          />
        </div>
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={handleCompare}
          disabled={loading || !baseBranch || !headBranch}
        >
          {loading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
          Compare
        </Button>
        {error && <div className="text-xs text-red-500">{error}</div>}
        {branchCompareResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1 text-green-400">
                <ArrowLeft className="size-3" />
                Ahead: {branchCompareResult.aheadCount}
              </div>
              <div className="flex items-center gap-1 text-red-400">
                <ArrowRight className="size-3" />
                Behind: {branchCompareResult.behindCount}
              </div>
            </div>
            {branchCompareResult.aheadCommits.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Ahead Commits</div>
                <div className="space-y-0.5">
                  {branchCompareResult.aheadCommits.map((c, i) => (
                    <div key={i} className="text-xs font-mono truncate text-green-400/80">{c}</div>
                  ))}
                </div>
              </div>
            )}
            {branchCompareResult.behindCommits.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Behind Commits</div>
                <div className="space-y-0.5">
                  {branchCompareResult.behindCommits.map((c, i) => (
                    <div key={i} className="text-xs font-mono truncate text-red-400/80">{c}</div>
                  ))}
                </div>
              </div>
            )}
            {branchCompareResult.files.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase mb-1">
                  <FileText className="size-3" />
                  Changed Files ({branchCompareResult.files.length})
                </div>
                <div className="space-y-0.5">
                  {branchCompareResult.files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate">{f.path}</span>
                      <span className="text-green-400 shrink-0">+{f.added}</span>
                      <span className="text-red-400 shrink-0">-{f.deleted}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
