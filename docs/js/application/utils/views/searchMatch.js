/**
 * One search matcher for every renderer (§4.5).
 *
 * Rules (app-wide, not overridable by views):
 *  1. Words shorter than SEARCH_LIMITS.minTermLength are dropped before matching AND highlighting.
 *     If no words remain the search is inactive.
 *  2. Broad-search abort: when the searched set has more than abortMinRows rows and the search
 *     matches more than abortRatio of them, the search is aborted: no filtering, highlighting,
 *     glow or matched-field lists. matchRows counts first and exits early, so an aborted search
 *     costs one partial pass and no highlighting work.
 *
 * Matching is AND across words; each word must appear (case-insensitive substring) in some
 * shown or details field. Arrays of primitives are matched element-wise; objects never match.
 *
 * Pure: no Vue, no DOM. Safe to import from tests.
 */

export const SEARCH_LIMITS = Object.freeze({ minTermLength: 2, abortRatio: 0.8, abortMinRows: 100 });

/**
 * Split a search term into lowercase words, dropping words shorter than the minimum.
 * @param {string} term
 * @param {number} [minTermLength]
 * @returns {string[]}
 */
export function searchWords(term, minTermLength = SEARCH_LIMITS.minTermLength) {
    if (!term || typeof term !== 'string') return [];
    return term.trim().toLowerCase().split(/\s+/).filter(w => w.length >= minTermLength);
}

/**
 * Does a single value contain the (lowercase) word?
 * @param {*} value
 * @param {string} word lowercase
 * @returns {boolean}
 */
export function valueContains(value, word) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.some(v => v !== null && v !== undefined && typeof v !== 'object' && String(v).toLowerCase().includes(word));
    if (typeof value === 'object') return false;
    return String(value).toLowerCase().includes(word);
}

/**
 * Does a value contain any of the words? (OR — used for per-cell highlight indication)
 * @param {*} value
 * @param {string[]} words
 * @returns {boolean}
 */
export function valueMatchesAny(value, words) {
    if (!words || words.length === 0) return false;
    return words.some(w => valueContains(value, w));
}

/**
 * Match one row against the search words.
 * @param {Object} row
 * @param {{ shown?: string[], details?: string[] }} tiers field keys per tier (hidden fields are never passed)
 * @param {string[]} words lowercase words from searchWords()
 * @returns {{ matched: boolean, shownMatch: boolean, detailMatches: string[] }}
 *   matched       every word appears in some shown or details field
 *   shownMatch    every word appears in some shown field (the match is visible in place)
 *   detailMatches details keys containing at least one word (only when matched)
 */
export function matchRow(row, tiers, words) {
    const empty = { matched: false, shownMatch: false, detailMatches: [] };
    if (!row || !words || words.length === 0) return empty;
    const shown = tiers?.shown || [];
    const details = tiers?.details || [];

    let shownMatch = true;
    let matched = true;
    for (const w of words) {
        const inShown = shown.some(k => valueContains(row[k], w));
        if (!inShown) {
            shownMatch = false;
            if (!details.some(k => valueContains(row[k], w))) { matched = false; break; }
        }
    }
    if (!matched) return empty;
    const detailMatches = details.filter(k => words.some(w => valueContains(row[k], w)));
    return { matched: true, shownMatch, detailMatches };
}

/**
 * Match a set of rows, applying the broad-search abort.
 * @param {Object[]} rows the rows handed to the renderer (after page filters)
 * @param {{ shown?: string[], details?: string[] }} tiers
 * @param {string[]} words
 * @param {{ abortRatio: number, abortMinRows: number }} [limits]
 * @returns {{ active: boolean, aborted: boolean, matchCount: number, results: Array<null|{matched, shownMatch, detailMatches}> }}
 *   active  false when there are no words (search inactive)
 *   aborted true when the search matched too broadly; results is then empty and matchCount Infinity
 *   results aligned with rows; null for non-matching rows
 */
export function matchRows(rows, tiers, words, limits = SEARCH_LIMITS) {
    const list = Array.isArray(rows) ? rows : [];
    if (!words || words.length === 0) return { active: false, aborted: false, matchCount: 0, results: [] };

    const canAbort = list.length > limits.abortMinRows;
    const threshold = limits.abortRatio * list.length;
    const results = new Array(list.length);
    let count = 0;
    for (let i = 0; i < list.length; i++) {
        const r = matchRow(list[i], tiers, words);
        if (r.matched) {
            count++;
            results[i] = r;
            if (canAbort && count > threshold) {
                return { active: true, aborted: true, matchCount: Infinity, results: [] };
            }
        } else {
            results[i] = null;
        }
    }
    return { active: true, aborted: false, matchCount: count, results };
}

/**
 * Convenience: is a precomputed count over the abort threshold for a set of the given size?
 * @param {number} count
 * @param {number} total
 * @param {Object} [limits]
 * @returns {boolean}
 */
export function isBroadSearch(count, total, limits = SEARCH_LIMITS) {
    return total > limits.abortMinRows && count > limits.abortRatio * total;
}
