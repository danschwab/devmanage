export class FuzzyMatcher {
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

  static #visualSimilarityPairs = [
    ['O', '0'], ['L', '1'], ['I', 'L'], ['C', 'E'], ['G', 'Q'], ['U', 'V'], ['M', 'N'], [' ', '_'], [' ', '-']
  ];

  static GetTopFuzzyMatch(inputText, comparisonRange, abbreviationRange = null, distanceThreshold = 2) {
    if (typeof inputText !== 'string') {
      throw new Error(`Input must be text.`);
    }

    inputText = inputText.trim().toUpperCase().replace(/[\(\).'"]/g, '');
    const inputLen = inputText.length;

    let bestMatch = '';
    let lowestDistance = distanceThreshold;
    let multipleBestResults = false;

    const comparisonValues = comparisonRange.flat();
    const abbreviations = abbreviationRange ? abbreviationRange.flat() : [];

    const preprocessedValues = [];

    for (let i = 0; i < comparisonValues.length; i++) {
      const value = comparisonValues[i];
      if (!value) continue;

      // Add the main comparison value itself as a candidate
      const processedValue = value.trim().toUpperCase().replace(/[\(\).'"]/g, '');
      preprocessedValues.push({
        original: value,
        processed: processedValue,
        length: processedValue.length
      });

      // If abbreviationRange is provided, add those too
      if (abbreviations[i]) {
        const splitAbbrs = abbreviations[i]
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0);

        for (let abbr of splitAbbrs) {
          preprocessedValues.push({
            original: value, // Always return the value from comparisonRange
            processed: abbr.toUpperCase().replace(/[\(\).'"]/g, ''),
            length: abbr.length
          });
        }
      }
    }

    const inputFirstLetter = inputText[0]?.toUpperCase() || '';

    // Put entries that start with the same first letter at the top
    preprocessedValues.sort((a, b) => {
      const aMatches = a.processed?.[0] === inputFirstLetter;
      const bMatches = b.processed?.[0] === inputFirstLetter;

      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0; // maintain original order among equal-priority entries
    });

    for (let { original, processed, length } of preprocessedValues) {
      if (Math.abs(inputLen - length) > lowestDistance) continue;

      const dist = FuzzyMatcher.#fastDamerauLevenshteinEarlyAbort(inputText, processed, lowestDistance);

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

  static #fastDamerauLevenshteinEarlyAbort(a, b, maxDist) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > maxDist) return maxDist + 1;

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
          dp[i + 1][j] + 1,                        // insertion
          dp[i][j + 1] + 1,                        // deletion
          dp[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1) // transposition
        );
      }

      const rowMin = Math.min(...dp[i + 1]);
      if (rowMin > maxDist) return maxDist + 1;
      da[a[i - 1]] = i;
    }

    return dp[m + 1][n + 1];
  }

  static #substitutionCost(charA, charB) {
    if (charA === charB) return 0;

    charA = charA.toUpperCase();
    charB = charB.toUpperCase();

    // Visual similarity check
    for (const pair of FuzzyMatcher.#visualSimilarityPairs) {
      if ((pair[0] === charA && pair[1] === charB) || (pair[1] === charA && pair[0] === charB)) {
        return 0.7;
      }
    }

    // Keyboard adjacency check
    const adj = FuzzyMatcher.#keyboardAdjacencyMap.get(charA);
    if (adj && adj.includes(charB)) {
      return 0.7;
    }

    return 1;
  }
}

export const GetTopFuzzyMatch = FuzzyMatcher.GetTopFuzzyMatch;
