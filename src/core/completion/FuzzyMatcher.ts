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
    matches.push(ci >= 0 ? ci : 0);
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
