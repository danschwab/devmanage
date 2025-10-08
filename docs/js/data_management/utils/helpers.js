export function parseDate(val, forceLocal = true, defaultYear = null) {
    if (!val) return null;
    
    // Handle 'YYYY-MM-DD' as local date
    if (forceLocal && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const [year, month, day] = val.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
    
    if (typeof val === 'string') {
        // Handle 'M/D/YYYY' or 'M/D/YY' or 'M/D' (optionally with year)
        let mdy = val.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (mdy) {
            let month = Number(mdy[1]);
            let day = Number(mdy[2]);
            let year = mdy[3] ? Number(mdy[3]) : null;
            if (year && year < 100) year += 2000; // handle 2-digit years
            if (!year && defaultYear) year = Number(defaultYear);
            if (!year) year = new Date().getFullYear();
            return new Date(year, month - 1, day, 12, 0, 0, 0);
        }
        
        // Handle 'DD-MMM' or 'D-MMM' format (e.g., '21-Jan', '3-Dec')
        let dmm = val.match(/^(\d{1,2})-([A-Za-z]{3})$/);
        if (dmm) {
            const day = Number(dmm[1]);
            const monthName = dmm[2].toLowerCase();
            const monthMap = {
                jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };
            const month = monthMap[monthName];
            if (month !== undefined) {
                const year = defaultYear ? Number(defaultYear) : new Date().getFullYear();
                return new Date(year, month, day, 12, 0, 0, 0);
            }
        }
        
        // Handle 'MMM-DD' or 'MMM-D' format (e.g., 'Jan-21', 'Dec-3')
        let mmd = val.match(/^([A-Za-z]{3})-(\d{1,2})$/);
        if (mmd) {
            const monthName = mmd[1].toLowerCase();
            const day = Number(mmd[2]);
            const monthMap = {
                jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };
            const month = monthMap[monthName];
            if (month !== undefined) {
                const year = defaultYear ? Number(defaultYear) : new Date().getFullYear();
                return new Date(year, month, day, 12, 0, 0, 0);
            }
        }
    }
    
    // Fallback to Date constructor
    const d = new Date(val);
    if (!isNaN(d)) {
        // If defaultYear is provided and year is not set, set it
        if (defaultYear && d.getFullYear() === 1970) {
            d.setFullYear(Number(defaultYear));
        }
        return d;
    }
    return null;
}


/**
 * Filters data based on search parameters.
 * @param {Array} data - The array of objects to search within.
 * @param {Object} searchParams - An object where keys are field names and values are search terms.
 *        If the key is "$any", the value will be searched in all fields.
 * @returns {Array} - The filtered array of objects.
 */
export function searchFilter(data, searchParams) {
    if (!Array.isArray(data) || typeof searchParams !== 'object') {
        throw new Error('Invalid arguments: data must be an array and searchParams must be an object.');
    }

    return data.filter(item => {
        // If $any is present, search all keys for the value
        if (searchParams.hasOwnProperty('$any')) {
            const searchValue = String(searchParams['$any']).toLowerCase();
            return Object.values(item).some(val => String(val).toLowerCase().includes(searchValue));
        }
        // Otherwise, search by specific keys
        return Object.keys(searchParams).every(key => {
            if (!item.hasOwnProperty(key)) return false;
            const itemValue = String(item[key]).toLowerCase();
            const searchValue = String(searchParams[key]).toLowerCase();
            return itemValue.includes(searchValue);
        });
    });
}




class FuzzyMatcher {
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

/**
 * Compare two paragraphs/descriptions and return a similarity rating
 * @param {string} text1 - First text to compare
 * @param {string} text2 - Second text to compare
 * @param {Object} options - Configuration options
 * @returns {Object} Match rating result with score and details
 */
export function GetParagraphMatchRating(text1, text2, options = {}) {
    // Log the input texts for debugging
    console.log('[GetParagraphMatchRating] Comparing texts:');
    console.log('  Text 1 (packlist):', JSON.stringify(text1));
    console.log('  Text 2 (inventory):', JSON.stringify(text2));
    console.log('  Text 1 length:', text1?.length || 0);
    console.log('  Text 2 length:', text2?.length || 0);
    
    const {
        wordWeight = 0.4,           // Weight for word-level matching
        phraseWeight = 0.3,         // Weight for phrase-level matching
        structureWeight = 0.2,      // Weight for structural similarity
        semanticWeight = 0.1,       // Weight for semantic similarity
        minWordLength = 3,          // Minimum word length to consider
        caseSensitive = false,      // Whether to consider case
        ignoreCommonWords = true    // Whether to ignore common stop words
    } = options;

    // Handle null/undefined inputs
    if (!text1 || !text2) {
        return {
            score: 0,
            confidence: 'low',
            details: {
                wordMatches: 0,
                phraseMatches: 0,
                structuralSimilarity: 0,
                semanticSimilarity: 0,
                issues: ['One or both texts are empty']
            }
        };
    }

    // Normalize texts
    const normalize = (text) => {
        let normalized = text.trim();
        if (!caseSensitive) normalized = normalized.toLowerCase();
        // Remove extra whitespace and normalize punctuation
        normalized = normalized.replace(/\s+/g, ' ').replace(/[^\w\s-]/g, ' ');
        return normalized;
    };

    const norm1 = normalize(text1);
    const norm2 = normalize(text2);

    // Log normalized texts for debugging
    console.log('[GetParagraphMatchRating] Normalized texts:');
    console.log('  Norm 1 (packlist):', JSON.stringify(norm1));
    console.log('  Norm 2 (inventory):', JSON.stringify(norm2));
    console.log('  Are normalized texts equal?', norm1 === norm2);

    // Early exact match check
    if (norm1 === norm2) {
        return {
            score: 1.0,
            confidence: 'high',
            details: {
                wordMatches: 1.0,
                phraseMatches: 1.0,
                structuralSimilarity: 1.0,
                semanticSimilarity: 1.0,
                issues: []
            }
        };
    }

    // Common stop words to potentially ignore
    const stopWords = ignoreCommonWords ? new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
        'above', 'below', 'between', 'among', 'under', 'over', 'is', 'are', 'was', 'were',
        'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ]) : new Set();

    // Extract words
    const getWords = (text) => {
        return text.split(/\s+/)
            .filter(word => word.length >= minWordLength)
            .filter(word => !stopWords.has(word))
            .filter(word => word.length > 0);
    };

    const words1 = getWords(norm1);
    const words2 = getWords(norm2);

    // 1. Word-level matching
    const wordMatchScore = calculateWordMatches(words1, words2);

    // 2. Phrase-level matching (2-3 word sequences)
    const phraseMatchScore = calculatePhraseMatches(words1, words2);

    // 3. Structural similarity (length, word count, etc.)
    const structuralScore = calculateStructuralSimilarity(norm1, norm2, words1, words2);

    // 4. Semantic similarity (basic keyword density)
    const semanticScore = calculateSemanticSimilarity(words1, words2);

    // Calculate weighted final score
    const finalScore = (
        wordMatchScore * wordWeight +
        phraseMatchScore * phraseWeight +
        structuralScore * structureWeight +
        semanticScore * semanticWeight
    );

    // Determine confidence level
    let confidence = 'low';
    if (finalScore >= 0.8) confidence = 'high';
    else if (finalScore >= 0.6) confidence = 'medium';

    // Identify issues
    const issues = [];
    if (Math.abs(words1.length - words2.length) > Math.max(words1.length, words2.length) * 0.5) {
        issues.push('Significant length difference');
    }
    if (wordMatchScore < 0.3) {
        issues.push('Low word overlap');
    }
    if (structuralScore < 0.3) {
        issues.push('Different structure');
    }

    return {
        score: Math.round(finalScore * 1000) / 1000, // Round to 3 decimal places
        confidence,
        details: {
            wordMatches: Math.round(wordMatchScore * 1000) / 1000,
            phraseMatches: Math.round(phraseMatchScore * 1000) / 1000,
            structuralSimilarity: Math.round(structuralScore * 1000) / 1000,
            semanticSimilarity: Math.round(semanticScore * 1000) / 1000,
            issues
        }
    };
}

function calculateWordMatches(words1, words2) {
    if (words1.length === 0 && words2.length === 0) return 1.0;
    if (words1.length === 0 || words2.length === 0) return 0.0;

    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(word => set2.has(word)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
}

function calculatePhraseMatches(words1, words2) {
    if (words1.length < 2 || words2.length < 2) return 0;

    const getPhrases = (words, length) => {
        const phrases = [];
        for (let i = 0; i <= words.length - length; i++) {
            phrases.push(words.slice(i, i + length).join(' '));
        }
        return phrases;
    };

    // Check 2-word and 3-word phrases
    let totalPhrases = 0;
    let matchingPhrases = 0;

    for (let phraseLength = 2; phraseLength <= 3; phraseLength++) {
        const phrases1 = getPhrases(words1, phraseLength);
        const phrases2 = getPhrases(words2, phraseLength);
        
        if (phrases1.length === 0 || phrases2.length === 0) continue;
        
        const set1 = new Set(phrases1);
        const set2 = new Set(phrases2);
        
        const matches = [...set1].filter(phrase => set2.has(phrase)).length;
        const maxPossible = Math.max(set1.size, set2.size);
        
        totalPhrases += maxPossible;
        matchingPhrases += matches;
    }

    return totalPhrases > 0 ? matchingPhrases / totalPhrases : 0;
}

function calculateStructuralSimilarity(text1, text2, words1, words2) {
    // Length similarity
    const lengthRatio = Math.min(text1.length, text2.length) / Math.max(text1.length, text2.length);
    
    // Word count similarity
    const wordCountRatio = Math.min(words1.length, words2.length) / Math.max(words1.length, words2.length);
    
    // Average word length similarity
    const avgWordLength1 = words1.reduce((sum, word) => sum + word.length, 0) / (words1.length || 1);
    const avgWordLength2 = words2.reduce((sum, word) => sum + word.length, 0) / (words2.length || 1);
    const wordLengthRatio = Math.min(avgWordLength1, avgWordLength2) / Math.max(avgWordLength1, avgWordLength2);
    
    return (lengthRatio + wordCountRatio + wordLengthRatio) / 3;
}

function calculateSemanticSimilarity(words1, words2) {
    // Simple semantic similarity based on word frequency patterns
    if (words1.length === 0 || words2.length === 0) return 0;

    const getWordFreq = (words) => {
        const freq = {};
        words.forEach(word => {
            freq[word] = (freq[word] || 0) + 1;
        });
        return freq;
    };

    const freq1 = getWordFreq(words1);
    const freq2 = getWordFreq(words2);
    
    const allWords = new Set([...words1, ...words2]);
    
    let similarity = 0;
    allWords.forEach(word => {
        const f1 = freq1[word] || 0;
        const f2 = freq2[word] || 0;
        const maxFreq = Math.max(f1, f2);
        const minFreq = Math.min(f1, f2);
        if (maxFreq > 0) {
            similarity += minFreq / maxFreq;
        }
    });
    
    return similarity / allWords.size;
}