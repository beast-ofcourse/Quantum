import { useState, useEffect } from "react";
import { GitCommit, RotateCcw, UserPlus, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGitStore } from "@/stores/gitStore";

const COMMIT_TYPES = [
  { emoji: "🐛", label: "Fix", prefix: "fix:" },
  { emoji: "✨", label: "Feat", prefix: "feat:" },
  { emoji: "📝", label: "Docs", prefix: "docs:" },
  { emoji: "♻️", label: "Refactor", prefix: "refactor:" },
  { emoji: "✅", label: "Test", prefix: "test:" },
  { emoji: "🔧", label: "Chore", prefix: "chore:" },
  { emoji: "⚡", label: "Perf", prefix: "perf:" },
  { emoji: "🎨", label: "Style", prefix: "style:" },
  { emoji: "🚀", label: "Release", prefix: "release:" },
  { emoji: "⏪", label: "Revert", prefix: "revert:" },
];

const COMMIT_TEMPLATES = [
  { label: "Bug fix", value: "fix:\n\nFixes #\n" },
  { label: "Feature", value: "feat:\n\nCloses #\n" },
  { label: "Docs", value: "docs: update\n\n" },
  { label: "Refactor", value: "refactor:\n\n" },
  { label: "WIP", value: "WIP:\n\n" },
];

export function GitCommitBox() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [amend, setAmend] = useState(false);
  const [showCommitTypes, setShowCommitTypes] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCoAuthor, setShowCoAuthor] = useState(false);
  const [coAuthors, setCoAuthors] = useState<string[]>([]);
  const [coAuthorInput, setCoAuthorInput] = useState("");
  // Restore draft from previous session
  useEffect(() => {
    try {
      const savedSubject = localStorage.getItem("git:draft:subject");
      const savedBody = localStorage.getItem("git:draft:body");
      if (savedSubject) setSubject(savedSubject);
      if (savedBody) setBody(savedBody);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Persist draft on every change
  useEffect(() => {
    try {
      localStorage.setItem("git:draft:subject", subject);
      localStorage.setItem("git:draft:body", body);
    } catch {
      // localStorage full or unavailable
    }
  }, [subject, body]);

  const committing = useGitStore((s) => s.committing);
  const commit = useGitStore((s) => s.commit);
  const status = useGitStore((s) => s.status);

  const canCommit = subject.trim().length > 0 && status && (status.staged.length > 0 || amend);

  const buildMessage = () => {
    let msg = subject.trim();
    if (body.trim()) msg += "\n\n" + body.trim();
    if (coAuthors.length > 0) {
      msg += "\n\n" + coAuthors.map((c) => `Co-authored-by: ${c}`).join("\n");
    }
    return msg;
  };

  const handleCommit = async () => {
    if (!canCommit) return;
    try {
      await commit(buildMessage(), { amend });
      setSubject("");
      setBody("");
      setAmend(false);
      setCoAuthors([]);
      try {
        localStorage.removeItem("git:draft:subject");
        localStorage.removeItem("git:draft:body");
      } catch { /* noop */ }
    } catch {
      // Keep state on failure so user can retry
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      void handleCommit();
    }
  };

  const insertPrefix = (prefix: string) => {
    setSubject((prev) => {
      if (prev.startsWith(prefix)) return prev;
      const clean = prev.replace(/^(fix:|feat:|docs:|refactor:|test:|chore:|perf:|style:|release:|revert:)\s*/i, "");
      return `${prefix} ${clean}`;
    });
  };

  const applyTemplate = (value: string) => {
    const parts = value.split("\n\n");
    setSubject(parts[0] || "");
    setBody(parts.slice(1).join("\n\n").trim());
    setShowTemplates(false);
  };

  const addCoAuthor = () => {
    const trimmed = coAuthorInput.trim();
    if (trimmed && /^.+\s+<.+>$/.test(trimmed)) {
      setCoAuthors((prev) => [...prev, trimmed]);
      setCoAuthorInput("");
    }
  };

  const removeCoAuthor = (idx: number) => {
    setCoAuthors((prev) => prev.filter((_, i) => i !== idx));
  };


  return (
    <div className="space-y-1.5 px-2 py-1.5">
      <Input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Commit subject..."
        className="h-7 text-sm"
      />
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className={subject.length > 50 ? "text-yellow-500" : ""}>
          {subject.length}/50
        </span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Body (optional)..."
        rows={1}
        className="w-full resize-none rounded border border-border/50 bg-background p-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCommitTypes(!showCommitTypes)}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showCommitTypes ? "−" : "+"} Type
        </button>
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Sparkles className="size-2.5 inline mr-0.5" />
          Templates
        </button>
        <button
          onClick={() => setShowCoAuthor(!showCoAuthor)}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <UserPlus className="size-2.5 inline mr-0.5" />
          Co-author
        </button>
      </div>

      {showCommitTypes && (
        <div className="flex flex-wrap gap-1">
          {COMMIT_TYPES.map((t) => (
            <button
              key={t.prefix}
              onClick={() => insertPrefix(t.prefix)}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={t.label}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      )}

      {showTemplates && (
        <div className="flex flex-wrap gap-1">
          {COMMIT_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t.value)}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {showCoAuthor && (
        <div className="flex items-center gap-1.5">
          <Input
            value={coAuthorInput}
            onChange={(e) => setCoAuthorInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCoAuthor(); }}
            placeholder="Name &lt;email&gt;"
            className="h-6 text-[11px] flex-1"
          />
          {coAuthorInput && (
            <Button variant="ghost" size="xs" onClick={addCoAuthor}>
              Add
            </Button>
          )}
        </div>
      )}
      {coAuthors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {coAuthors.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
              {c}
              <button onClick={() => removeCoAuthor(i)} className="hover:text-foreground text-muted-foreground">
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm"
          className="flex-1 h-6 text-xs"
          disabled={!canCommit || committing}
          onClick={handleCommit}
        >
          <GitCommit className="mr-1 size-3" />
          {committing ? "Committing..." : "Commit"}
        </Button>
        <Button
          variant={amend ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setAmend(!amend)}
          title="Amend last commit"
          className="h-6 w-6"
        >
          <RotateCcw className="size-3" />
        </Button>
      </div>
      {!canCommit && !amend && (
        <p className="text-[10px] text-muted-foreground text-center">
          Stage changes before committing.
        </p>
      )}
    </div>
  );
}
