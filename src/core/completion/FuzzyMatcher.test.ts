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
