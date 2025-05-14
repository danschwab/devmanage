export class FuzzyMatcher {
  // Static maps for faster lookups
  static #keyboardAdjacencyMap = new Map(Object.entries({
    Q: ['W', 'A'],
    W: ['Q', 'E', 'S'],
    E: ['W', 'R', 'D'],
    R: ['E', 'T', 'F'],
    T: ['R', 'Y', 'G'],
    Y: ['T', 'U', 'H'],
    U: ['Y', 'I', 'J'],
    I: ['U', 'O', 'K'],
    O: ['I', 'P', 'L'],
    P: ['O'],
    A: ['Q', 'S', 'Z'],
    S: ['A', 'D', 'W', 'X'],
    D: ['S', 'F', 'E', 'C'],
    F: ['D', 'G', 'R', 'V'],
    G: ['F', 'H', 'T', 'B'],
    H: ['G', 'J', 'Y', 'N'],
    J: ['H', 'K', 'U', 'M'],
    K: ['J', 'L', 'I'],
    L: ['K', 'O'],
    Z: ['A', 'X'],
    X: ['Z', 'S', 'C'],
    C: ['X', 'D', 'V'],
    V: ['C', 'F', 'B'],
    B: ['V', 'G', 'N'],
    N: ['B', 'H', 'M'],
    M: ['N', 'J']
  }));

  static #visualSimilaritySet = new Set([
    'O0', '0O', 'L1', '1L', 'IL', 'LI', 'CE', 'EC', 'GQ', 'QG', 'UV', 'VU', 'MN', 'NM', '_ ', ' _', '- ', ' -'
  ]);

  static GetTopFuzzyMatch(inputText, comparisonRange, abbreviationRange = null, distanceThreshold = 2) {
    if (typeof inputText !== 'string') {
      throw new Error(`Input must be text.`);
    }

    const searchText = inputText.trim().toUpperCase().replace(/[\(\).'"]/g, '');
    if (!searchText) return '';
    
    if (!comparisonRange?.length) return '';

    let bestMatch = '';
    let lowestDistance = distanceThreshold;
    let multipleBestResults = false;
    const inputFirstLetter = searchText[0];

    // Preprocess all values and abbreviations
    const preprocessedValues = [];
    
    for (let i = 0; i < comparisonRange.length; i++) {
      const value = comparisonRange[i];
      if (!value?.trim()) continue;

      // Add main value
      const processed = value.trim().toUpperCase().replace(/[\(\).'"]/g, '');
      preprocessedValues.push({
        original: value,
        processed,
        length: processed.length
      });

      // Add abbreviations if provided
      if (abbreviationRange?.[i]) {
        const abbrs = abbreviationRange[i].split(',')
          .map(a => a.trim())
          .filter(Boolean);

        for (const abbr of abbrs) {
          preprocessedValues.push({
            original: value,
            processed: abbr.toUpperCase().replace(/[\(\).'"]/g, ''),
            length: abbr.length
          });
        }
      }
    }

    // Sort by first letter match
    preprocessedValues.sort((a, b) => {
      const aMatches = a.processed[0] === inputFirstLetter;
      const bMatches = b.processed[0] === inputFirstLetter;
      return (bMatches - aMatches);
    });

    for (const { original, processed, length } of preprocessedValues) {
      if (processed === searchText) return original;
      if (Math.abs(length - searchText.length) > lowestDistance) continue;

      const dist = this.#fastDamerauLevenshteinEarlyAbort(searchText, processed, lowestDistance);
      
      if (dist === 0) return original;

      if (dist < lowestDistance) {
        lowestDistance = dist;
        multipleBestResults = false;
        bestMatch = original;
      } else if (dist === lowestDistance) {
        multipleBestResults = true;
      }
    }

    if (lowestDistance >= distanceThreshold) {
      throw new Error(`No good matches found for "${inputText}"`);
    } else if (multipleBestResults) {
      throw new Error(`Multiple possible matches found for "${inputText}"`);
    }

    return bestMatch;
  }

  // Optimized Damerau-Levenshtein with early abort
  static #fastDamerauLevenshteinEarlyAbort(a, b, maxDist) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > maxDist) return maxDist + 1; // Skip too far lengths

    if (m === 0) return n;
    if (n === 0) return m;

    let dp = Array.from({ length: m + 2 }, () =>
      new Uint16Array(n + 2).fill(0)
    );

    const INF = m + n;
    dp[0][0] = INF;

    for (let i = 0; i <= m; i++) {
      dp[i + 1][1] = i;
      dp[i + 1][0] = INF;
    }

    for (let j = 0; j <= n; j++) {
      dp[1][j + 1] = j;
      dp[0][j + 1] = INF;
    }

    const da = {};
    for (let i = 0; i < m; i++) da[a[i]] = 0;
    for (let j = 0; j < n; j++) da[b[j]] = 0;

    for (let i = 1; i <= m; i++) {
      let db = 0;
      for (let j = 1; j <= n; j++) {
        const i1 = da[b[j - 1]];
        const j1 = db;

        const cost = FuzzyMatcher.#substitutionCost(a[i - 1], b[j - 1]);
        if (cost === 0) db = j;

        dp[i + 1][j + 1] = Math.min(
          dp[i][j] + cost,                         // substitution
          dp[i + 1][j] + 1,                       // insertion
          dp[i][j + 1] + 1,                       // deletion
          dp[i1][j1] + ((i - i1 - 1) + (j - j1 - 1)) * 0.5  // transposition with half cost
        );
      }

      const rowMin = Math.min(...dp[i + 1]);
      if (rowMin > maxDist) return maxDist + 1; // early abort
      da[a[i - 1]] = i;
    }

    return dp[m + 1][n + 1];
  }

  // Optimized substitution cost with keyboard adjacency and visual similarity
  static #substitutionCost(charA, charB) {
    if (charA === charB) return 0;

    const pair = `${charA}${charB}`;
    if (this.#visualSimilaritySet.has(pair)) return 0.7; // Adjusted to match Google Scripts version
    
    const adjacent = this.#keyboardAdjacencyMap.get(charA);
    return adjacent?.includes(charB) ? 0.7 : 1; // Adjusted to match Google Scripts version
  }
}

// Update the export to maintain backwards compatibility
export const GetTopFuzzyMatch = FuzzyMatcher.GetTopFuzzyMatch;
