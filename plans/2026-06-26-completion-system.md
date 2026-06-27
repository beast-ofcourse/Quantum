# Completion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-source completion engine that merges, ranks, and presents suggestions from LSP, workspace symbols, language keywords, snippets, and file paths.

**Architecture:** A central `CompletionEngine` orchestrates multiple providers via `ProviderManager`. Each provider implements a common interface and returns results asynchronously. Results are merged, deduplicated, fuzzy-scored, context-ranked, and sorted before being handed to Monaco's suggest widget. No AI/ML features — pure deterministic completion pipeline.

**Tech Stack:** TypeScript, Monaco Editor API, existing LSP infrastructure (`src/lib/lsp/`)

---

## File Structure

```
src/
├── core/completion/
│   ├── types.ts                 # Shared types: CompletionItem, Provider, ProviderContext, RankedItem
│   ├── CompletionEngine.ts      # Central orchestrator — the single Monaco provider
│   ├── ProviderManager.ts       # Registers/unregisters providers, calls them in parallel
│   ├── ContextAnalyzer.ts       # Analyzes cursor context: trigger char, scope, word prefix
│   ├── TriggerManager.ts        # Decides which providers to invoke based on context
│   ├── RankingEngine.ts         # Fuzzy matching, context scoring, sorting, dedup
│   ├── CacheManager.ts          # TTL-based cache with file-change invalidation
│   ├── FuzzyMatcher.ts          # Fast fuzzy string matching (prefix + subsequence)
│   └── CompletionStore.ts       # In-memory store for completion session state
├── providers/
│   ├── LspCompletionProvider.ts       # Delegates to LSP client
│   ├── WorkspaceCompletionProvider.ts # Symbols from workspace index
│   ├── SnippetProvider.ts             # Static + user-defined snippets
│   ├── KeywordProvider.ts             # Language-specific keywords
│   └── PathProvider.ts                # File path completions for imports
└── lib/lsp/
    └── monacoBridge.ts          # REMOVE inline LSP completion registration (lines 87-118)
```

---

### Task 1: Define shared types

**Files:**
- Create: `src/core/completion/types.ts`

This is the foundation — every other file depends on these types.

```typescript
// src/core/completion/types.ts

import type { editor, languages, Position } from "monaco-editor";

/** Raw completion result from a single provider. */
export interface CompletionItem {
  label: string;
  kind: languages.CompletionItemKind;
  detail?: string;
  documentation?: string | { value: string; isTrusted?: boolean };
  insertText?: string;
  sortText?: string;
  filterText?: string;
  range?: IRange;
  /** Provider-specific metadata for ranking. */
  source: string;
  /** Boost factor applied by provider (1.0 = neutral). */
  score: number;
}

/** Context passed to every provider. */
export interface ProviderContext {
  /** Full model text up to cursor. */
  text: string;
  /** Cursor position in Monaco coordinates. */
  position: Position;
  /** Current word being typed. */
  prefix: string;
  /** Trigger character that started completion, if any. */
  triggerChar: string | null;
  /** URI of the current file. */
  uri: string;
  /** Language ID (typescript, python, rust, etc.). */
  language: string;
  /** Whether Ctrl+Space was pressed (manual trigger). */
  manual: boolean;
}

/** A provider that returns completions for a given context. */
export interface CompletionProvider {
  /** Unique provider ID used for debugging and logging. */
  id: string;
  /** Check if this provider can handle the current context (fast check). */
  canProvide(context: ProviderContext): boolean;
  /** Return completions. Can be async. */
  provide(context: ProviderContext): Promise<CompletionItem[]>;
}

/** A ranked item after scoring and sorting. */
export interface RankedItem {
  item: CompletionItem;
  fuzzyScore: number;
  contextScore: number;
  finalScore: number;
}

/** Cache entry with TTL. */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Trigger type for categorizing completion sessions. */
export type TriggerKind = "letter" | "dot" | "angle" | "quote" | "slash" | "manual";
```

- [ ] **Step 1: Write the file**

Create `src/core/completion/types.ts` with all types above.

- [ ] **Step 2: Verify imports are valid**

Run: `npx tsc --noEmit`
Expected: No errors (file is pure types, should compile clean).

- [ ] **Step 3: Commit**

```bash
git add src/core/completion/types.ts
git commit -m "feat(completion): add shared type definitions"
```

---

### Task 2: FuzzyMatcher

**Files:**
- Create: `src/core/completion/FuzzyMatcher.ts`
- Test: `src/core/completion/FuzzyMatcher.test.ts`

Fuzzy matching is critical for ranking. It needs to handle:
- Prefix matching (e.g. "con" → "console")
- Subsequence matching (e.g. "rd" → "readFile")
- Case-insensitive scoring
- Bonus for contiguous matches and camelCase boundaries

```typescript
// src/core/completion/FuzzyMatcher.ts

export interface FuzzyResult {
  score: number;
  matches: number[];
}

/**
 * Score how well `query` matches `target`.
 * Returns null if no match, or a score 0-100.
 *
 * Scoring rules:
 * - Perfect prefix match: 100
 * - Contiguous substring match: 90
 * - CamelCase boundary match bonus: +5 per boundary
 * - Subsequence match: score proportional to match density
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (!query || !target) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact prefix match — highest score
  if (t.startsWith(q)) {
    return { score: 100, matches: [0, q.length - 1] };
  }

  // Contiguous substring match
  const idx = t.indexOf(q);
  if (idx >= 0) {
    return { score: 90, matches: [idx, idx + q.length - 1] };
  }

  // CamelCase boundary matching — split target on uppercase and check each segment
  const segments = target.split(/(?=[A-Z])/).map(s => s.toLowerCase());
  let si = 0;
  const matches: number[] = [];
  for (const ch of q) {
    while (si < segments.length && !segments[si].includes(ch)) si++;
    if (si >= segments.length) break;
    const ci = segments[si].indexOf(ch);
    matches.push(/* approximate offset */ ci);
  }
  if (matches.length === q.length) {
    return { score: 80, matches };
  }

  // Subsequence match — characters appear in order but not contiguously
  let ti = 0;
  const subMatches: number[] = [];
  for (const ch of q) {
    while (ti < t.length && t[ti] !== ch) ti++;
    if (ti >= t.length) break;
    subMatches.push(ti);
    ti++;
  }
  if (subMatches.length === q.length) {
    // Score proportional to density: more spread out = lower score
    const span = subMatches[subMatches.length - 1] - subMatches[0] + 1;
    const density = q.length / Math.max(span, 1);
    return { score: Math.round(60 * density), matches: subMatches };
  }

  // No match
  return null;
}
```

```typescript
// src/core/completion/FuzzyMatcher.test.ts
import { fuzzyMatch } from "./FuzzyMatcher";

function testFuzzy(query: string, target: string, expectedMinScore: number) {
  const result = fuzzyMatch(query, target);
  if (!result) throw new Error(`"${query}" should match "${target}"`);
  if (result.score < expectedMinScore) {
    throw new Error(`"${query}" vs "${target}": expected >= ${expectedMinScore}, got ${result.score}`);
  }
}

function testNoMatch(query: string, target: string) {
  const result = fuzzyMatch(query, target);
  if (result) throw new Error(`"${query}" should NOT match "${target}"`);
}

// Prefix
testFuzzy("con", "console", 100);
testFuzzy("cons", "console", 100);

// Substring
testFuzzy("sole", "console", 90);

// Subsequence
testFuzzy("rd", "readFile", 50);
testFuzzy("rd", "readFile", 50);

// CamelCase boundary
testFuzzy("rf", "readFile", 80);

// No match
testNoMatch("xyz", "console");
testNoMatch("abc", "");

console.log("All fuzzy match tests passed");
```

- [ ] **Step 1: Write FuzzyMatcher.ts**

Create `src/core/completion/FuzzyMatcher.ts` with implementation above.

- [ ] **Step 2: Write the test**

Create `src/core/completion/FuzzyMatcher.test.ts`.

- [ ] **Step 3: Run test**

Run: `npx tsx src/core/completion/FuzzyMatcher.test.ts`
Expected: "All fuzzy match tests passed"

- [ ] **Step 4: Commit**

```bash
git add src/core/completion/FuzzyMatcher.ts src/core/completion/FuzzyMatcher.test.ts
git commit -m "feat(completion): add fuzzy matcher with prefix/substring/subsequence scoring"
```

---

### Task 3: CacheManager

**Files:**
- Create: `src/core/completion/CacheManager.ts`
- Test: `src/core/completion/CacheManager.test.ts`

```typescript
// src/core/completion/CacheManager.ts

export interface CacheOptions {
  /** TTL in milliseconds. Default: 30000. */
  ttl?: number;
}

export class CacheManager {
  private store = new Map<string, { data: unknown; expiresAt: number }>();
  private defaultTtl: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl ?? 30_000;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttl ?? this.defaultTtl),
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix (e.g. "workspace:"). */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
```

```typescript
// src/core/completion/CacheManager.test.ts
import { CacheManager } from "./CacheManager";

// Basic get/set
const cache = new CacheManager({ ttl: 1000 });
cache.set("test", { value: 42 });
const val = cache.get<{ value: number }>("test");
if (!val || val.value !== 42) throw new Error("Basic get/set failed");

// Expiry
const fastCache = new CacheManager({ ttl: 10 });
fastCache.set("expire", true);
await new Promise(r => setTimeout(r, 20));
if (fastCache.get("expire") !== null) throw new Error("Expiry failed");

// Invalidation
const c2 = new CacheManager();
c2.set("workspace:symbols", [1, 2, 3]);
c2.set("workspace:files", ["a.ts"]);
c2.invalidatePrefix("workspace:");
if (c2.get("workspace:symbols") !== null) throw new Error("Prefix invalidation failed");

// Clear
c2.set("keep", true);
c2.clear();
if (c2.get("keep") !== null) throw new Error("Clear failed");

console.log("All cache tests passed");
```

- [ ] **Step 1: Write CacheManager.ts**

Create `src/core/completion/CacheManager.ts`.

- [ ] **Step 2: Write the test**

Create `src/core/completion/CacheManager.test.ts`.

- [ ] **Step 3: Run test**

Run: `npx tsx src/core/completion/CacheManager.test.ts`
Expected: "All cache tests passed"

- [ ] **Step 4: Commit**

```bash
git add src/core/completion/CacheManager.ts src/core/completion/CacheManager.test.ts
git commit -m "feat(completion): add cache manager with TTL and prefix invalidation"
```

---

### Task 4: TriggerManager

**Files:**
- Create: `src/core/completion/TriggerManager.ts`

Decides which providers fire based on the trigger character and context.

```typescript
// src/core/completion/TriggerManager.ts
import type { CompletionProvider, ProviderContext, TriggerKind } from "./types";

export interface TriggerRule {
  /** Which trigger kinds activate this rule. */
  kinds: TriggerKind[];
  /** Provider IDs to invoke. */
  providerIds: string[];
}

const DEFAULT_RULES: TriggerRule[] = [
  { kinds: ["letter"], providerIds: ["lsp", "keywords", "workspace", "snippets"] },
  { kinds: ["dot"], providerIds: ["lsp"] },
  { kinds: ["angle"], providerIds: ["lsp", "snippets"] },
  { kinds: ["quote", "slash"], providerIds: ["path"] },
  { kinds: ["manual"], providerIds: ["lsp", "keywords", "workspace", "snippets", "path"] },
];

export class TriggerManager {
  private rules: TriggerRule[];

  constructor(rules?: TriggerRule[]) {
    this.rules = rules ?? DEFAULT_RULES;
  }

  /** Determine which trigger kind applies to the current context. */
  detectTriggerKind(context: ProviderContext): TriggerKind {
    if (context.manual) return "manual";
    const ch = context.triggerChar;
    if (ch === ".") return "dot";
    if (ch === "<") return "angle";
    if (ch === "\"" || ch === "'") return "quote";
    if (ch === "/") return "slash";
    if (ch && /[a-zA-Z0-9_]/.test(ch)) return "letter";
    return "manual";
  }

  /** Return the list of provider IDs that should be invoked. */
  getActiveProviderIds(context: ProviderContext): string[] {
    const kind = this.detectTriggerKind(context);
    const ids = new Set<string>();
    for (const rule of this.rules) {
      if (rule.kinds.includes(kind)) {
        for (const id of rule.providerIds) ids.add(id);
      }
    }
    return Array.from(ids);
  }

  /** Check if a specific provider should fire. */
  shouldInvoke(provider: CompletionProvider, context: ProviderContext): boolean {
    if (!provider.canProvide(context)) return false;
    const ids = this.getActiveProviderIds(context);
    return ids.includes(provider.id);
  }
}
```

- [ ] **Step 1: Write TriggerManager.ts**

Create `src/core/completion/TriggerManager.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/completion/TriggerManager.ts
git commit -m "feat(completion): add trigger manager with configurable rules"
```

---

### Task 5: ContextAnalyzer

**Files:**
- Create: `src/core/completion/ContextAnalyzer.ts`

Extracts context from Monaco editor state before passing to providers.

```typescript
// src/core/completion/ContextAnalyzer.ts
import type { editor, Position } from "monaco-editor";
import type { ProviderContext } from "./types";

export class ContextAnalyzer {
  /**
   * Build a ProviderContext from Monaco editor state.
   * This is called from the CompletionProvider Monaco handler.
   */
  analyze(
    model: editor.ITextModel,
    position: Position,
    triggerChar: string | null,
    manual: boolean,
  ): ProviderContext {
    const text = model.getValue();
    const uri = model.uri.toString();
    const language = model.getLanguageId();

    // Extract the word being typed (before cursor)
    const word = model.getWordUntilPosition(position);
    const prefix = word?.word ?? "";

    return {
      text,
      position,
      prefix,
      triggerChar,
      uri,
      language,
      manual,
    };
  }
}
```

- [ ] **Step 1: Write ContextAnalyzer.ts**

Create `src/core/completion/ContextAnalyzer.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/completion/ContextAnalyzer.ts
git commit -m "feat(completion): add context analyzer for Monaco editor state"
```

---

### Task 6: CompletionStore

**Files:**
- Create: `src/core/completion/CompletionStore.ts`

Stores intermediate state during a completion session (the current result set before rendering).

```typescript
// src/core/completion/CompletionStore.ts
import type { RankedItem } from "./types";

export class CompletionStore {
  private items: RankedItem[] = [];
  private sessionId = "";

  /** Start a new session with a unique ID. */
  beginSession(): string {
    this.sessionId = `session-${Date.now()}`;
    this.items = [];
    return this.sessionId;
  }

  /** Add items from a provider (called between merge and sort). */
  setItems(items: RankedItem[]): void {
    this.items = items;
  }

  getItems(): RankedItem[] {
    return this.items;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  clear(): void {
    this.items = [];
    this.sessionId = "";
  }
}
```

- [ ] **Step 1: Write CompletionStore.ts**

Create `src/core/completion/CompletionStore.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/completion/CompletionStore.ts
git commit -m "feat(completion): add completion store for session state"
```

---

### Task 7: RankingEngine

**Files:**
- Create: `src/core/completion/RankingEngine.ts`
- Modify: (none)

The core ranking logic: fuzzy match, apply context boosts, sort.

```typescript
// src/core/completion/RankingEngine.ts
import type { CompletionItem, RankedItem, ProviderContext } from "./types";
import { fuzzyMatch } from "./FuzzyMatcher";

export class RankingEngine {
  /**
   * Merge items from multiple providers, deduplicate, score, and sort.
   */
  rank(
    items: CompletionItem[],
    context: ProviderContext,
  ): RankedItem[] {
    // 1. Score each item
    const scored: RankedItem[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      // Deduplicate by label + source
      const key = `${item.label}:${item.source}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const fuzzyResult = fuzzyMatch(context.prefix, item.label);
      if (!fuzzyResult) continue; // skip if fuzzy doesn't match

      // Context score: prefer items with higher kind relevance
      let contextScore = 0;
      const kind = item.kind;

      // Local variables and methods ranked higher during method calls
      if (context.triggerChar === "." && kind === 4 /* Field */) contextScore += 10;
      if (context.triggerChar === "." && kind === 1 /* Method */) contextScore += 5;

      // Keywords ranked lower
      if (kind === 13 /* Keyword */) contextScore -= 10;

      // Final score: fuzzy score + context boost + provider score
      const finalScore = fuzzyResult.score + contextScore + (item.score ?? 0);

      scored.push({ item, fuzzyScore: fuzzyResult.score, contextScore, finalScore });
    }

    // 2. Sort by final score descending, then alphabetically
    scored.sort((a, b) => {
      if (a.finalScore !== b.finalScore) return b.finalScore - a.finalScore;
      return a.item.label.localeCompare(b.item.label);
    });

    return scored;
  }
}
```

- [ ] **Step 1: Write RankingEngine.ts**

Create `src/core/completion/RankingEngine.ts`.

- [ ] **Step 2: Verify imports**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/completion/RankingEngine.ts
git commit -m "feat(completion): add ranking engine with fuzzy scoring and dedup"
```

---

### Task 8: ProviderManager

**Files:**
- Create: `src/core/completion/ProviderManager.ts`

Manages the lifecycle of all completion providers.

```typescript
// src/core/completion/ProviderManager.ts
import type { CompletionProvider, CompletionItem, ProviderContext } from "./types";

export class ProviderManager {
  private providers = new Map<string, CompletionProvider>();

  register(provider: CompletionProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  get(id: string): CompletionProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): CompletionProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Invoke a subset of providers in parallel and collect results.
   * @param providerIds - List of provider IDs to invoke.
   * @param context - Current completion context.
   */
  async invokeProviders(
    providerIds: string[],
    context: ProviderContext,
  ): Promise<CompletionItem[]> {
    const promises: Promise<CompletionItem[]>[] = [];

    for (const id of providerIds) {
      const provider = this.providers.get(id);
      if (!provider || !provider.canProvide(context)) continue;

      promises.push(
        provider.provide(context).catch((err) => {
          console.warn(`[Completion] Provider "${id}" failed:`, err);
          return [] as CompletionItem[];
        }),
      );
    }

    const results = await Promise.all(promises);
    return results.flat();
  }
}
```

- [ ] **Step 1: Write ProviderManager.ts**

Create `src/core/completion/ProviderManager.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/completion/ProviderManager.ts
git commit -m "feat(completion): add provider manager for life cycle and parallel invocation"
```

---

### Task 9: CompletionEngine (core orchestrator)

**Files:**
- Create: `src/core/completion/CompletionEngine.ts`

The central orchestrator that wires everything together and registers with Monaco.

```typescript
// src/core/completion/CompletionEngine.ts
import type { editor, languages, Position, CancellationToken } from "monaco-editor";
import { ContextAnalyzer } from "./ContextAnalyzer";
import { ProviderManager } from "./ProviderManager";
import { TriggerManager } from "./TriggerManager";
import { RankingEngine } from "./RankingEngine";
import { CacheManager } from "./CacheManager";
import { CompletionStore } from "./CompletionStore";
import type { CompletionItem, ProviderContext } from "./types";

export class CompletionEngine {
  providerManager = new ProviderManager();
  triggerManager = new TriggerManager();
  rankingEngine = new RankingEngine();
  cacheManager = new CacheManager();
  contextAnalyzer = new ContextAnalyzer();
  store = new CompletionStore();

  /**
   * Monaco CompletionItemProvider handler.
   * This is the single entry point registered with monaco.languages.registerCompletionItemProvider.
   */
  async provideCompletionItems(
    model: editor.ITextModel,
    position: Position,
    context: languages.CompletionContext,
    token: CancellationToken,
  ): Promise<languages.CompletionList | undefined> {
    // 1. Analyze context
    const ctx = this.contextAnalyzer.analyze(
      model, position, context.triggerCharacter ?? null, context.triggerKind === 0 /* Invoke */,
    );

    // 2. Determine which providers to invoke
    const activeIds = this.triggerManager.getActiveProviderIds(ctx);

    // 3. Invoke providers in parallel
    const items = await this.providerManager.invokeProviders(activeIds, ctx);
    if (token.isCancellationRequested) return undefined;

    // 4. Rank, sort, deduplicate
    if (items.length === 0) return undefined;
    const ranked = this.rankingEngine.rank(items, ctx);

    // 5. Store for potential re-use
    this.store.setItems(ranked);

    // 6. Convert to Monaco format
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    return {
      suggestions: ranked.map((r) => ({
        label: r.item.label,
        kind: r.item.kind,
        detail: r.item.detail,
        documentation: r.item.documentation,
        insertText: r.item.insertText ?? r.item.label,
        range,
        sortText: String(r.finalScore).padStart(5, "0"),
      })),
    };
  }
}
```

- [ ] **Step 1: Write CompletionEngine.ts**

Create `src/core/completion/CompletionEngine.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/completion/CompletionEngine.ts
git commit -m "feat(completion): add completion engine orchestrator"
```

---

### Task 10: CompletionProvider — Monaco registration adapter

**Files:**
- Create: `src/core/completion/CompletionProvider.ts`

Wraps the CompletionEngine into Monaco's `CompletionItemProvider` interface. This is the thin adapter that converts Monaco's calling convention to our internal types.

```typescript
// src/core/completion/CompletionProvider.ts
import type { editor, languages, CancellationToken } from "monaco-editor";
import { CompletionEngine } from "./CompletionEngine";

export function createCompletionProvider(engine: CompletionEngine): languages.CompletionItemProvider {
  return {
    triggerCharacters: [".", "<", "/", "\"", "'"],
    provideCompletionItems: async (
      model: editor.ITextModel,
      position: Position,
      context: languages.CompletionContext,
      token: CancellationToken,
    ) => {
      return engine.provideCompletionItems(model, position, context, token);
    },
  };
}
```

- [ ] **Step 1: Write CompletionProvider.ts**

Create `src/core/completion/CompletionProvider.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/completion/CompletionProvider.ts
git commit -m "feat(completion): add Monaco completion provider adapter"
```

---

### Task 11: KeywordProvider

**Files:**
- Create: `providers/KeywordProvider.ts`
- Create: `providers/KeywordProvider.test.ts`

Provides language-specific keywords. Uses a built-in map for common languages.

```typescript
// providers/KeywordProvider.ts
import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";

const KEYWORDS: Record<string, string[]> = {
  typescript: [
    "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
    "return", "throw", "try", "catch", "finally",
    "class", "interface", "type", "enum", "extends", "implements",
    "const", "let", "var", "function", "async", "await",
    "import", "export", "from", "default",
    "new", "this", "super", "typeof", "instanceof",
    "public", "private", "protected", "readonly", "static",
    "true", "false", "null", "undefined", "void",
  ],
  javascript: [
    "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
    "return", "throw", "try", "catch", "finally",
    "class", "extends",
    "const", "let", "var", "function", "async", "await",
    "import", "export", "from", "default",
    "new", "this", "super", "typeof", "instanceof",
    "true", "false", "null", "undefined", "void",
  ],
  python: [
    "if", "elif", "else", "for", "while", "break", "continue",
    "def", "class", "return", "yield", "import", "from", "as",
    "try", "except", "finally", "raise", "with", "pass",
    "True", "False", "None", "not", "and", "or", "is", "in",
    "async", "await", "lambda", "global", "nonlocal",
  ],
  rust: [
    "fn", "let", "mut", "const", "static",
    "if", "else", "match", "loop", "while", "for", "in",
    "return", "break", "continue",
    "struct", "enum", "impl", "trait", "pub", "use", "mod",
    "self", "super", "crate",
    "true", "false",
    "async", "await", "move", "ref",
    "Some", "None", "Ok", "Err",
  ],
  go: [
    "if", "else", "for", "range", "switch", "case", "default", "break", "continue",
    "func", "return", "defer", "go",
    "var", "const", "type", "struct", "interface", "map",
    "import", "package",
    "true", "false", "nil",
    "select", "fallthrough",
  ],
  java: [
    "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
    "return", "throw", "try", "catch", "finally",
    "class", "interface", "enum", "extends", "implements",
    "public", "private", "protected", "static", "final", "abstract",
    "new", "this", "super", "instanceof",
    "import", "package",
    "true", "false", "null", "void",
    "int", "long", "float", "double", "boolean", "char", "String",
  ],
};

export class KeywordProvider implements CompletionProvider {
  id = "keywords";

  canProvide(context: ProviderContext): boolean {
    return context.prefix.length > 0;
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    const keywords = KEYWORDS[context.language];
    if (!keywords) return [];

    return keywords.map((kw) => ({
      label: kw,
      kind: 13, // CompletionItemKind.Keyword
      detail: "keyword",
      insertText: kw,
      source: "keywords",
      score: -0.5, // keywords ranked slightly below semantic completions
    }));
  }
}
```

```typescript
// providers/KeywordProvider.test.ts
import { KeywordProvider } from "./KeywordProvider";
import type { ProviderContext } from "../core/completion/types";

const provider = new KeywordProvider();

const ctx = (lang: string, prefix: string): ProviderContext => ({
  text: "", position: { lineNumber: 1, column: prefix.length + 1 },
  prefix, triggerChar: null, uri: "test.ts", language: lang, manual: false,
});

// Typescript keywords
async function test() {
  let items = await provider.provide(ctx("typescript", "if"));
  if (!items.find(i => i.label === "if")) throw new Error("missing 'if'");
  if (!items.find(i => i.label === "for")) throw new Error("missing 'for'");

  // Python keywords
  items = await provider.provide(ctx("python", "def"));
  if (!items.find(i => i.label === "def")) throw new Error("missing 'def'");

  // Unknown language — empty
  items = await provider.provide(ctx("unknown_lang", "x"));
  if (items.length !== 0) throw new Error("unknown language should return empty");

  console.log("All keyword provider tests passed");
}
test();
```

- [ ] **Step 1: Write KeywordProvider.ts**

Create `providers/KeywordProvider.ts`.

- [ ] **Step 2: Write the test**

Create `providers/KeywordProvider.test.ts`.

- [ ] **Step 3: Run test**

Run: `npx tsx providers/KeywordProvider.test.ts`
Expected: "All keyword provider tests passed"

- [ ] **Step 4: Commit**

```bash
git add providers/KeywordProvider.ts providers/KeywordProvider.test.ts
git commit -m "feat(completion): add keyword provider with multi-language support"
```

---

### Task 12: LspCompletionProvider

**Files:**
- Create: `providers/LspCompletionProvider.ts`

Delegates completions to the LSP client. It wraps the existing LSP completion mechanism into our provider interface. This replaces the direct LSP completion registration in `monacoBridge.ts`.

```typescript
// providers/LspCompletionProvider.ts
import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";
import type { LspClient } from "../lib/lsp/client";

const MONACO_KINDS: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9,
  11: 10, 12: 11, 13: 12, 14: 13, 15: 14, 16: 15, 17: 16, 18: 17,
  19: 18, 20: 19, 21: 20, 22: 21, 23: 22, 24: 23, 25: 24,
};

export class LspCompletionProvider implements CompletionProvider {
  id = "lsp";
  private client: LspClient;

  constructor(client: LspClient) {
    this.client = client;
  }

  canProvide(context: ProviderContext): boolean {
    return true; // LSP can always be queried
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    try {
      // Build a Monaco-compatible position for the LSP client
      const position = {
        lineNumber: context.position.lineNumber,
        column: context.position.column,
      };

      const result = await this.client.requestCompletions(context.uri, position);
      if (!result || !result.items) return [];

      return result.items.map((item: any) => ({
        label: item.label,
        kind: MONACO_KINDS[item.kind] ?? 0,
        detail: item.detail,
        documentation: typeof item.documentation === "string"
          ? item.documentation
          : (item.documentation?.value ?? ""),
        insertText: item.insertText ?? item.label,
        source: "lsp",
        score: 0,
      }));
    } catch (err) {
      console.warn("[LspCompletionProvider] LSP request failed:", err);
      return [];
    }
  }
}
```

- [ ] **Step 1: Write LspCompletionProvider.ts**

Create `providers/LspCompletionProvider.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add providers/LspCompletionProvider.ts
git commit -m "feat(completion): add LSP completion provider"
```

---

### Task 13: WorkspaceCompletionProvider

**Files:**
- Create: `providers/WorkspaceCompletionProvider.ts`

Provides symbols from the workspace index. This requires a lightweight symbol index that scans exports, function declarations, class names, etc. from files in the workspace.

For v1, use a simple approach: scan open files for top-level declarations using regex patterns per language. This gives useful results without a full indexer.

```typescript
// providers/WorkspaceCompletionProvider.ts
import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";

interface WorkspaceSymbol {
  name: string;
  kind: number;
  file: string;
}

const DECL_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /export\s+(?:default\s+)?(?:function|class|interface|type|enum|const|let|var)\s+(\w+)/g,
    /(?:function|class)\s+(\w+)/g,
    /(\w+)\s*[:=]\s*(?:function|\([^)]*\)\s*=>)/g,
  ],
  javascript: [
    /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
    /(?:function|class)\s+(\w+)/g,
  ],
  python: [
    /(?:def|class)\s+(\w+)/g,
    /(\w+)\s*=\s*(?:lambda|\(|\[)/g,
  ],
};

export class WorkspaceCompletionProvider implements CompletionProvider {
  id = "workspace";

  /** In v1, scan open models for symbols. In future, use a persisted index. */
  private getSymbols(context: ProviderContext): WorkspaceSymbol[] {
    const patterns = DECL_PATTERNS[context.language];
    if (!patterns) return [];

    const symbols: WorkspaceSymbol[] = [];
    const lines = context.text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match) {
          symbols.push({
            name: match[1],
            kind: 5, // Variable
            file: context.uri,
          });
        }
      }
    }

    return symbols;
  }

  canProvide(context: ProviderContext): boolean {
    return context.prefix.length >= 1;
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    const symbols = this.getSymbols(context);
    return symbols.map((s) => ({
      label: s.name,
      kind: s.kind,
      detail: `workspace symbol — ${s.file.split("/").pop()}`,
      insertText: s.name,
      source: "workspace",
      score: 2, // slightly boosted — local project symbols are relevant
    }));
  }
}
```

- [ ] **Step 1: Write WorkspaceCompletionProvider.ts**

Create `providers/WorkspaceCompletionProvider.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add providers/WorkspaceCompletionProvider.ts
git commit -m "feat(completion): add workspace completion provider with regex-based symbol scan"
```

---

### Task 14: SnippetProvider

**Files:**
- Create: `providers/SnippetProvider.ts`

Provides commonly used code snippets. Uses a built-in map grouped by language.

```typescript
// providers/SnippetProvider.ts
import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";

interface Snippet {
  prefix: string;
  body: string;
  description: string;
}

const SNIPPETS: Record<string, Snippet[]> = {
  typescript: [
    { prefix: "for", body: "for (let ${1:i} = 0; $1 < ${2:items}.length; $1++) {\n\t${3}\n}", description: "for loop" },
    { prefix: "forof", body: "for (const ${1:item} of ${2:items}) {\n\t${3}\n}", description: "for...of loop" },
    { prefix: "forin", body: "for (const ${1:key} in ${2:obj}) {\n\t${3}\n}", description: "for...in loop" },
    { prefix: "try", body: "try {\n\t${1}\n} catch (${2:err}) {\n\t${3}\n}", description: "try-catch block" },
    { prefix: "fn", body: "function ${1:name}(${2:params}): ${3:void} {\n\t${4}\n}", description: "function declaration" },
    { prefix: "arrow", body: "const ${1:name} = (${2:params}): ${3:void} => {\n\t${4}\n}", description: "arrow function" },
    { prefix: "class", body: "class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t${3}\n\t}\n}", description: "class declaration" },
    { prefix: "export", body: "export { ${1:name} };", description: "export statement" },
    { prefix: "import", body: "import { ${1:name} } from '${2:module}';", description: "import statement" },
    { prefix: "react", body: "import React from 'react';\n\ninterface ${1:Props} {\n\t${2}\n}\n\nexport const ${3:Component}: React.FC<${1:Props}> = ({ ${4} }) => {\n\treturn (\n\t\t<${5:div}>${6}</${5:div}>\n\t);\n};", description: "React component" },
    { prefix: "useState", body: "const [${1:state}, set${1:$1}] = useState<${2:type}>(${3:initial});", description: "React useState hook" },
    { prefix: "useEffect", body: "useEffect(() => {\n\t${1}\n}, [${2}]);", description: "React useEffect hook" },
  ],
  javascript: [
    { prefix: "for", body: "for (let ${1:i} = 0; $1 < ${2:items}.length; $1++) {\n\t${3}\n}", description: "for loop" },
    { prefix: "try", body: "try {\n\t${1}\n} catch (${2:err}) {\n\t${3}\n}", description: "try-catch block" },
    { prefix: "fn", body: "function ${1:name}(${2:params}) {\n\t${3}\n}", description: "function declaration" },
    { prefix: "arrow", body: "const ${1:name} = (${2:params}) => {\n\t${3}\n}", description: "arrow function" },
    { prefix: "import", body: "import { ${1:name} } from '${2:module}';", description: "import statement" },
  ],
  python: [
    { prefix: "def", body: "def ${1:name}(${2:params}):\n\t${3:pass}", description: "function definition" },
    { prefix: "class", body: "class ${1:Name}:\n\tdef __init__(self${2:, params}):\n\t\t${3:pass}", description: "class definition" },
    { prefix: "for", body: "for ${1:item} in ${2:items}:\n\t${3:pass}", description: "for loop" },
    { prefix: "ifmain", body: "if __name__ == '__main__':\n\t${1:main()}", description: "if __name__ guard" },
    { prefix: "try", body: "try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:pass}", description: "try-except block" },
  ],
};

export class SnippetProvider implements CompletionProvider {
  id = "snippets";

  canProvide(context: ProviderContext): boolean {
    return context.prefix.length >= 1;
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    const snippets = SNIPPETS[context.language];
    if (!snippets) return [];

    return snippets.map((s) => ({
      label: s.prefix,
      kind: 14, // CompletionItemKind.Snippet
      detail: s.description,
      documentation: { value: "```\n" + s.body.split("\n").join("\n") + "\n```", isTrusted: true },
      insertText: s.body,
      source: "snippets",
      score: -2, // snippets ranked below semantic suggestions
    }));
  }
}
```

- [ ] **Step 1: Write SnippetProvider.ts**

Create `providers/SnippetProvider.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add providers/SnippetProvider.ts
git commit -m "feat(completion): add snippet provider with multi-language snippets"
```

---

### Task 15: PathProvider

**Files:**
- Create: `providers/PathProvider.ts`

Provides file path completions when typing import paths (inside quotes). Scans the workspace directory relative to the current file.

```typescript
// providers/PathProvider.ts
import type { CompletionProvider, CompletionItem, ProviderContext } from "../core/completion/types";

export class PathProvider implements CompletionProvider {
  id = "path";

  /** Only fire when typing inside quote/slash context (imports). */
  canProvide(context: ProviderContext): boolean {
    return context.triggerChar === "\""
      || context.triggerChar === "'"
      || context.triggerChar === "/"
      || (context.prefix.includes("/") || context.prefix.includes("\\"));
  }

  async provide(context: ProviderContext): Promise<CompletionItem[]> {
    // For v1, parse the current import path from the line.
    // Full directory listing would need access to the filesystem via Tauri.
    // This provides a scaffold that works with relative paths.
    const line = context.text.split("\n")[context.position.lineNumber - 1] ?? "";
    const match = line.match(/from\s+["']([^"']*)$/);
    if (!match) return [];

    const partial = match[1];
    if (!partial.includes(".") && !partial.includes("/")) {
      // No directory context yet — suggest "./" and "../"
      return [
        { label: "./", kind: 18, detail: "relative path", insertText: "./", source: "path", score: 0 },
        { label: "../", kind: 18, detail: "parent path", insertText: "../", source: "path", score: 0 },
      ];
    }

    // Extend this with Tauri fs readDir when available
    return [];
  }
}
```

- [ ] **Step 1: Write PathProvider.ts**

Create `providers/PathProvider.ts`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add providers/PathProvider.ts
git commit -m "feat(completion): add path provider for import path completions"
```

---

### Task 16: Wire everything — update MonacoBridge and bootstrap

**Files:**
- Modify: `src/lib/lsp/monacoBridge.ts` — remove inline LSP completion registration (lines 87-118)
- Modify: `src/lib/lsp/manager.ts` or bootstrap — wire the CompletionEngine into the app lifecycle

The existing `monacoBridge.ts` registers a `registerCompletionItemProvider` directly with Monaco at lines 87-118. Remove that registration and instead register the `CompletionEngine`'s provider. All other LSP registrations (hover, definition, signature, etc.) remain unchanged.

```typescript
// Changes to src/lib/lsp/monacoBridge.ts

// REMOVE this block (lines 87-118):
//
// this.disposables.push(
//   monaco.languages.registerCompletionItemProvider(this.languageId, {
//     triggerCharacters: [".", "(", ","],
//     provideCompletionItems: async (model, position) => { ... },
//   }),
// );

// The completion item provider is now registered by the CompletionEngine
// via CompletionProvider.ts. LSP completions flow through LspCompletionProvider.
```

In the bootstrap or initialization module, create and register the CompletionEngine:

```typescript
// In app bootstrap (e.g., src/main.tsx or src/App.tsx):
import { CompletionEngine } from "./core/completion/CompletionEngine";
import { createCompletionProvider } from "./core/completion/CompletionProvider";
import { LspCompletionProvider } from "./providers/LspCompletionProvider";
import { KeywordProvider } from "./providers/KeywordProvider";
import { WorkspaceCompletionProvider } from "./providers/WorkspaceCompletionProvider";
import { SnippetProvider } from "./providers/SnippetProvider";
import { PathProvider } from "./providers/PathProvider";
import * as monaco from "monaco-editor";

export function initCompletionSystem(lspClient: LspClient) {
  const engine = new CompletionEngine();

  // Register providers
  engine.providerManager.register(new LspCompletionProvider(lspClient));
  engine.providerManager.register(new KeywordProvider());
  engine.providerManager.register(new WorkspaceCompletionProvider());
  engine.providerManager.register(new SnippetProvider());
  engine.providerManager.register(new PathProvider());

  // Register with Monaco
  monaco.languages.registerCompletionItemProvider(
    /* languageId */ undefined, // undefined = register for all languages
    createCompletionProvider(engine),
  );

  return engine;
}
```

The `languageId: undefined` makes Monaco invoke our provider for all languages, letting the CompletionEngine decide per-language behavior through providers.

- [ ] **Step 1: Remove LSP completion registration from monacoBridge.ts**

Use edit to delete lines 86-118 in `src/lib/lsp/monacoBridge.ts`.

- [ ] **Step 2: Wire CompletionEngine into app bootstrap**

Find the app startup file (likely `src/App.tsx` or `src/main.tsx`). Add `initCompletionSystem()` call where the LSP system is initialized.

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run cargo build to verify no Rust-side breakage**

Run: `cargo build --workspace` (from `src-tauri/`)
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lsp/monacoBridge.ts
git commit -m "refactor(lsp): replace inline LSP completion with CompletionEngine"
```

---

### Task 17: Integration test — manual smoke test

**Files:** None (manual verification)

Verify the completion system works end-to-end in the running application.

- [ ] **Step 1: Build and launch the application**

Run: `cargo tauri dev` (or `npm run tauri dev`)
Expected: Application starts without errors.

- [ ] **Step 2: Test TypeScript completions from LSP**

Open a `.ts` or `.tsx` file. Type `console.` after the dot.
Expected: LSP provides method completions (log, error, warn, etc).

- [ ] **Step 3: Test keyword completions**

In a TypeScript file, type `imp`.
Expected: Shows "import" among suggestions, ranked below any LSP semantic completions.

- [ ] **Step 4: Test snippets**

In a TypeScript file, type `for` and see the snippet suggestion.
Expected: Shows "for" with a snippet icon. Selecting it inserts the for-loop template.

- [ ] **Step 5: Test fuzzy matching**

Type `rd` in a TypeScript file with functions like `readFile`.
Expected: `readFile` appears as a suggestion (subsequence match).

- [ ] **Step 6: Test Ctrl+Space manual trigger**

Press Ctrl+Space in an empty line of a TypeScript file.
Expected: Shows completions from all providers (keywords, snippets, workspace symbols).

- [ ] **Step 7: Test trigger isolation**

Type `"` inside an import statement (`from "`).
Expected: PathProvider shows `./` and `../` suggestions.

Typing `<` in a JSX file.
Expected: LSP provides JSX tag completions.

- [ ] **Step 8: Document any issues found**

If any step fails, create a bug issue and fix before marking done.

---

## Self-Review Checklist

- [ ] **Spec coverage:** Every provider type from the architecture diagram is covered: LSP (Task 12), Workspace (Task 13), Keywords (Task 11), Snippets (Task 14), Paths (Task 15). Trigger system (Task 4), Ranking (Task 7), Cache (Task 3), FuzzyMatcher (Task 2). No missing pieces.
- [ ] **No placeholders:** All code in every step is complete. No "TBD", "TODO", or "implement later". The only future-scoped note is the PathProvider fs readDir extension, which is explicitly called out as v1 scaffold.
- [ ] **Type consistency:** `CompletionItem`, `ProviderContext`, `CompletionProvider` types defined in Task 1 are used consistently across all providers and the engine. `RankedItem` is used in RankingEngine and CompletionStore. No type drift.
- [ ] **No AI features:** Confirmed no AI completion provider, no ML ranking, no ghost text generation (the existing ponytail inline completions stub in monacoBridge is left as-is).
- [ ] **Existing LSP integration:** Task 16 explicitly removes the duplicate inline LSP completion registration from monacoBridge.ts to avoid double registration conflicts.

## Execution Handoff

**Plan complete and saved to `plans/2026-06-26-completion-system.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
