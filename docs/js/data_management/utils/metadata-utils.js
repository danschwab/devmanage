/**
 * MetaData Management Utilities
 * 
 * Provides core functions for tracking row changes, managing history,
 * and archiving deleted rows to MetaData table.
 * 
 * MetaData Column Format:
 * {
 *   "history": [
 *     {
 *       "user": "user@example.com",
 *       "timestamp": "2025-11-06T15:30:00Z",
 *       "changes": [
 *         { "column": "quantity", "old": "5", "new": "10" }
 *       ]
 *     }
 *   ],
 *   "cachedAnalytics": { ... },
 *   "userSettings": { ... }
 * }
 */

export class MetaDataUtils {
    /**
     * Create a new metadata entry for a row change
     * @param {string} username - User email making the change
     * @param {Array<{column: string, old: any, new: any}>} changes - List of changes
     * @returns {Object} Metadata entry object
     */
    static createMetaDataEntry(username, changes) {
        return {
            user: username || 'unknown',
            timestamp: new Date().toISOString(),
            changes: changes || []
        };
    }

    /**
     * Append a new entry to existing metadata history
     * @param {string|Object} existingMetaData - Existing metadata (JSON string or object)
     * @param {Object} newEntry - New metadata entry to append
     * @param {number} maxHistory - Maximum history entries to keep (default: 10)
     * @returns {string} Updated metadata as JSON string
     */
    static appendToMetaData(existingMetaData, newEntry, maxHistory = 10) {
        let metadata;
        
        // Parse existing metadata
        if (typeof existingMetaData === 'string') {
            try {
                metadata = existingMetaData ? JSON.parse(existingMetaData) : { history: [] };
            } catch (error) {
                console.warn('Failed to parse existing metadata, creating new:', error);
                metadata = { history: [] };
            }
        } else if (typeof existingMetaData === 'object' && existingMetaData !== null) {
            metadata = { ...existingMetaData };
        } else {
            metadata = { history: [] };
        }

        // Ensure history array exists
        if (!Array.isArray(metadata.history)) {
            metadata.history = [];
        }

        // Add new entry at the beginning (most recent first)
        metadata.history.unshift(newEntry);

        // Trim to max history length
        if (metadata.history.length > maxHistory) {
            metadata.history = metadata.history.slice(0, maxHistory);
        }

        return JSON.stringify(metadata);
    }

    /**
     * Calculate differences between two row objects
     * @param {Object} oldRow - Original row data
     * @param {Object} newRow - Updated row data
     * @param {Array<string>} ignoredColumns - Columns to ignore (e.g., 'metadata', 'AppData')
     * @returns {Array<{column: string, old: any, new: any}>} Array of changes
     */
    static calculateRowDiff(oldRow, newRow, ignoredColumns = ['metadata', 'MetaData', 'AppData']) {
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
    static calculateBatchDiff(originalRows, updatedRows, ignoredColumns = ['metadata', 'MetaData', 'AppData']) {
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
     * Create a metadata object for archiving a deleted row
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
            Timestamp: new Date().toISOString(),
            Operation: 'delete',
            RowData: JSON.stringify(rowData)
        };
    }

    /**
     * Parse metadata from a row (handles both string and object formats)
     * @param {string|Object} metadata - Metadata to parse
     * @returns {Object|null} Parsed metadata object or null if invalid
     */
    static parseMetaData(metadata) {
        if (!metadata) {
            return null;
        }

        if (typeof metadata === 'object') {
            return metadata;
        }

        if (typeof metadata === 'string') {
            try {
                return JSON.parse(metadata);
            } catch (error) {
                console.warn('Failed to parse metadata:', error);
                return null;
            }
        }

        return null;
    }

    /**
     * Get the most recent change from metadata
     * @param {string|Object} metadata - Metadata to parse
     * @returns {Object|null} Most recent change entry or null
     */
    static getMostRecentChange(metadata) {
        const parsed = this.parseMetaData(metadata);
        if (!parsed || !Array.isArray(parsed.history) || parsed.history.length === 0) {
            return null;
        }
        return parsed.history[0];
    }

    /**
     * Add or update cached analytics in metadata
     * @param {string|Object} existingMetaData - Existing metadata
     * @param {string} analyticKey - Key for the cached analytic
     * @param {any} analyticValue - Value to cache
     * @returns {string} Updated metadata as JSON string
     */
    static setCachedAnalytic(existingMetaData, analyticKey, analyticValue) {
        let metadata = this.parseMetaData(existingMetaData) || { history: [] };

        if (!metadata.cachedAnalytics) {
            metadata.cachedAnalytics = {};
        }

        metadata.cachedAnalytics[analyticKey] = analyticValue;

        return JSON.stringify(metadata);
    }

    /**
     * Get cached analytic from metadata
     * @param {string|Object} metadata - Metadata to parse
     * @param {string} analyticKey - Key for the cached analytic
     * @returns {any|null} Cached value or null if not found
     */
    static getCachedAnalytic(metadata, analyticKey) {
        const parsed = this.parseMetaData(metadata);
        if (!parsed || !parsed.cachedAnalytics) {
            return null;
        }
        return parsed.cachedAnalytics[analyticKey] || null;
    }

    /**
     * Add or update user setting in metadata
     * @param {string|Object} existingMetaData - Existing metadata
     * @param {string} settingKey - Key for the user setting
     * @param {any} settingValue - Value to set
     * @returns {string} Updated metadata as JSON string
     */
    static setUserSetting(existingMetaData, settingKey, settingValue) {
        let metadata = this.parseMetaData(existingMetaData) || { history: [] };

        if (!metadata.userSettings) {
            metadata.userSettings = {};
        }

        metadata.userSettings[settingKey] = settingValue;

        return JSON.stringify(metadata);
    }

    /**
     * Get user setting from metadata
     * @param {string|Object} metadata - Metadata to parse
     * @param {string} settingKey - Key for the user setting
     * @returns {any|null} Setting value or null if not found
     */
    static getUserSetting(metadata, settingKey) {
        const parsed = this.parseMetaData(metadata);
        if (!parsed || !parsed.userSettings) {
            return null;
        }
        return parsed.userSettings[settingKey] || null;
    }
}
