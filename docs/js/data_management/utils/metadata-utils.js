/**
 * EditHistory Management Utilities
 * 
 * Provides core functions for tracking row changes, managing history,
 * and archiving deleted rows to EditHistory table.
 * 
 * EditHistory Column Format (minimized):
 * {
 *   "h": [
 *     {
 *       "u": "dan",
 *       "t": 17309064000,
 *       "s": "web",
 *       "c": [
 *         { "n": "quantity", "o": "5" }
 *       ]
 *     }
 *   ],
 *   "a": { ... },
 *   "s": { ... }
 * }
 * 
 * Key mapping:
 * h = history
 * u = user (username before @)
 * t = timestamp (deciseconds since epoch - divide by 10 for seconds, multiply by 100 for milliseconds)
 * s = source system ('web' | 'cad')
 * c = changes
 * n = column name
 * o = old value
 */

export class EditHistoryUtils {
    /**
     * Create a new edithistory entry for a row change
     * @param {string} username - User email making the change
     * @param {Array<{column: string, old: any, new: any}>} changes - List of changes
     * @param {string} source - Source system for this change ('web' | 'cad')
     * @returns {Object} Metadata entry object
     */
    static createEditHistoryEntry(username, changes, source = 'web') {
        // Extract username before @ symbol
        const shortUser = username ? username.split('@')[0] : 'unknown';
        
        // Convert changes to minimal format (only store old values)
        const minimalChanges = changes.map(change => ({
            n: change.column,  // n = name
            o: change.old      // o = old value (new value not stored)
        }));
        
        return {
            u: shortUser,                           // u = user
            t: Math.floor(new Date().getTime() / 100),  // t = timestamp in deciseconds
            s: source || 'web',                  // s = source system
            c: minimalChanges                       // c = changes
        };
    }

    /**
     * Append a new entry to existing edithistory history
     * @param {string|Object} existingEditHistory - Existing edithistory (JSON string or object)
     * @param {Object} newEntry - New edithistory entry to append
     * @param {number} maxHistory - Maximum history entries to keep (default: 100)
     * @returns {string} Updated edithistory as JSON string
     */
    static appendToEditHistory(existingEditHistory, newEntry, maxHistory = 100) {
        let edithistory;
        
        // Parse existing edithistory
        if (typeof existingEditHistory === 'string') {
            try {
                edithistory = existingEditHistory ? JSON.parse(existingEditHistory) : { h: [] };
            } catch (error) {
                console.warn('Failed to parse existing edithistory, creating new:', error);
                edithistory = { h: [] };
            }
        } else if (typeof existingEditHistory === 'object' && existingEditHistory !== null) {
            edithistory = { ...existingEditHistory };
        } else {
            edithistory = { h: [] };
        }

        // Ensure history array exists (support both old 'history' and new 'h' format)
        if (!Array.isArray(edithistory.h)) {
            edithistory.h = [];
        }

        // Add new entry at the beginning (most recent first)
        edithistory.h.unshift(newEntry);

        // Trim to max history length
        if (edithistory.h.length > maxHistory) {
            edithistory.h = edithistory.h.slice(0, maxHistory);
        }

        return JSON.stringify(edithistory);
    }

    /**
     * Calculate differences between two row objects
     * @param {Object} oldRow - Original row data
     * @param {Object} newRow - Updated row data
     * @param {Array<string>} ignoredColumns - Columns to ignore (e.g., 'edithistory', 'AppData')
     * @returns {Array<{column: string, old: any, new: any}>} Array of changes
     */
    static calculateRowDiff(oldRow, newRow, ignoredColumns = ['edithistory', 'EditHistory', 'AppData']) {
        const changes = [];

        if (!oldRow || !newRow) {
            return changes;
        }

        // Get all unique keys from both objects
        const allKeys = new Set([
            ...Object.keys(oldRow),
            ...Object.keys(newRow)
        ]);

        for (const key of allKeys) {
            // Skip ignored columns
            if (ignoredColumns.includes(key)) {
                continue;
            }

            const oldValue = oldRow[key];
            const newValue = newRow[key];

            // Compare values (handle different types)
            if (!this._valuesEqual(oldValue, newValue)) {
                changes.push({
                    column: key,
                    old: oldValue,
                    new: newValue
                });
            }
        }

        return changes;
    }

    /**
     * Compare two values for equality (handles undefined, null, empty strings)
     * @private
     */
    static _valuesEqual(val1, val2) {
        // Normalize undefined, null, and empty strings
        const normalize = (val) => {
            if (val === undefined || val === null || val === '') {
                return null;
            }
            return val;
        };

        const normalized1 = normalize(val1);
        const normalized2 = normalize(val2);

        // Use JSON stringify for object comparison
        if (typeof normalized1 === 'object' || typeof normalized2 === 'object') {
            return JSON.stringify(normalized1) === JSON.stringify(normalized2);
        }

        return normalized1 === normalized2;
    }

    /**
     * Calculate diffs for multiple rows
     * @param {Array<Object>} originalRows - Original data array
     * @param {Array<Object>} updatedRows - Updated data array
     * @param {Array<string>} ignoredColumns - Columns to ignore
     * @returns {Array<{index: number, changes: Array}>} Array of row indices with their changes
     */
    static calculateBatchDiff(originalRows, updatedRows, ignoredColumns = ['edithistory', 'EditHistory', 'AppData']) {
        const results = [];

        if (!Array.isArray(originalRows) || !Array.isArray(updatedRows)) {
            return results;
        }

        const maxLength = Math.max(originalRows.length, updatedRows.length);

        for (let i = 0; i < maxLength; i++) {
            const oldRow = originalRows[i] || null;
            const newRow = updatedRows[i] || null;

            const changes = this.calculateRowDiff(oldRow, newRow, ignoredColumns);

            if (changes.length > 0) {
                results.push({
                    index: i,
                    changes: changes
                });
            }
        }

        return results;
    }

    /**
     * Detect deleted rows by comparing original and updated data
     * @param {Array<Object>} originalRows - Original data array
     * @param {Array<Object>} updatedRows - Updated data array
     * @param {string} identifierKey - Column name to use as row identifier (e.g., 'itemNumber', 'Piece #')
     * @returns {Array<{identifier: string, rowData: Object}>} Deleted rows with their identifiers
     */
    static detectDeletedRows(originalRows, updatedRows, identifierKey = null) {
        const deletedRows = [];

        if (!Array.isArray(originalRows) || !Array.isArray(updatedRows)) {
            return deletedRows;
        }

        // If no identifier key provided, detect by position
        if (!identifierKey) {
            if (originalRows.length > updatedRows.length) {
                // Rows were removed from the end
                for (let i = updatedRows.length; i < originalRows.length; i++) {
                    deletedRows.push({
                        identifier: `row_${i + 1}`,
                        rowData: originalRows[i]
                    });
                }
            }
            return deletedRows;
        }

        // Build a set of identifiers in updated data
        const updatedIdentifiers = new Set(
            updatedRows
                .map(row => row[identifierKey])
                .filter(id => id !== undefined && id !== null && id !== '')
        );

        // Find rows in original that aren't in updated
        for (const row of originalRows) {
            const identifier = row[identifierKey];
            if (identifier !== undefined && identifier !== null && identifier !== '' && 
                !updatedIdentifiers.has(identifier)) {
                deletedRows.push({
                    identifier: String(identifier),
                    rowData: row
                });
            }
        }

        return deletedRows;
    }

    /**
     * Create a edithistory object for archiving a deleted row
     * @param {string} sourceTable - Table identifier (e.g., 'INVENTORY', 'PACK_LISTS')
     * @param {string} sourceTab - Tab name
     * @param {string} rowIdentifier - Row identifier
     * @param {Object} rowData - Full row data
     * @param {string} username - User who deleted the row
     * @returns {Object} Archive entry object
     */
    static createArchiveEntry(sourceTable, sourceTab, rowIdentifier, rowData, username) {
        return {
            SourceTable: sourceTable,
            SourceTab: sourceTab,
            RowIdentifier: rowIdentifier,
            Username: username || 'unknown',
            Timestamp: Math.floor(new Date().getTime() / 100),
            Operation: 'delete',
            RowData: JSON.stringify(rowData)
        };
    }

    /**
     * Convert decisecond timestamp to Date object
     * @param {number} deciseconds - Timestamp in deciseconds (1/10th second)
     * @returns {Date} Date object
     */
    static decisecondToDate(deciseconds) {
        return new Date(deciseconds * 100);
    }

    /**
     * Format decisecond timestamp as ISO string
     * @param {number} deciseconds - Timestamp in deciseconds (1/10th second)
     * @returns {string} ISO 8601 formatted date string
     */
    static formatTimestamp(deciseconds) {
        return new Date(deciseconds * 100).toISOString();
    }

    /**
     * Format decisecond timestamp as human-readable string
     * @param {number} deciseconds - Timestamp in deciseconds (1/10th second)
     * @returns {string} Human-readable date string
     */
    static formatTimestampHuman(deciseconds) {
        return new Date(deciseconds * 100).toLocaleString();
    }

    /**
     * Parse edithistory from a row (handles both string and object formats)
     * @param {string|Object} edithistory - Metadata to parse
     * @returns {Object|null} Parsed edithistory object or null if invalid
     */
    static parseEditHistory(edithistory) {
        if (!edithistory) {
            return null;
        }

        if (typeof edithistory === 'object') {
            return edithistory;
        }

        if (typeof edithistory === 'string') {
            try {
                return JSON.parse(edithistory);
            } catch (error) {
                console.warn('Failed to parse edithistory:', error);
                return null;
            }
        }

        return null;
    }

    /**
     * Get the most recent change from edithistory
     * @param {string|Object} edithistory - Metadata to parse
     * @returns {Object|null} Most recent change entry or null
     */
    static getMostRecentChange(edithistory) {
        const parsed = this.parseEditHistory(edithistory);
        if (!parsed) return null;
        
        const history = parsed.h;
        if (!Array.isArray(history) || history.length === 0) {
            return null;
        }
        return history[0];
    }

    // -------------------------------------------------------------------------
    // Pending Change Schedule Helpers
    // -------------------------------------------------------------------------

    /**
     * Create a pending change entry for the p array.
     * t = effective date (deciseconds), d = creation timestamp (deciseconds).
     * changes is [{ n, ne }] — ne may be an absolute value or a delta string like "+1".
     * @param {string} username - User email
     * @param {Array<{n: string, ne: string|number}>} changes - Changed fields
     * @param {number} effectiveDateDeciseconds - Effective date in deciseconds
     * @param {string} note - Description/note (max 25 chars)
     * @returns {Object} Pending entry object
     */
    static createPendingEntry(username, changes, effectiveDateDeciseconds, note) {
        const shortUser = username ? username.split('@')[0] : 'unknown';
        return {
            u: shortUser,
            t: effectiveDateDeciseconds,
            d: Math.floor(Date.now() / 100),
            s: (note || '').slice(0, 25),
            c: changes.map(ch => ({ n: ch.n, ne: ch.ne }))
        };
    }

    /**
     * Append a pending entry to EditHistory.p.
     * No cap on p array length — entries are removed when applied.
     * @param {string|Object} edithistory - Existing EditHistory value
     * @param {Object} entry - Pending entry to append
     * @returns {string} Updated EditHistory as JSON string
     */
    static appendToPendingChanges(edithistory, entry) {
        let parsed = this.parseEditHistory(edithistory) || {};
        if (!Array.isArray(parsed.h)) parsed.h = [];
        if (!Array.isArray(parsed.p)) parsed.p = [];
        parsed.p.push(entry);
        return JSON.stringify(parsed);
    }

    /**
     * Get all pending entries from EditHistory.p.
     * @param {string|Object} edithistory - EditHistory value
     * @returns {Array} Pending entries array (may be empty)
     */
    static getPendingEntries(edithistory) {
        const parsed = this.parseEditHistory(edithistory);
        return Array.isArray(parsed?.p) ? parsed.p : [];
    }

    /**
     * Apply a delta or absolute ne value to a current field value.
     * ne strings prefixed with '+' or '-' are treated as numeric deltas.
     * @param {*} currentValue - Current field value on the row
     * @param {string|number} ne - New-value descriptor from pending entry
     * @returns {*} Resulting field value
     */
    static applyNeValue(currentValue, ne) {
        if (typeof ne === 'string' && /^[+\-]\d/.test(ne)) {
            const current = parseFloat(currentValue) || 0;
            return current + parseFloat(ne);
        }
        return ne;
    }

    /**
     * Pure helper — applies all pending changes due on or before referenceDateDeciseconds
     * to a copy of the items array. Does not perform any I/O.
     * Pending entries are sorted ascending by t before application.
     * Applied entries move from p to h (ne dropped, o computed from pre-apply value).
     * @param {Array<Object>} items - Inventory row objects (will be shallow-cloned)
     * @param {number} referenceDateDeciseconds - Cutoff in deciseconds (date only, ignores time)
     * @returns {{ updatedItems: Array<Object>, hasChanges: boolean }}
     */
    static applyPendingChangesToData(items, referenceDateDeciseconds) {
        // Normalise to start-of-day deciseconds for date-only comparison
        const refDate = new Date(referenceDateDeciseconds * 100);
        refDate.setHours(0, 0, 0, 0);
        const refCutoff = Math.floor(refDate.getTime() / 100);

        let hasChanges = false;
        const updatedItems = items.map(item => {
            const parsed = this.parseEditHistory(item.edithistory || item.EditHistory);
            if (!parsed) return item;

            const pending = Array.isArray(parsed.p) ? parsed.p : [];
            const due = pending.filter(entry => {
                const entryDate = new Date(entry.t * 100);
                entryDate.setHours(0, 0, 0, 0);
                return Math.floor(entryDate.getTime() / 100) <= refCutoff;
            });

            if (due.length === 0) return item;

            // Work on a shallow copy of the row
            const updatedItem = { ...item };
            due.sort((a, b) => a.t - b.t);

            const newHistoryEntries = [];
            for (const entry of due) {
                const historyChanges = [];
                for (const ch of entry.c) {
                    const oldValue = updatedItem[ch.n];
                    const newValue = this.applyNeValue(oldValue, ch.ne);
                    updatedItem[ch.n] = newValue;
                    historyChanges.push({ n: ch.n, o: oldValue });
                }
                // Build h entry — t becomes the change date in history
                newHistoryEntries.unshift({
                    u: entry.u,
                    t: entry.t,
                    d: entry.d,
                    s: entry.s,
                    c: historyChanges
                });
            }

            // Remove applied entries from p, prepend to h (max 10)
            const appliedIds = new Set(due.map(e => e));
            const remainingPending = pending.filter(e => !appliedIds.has(e));
            const existingHistory = Array.isArray(parsed.h) ? parsed.h : [];
            const newHistory = [...newHistoryEntries, ...existingHistory].slice(0, 10);

            const updatedEditHistory = JSON.stringify({ ...parsed, h: newHistory, p: remainingPending });
            const ehKey = Object.prototype.hasOwnProperty.call(item, 'edithistory') ? 'edithistory' : 'EditHistory';
            updatedItem[ehKey] = updatedEditHistory;

            hasChanges = true;
            return updatedItem;
        });

        return { updatedItems, hasChanges };
    }
}
