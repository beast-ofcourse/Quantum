export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 2;
  if (t.startsWith(q)) return 1.5;
  if (t.includes(q)) return 1;

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive > 1 ? 0.3 : 0.1;
      if (ti === 0) score += 0.2;
    } else {
      consecutive = 0;
    }
  }
  if (qi === q.length) return score;
  return 0;
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  extract: (item: T) => string,
): T[] {
  if (!query) return items;
  const scored = items
    .map((item) => ({
      item,
      score: fuzzyScore(query, extract(item)),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
