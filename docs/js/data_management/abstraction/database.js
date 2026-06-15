// Dynamic Google Sheets Service selection
import { isLocalhost } from '../../google_sheets_services/FakeGoogle.js';
let GoogleSheetsService, GoogleSheetsAuth;

if (isLocalhost()) {
    // Dynamically import fake services
    // Note: This import must match the actual path and export names
    // If using a bundler, you may need to adjust this to static imports
    // eslint-disable-next-line no-undef
    console.warn('Running locally, using fake Google services.');
    ({ GoogleSheetsService, GoogleSheetsAuth } = await import('../../google_sheets_services/FakeGoogle.js'));
} else {
    // Use real services for production
    // eslint-disable-next-line no-undef
    ({ GoogleSheetsService, GoogleSheetsAuth } = await import('../../google_sheets_services/index.js'));
}

import { wrapMethods, invalidateCache, stampDataChange, EditHistoryUtils } from '../index.js';
import { ApplicationUtils } from '../index.js';

class database_uncached {
    /**
     * Retrieves data for a table/tab and returns as array of JS objects
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table (INVENTORY, PACK_LISTS, etc.)
     * @param {string} tabName - Tab name or logical identifier
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<Array<Object>>} - Array of JS objects
     */
    static async getData(deps, tableId, tabName, mapping = null) {
        // Get raw sheet data from GoogleSheetsService
        const rawData = await GoogleSheetsService.getSheetData(tableId, tabName);
        //console.log('[Database] Raw data from GoogleSheetsService:', rawData);
        //console.log('[Database] Mapping provided:', mapping);
        
        // If mapping provided, transform to JS objects
        if (mapping) {
            const transformedData = GoogleSheetsService.transformSheetData(rawData, mapping, tabName);
            //console.log('[Database] Transformed data:', transformedData);
            return transformedData;
        }
        // If no mapping, return raw 2D array
        return rawData;
    }
        
    /**
     * Gets all logical tabs for a table
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @returns {Promise<Array<{title: string, sheetId: number}>>} - List of logical tabs
     */
    static async getTabs(deps, tableId) {
        return await GoogleSheetsService.getSheetTabs(tableId);
    }
    
    /**
     * Executes a SQL-like query against logical table data
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - The table identifier
     * @param {string} query - SQL-like query string
     * @returns {Promise<Array<Object>>} Query results
     */
    static async queryData(deps, tableId, query) {
        return await GoogleSheetsService.querySheetData(tableId, query);
    }
    
    /**
     * Helper method to find a logical tab by name
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Name of the tab to find
     * @returns {Promise<{title: string, sheetId: number}|null>} - The tab object or null if not found
     */
    static async findTabByName(deps, tableId, tabName) {
        const tabs = await deps.call(Database.getTabs, tableId);
        return tabs.find(tab => tab.title === tabName) || null;
    }


    /**
     * Resize a blob URL to a 32×32 data URL using canvas.
     * Returns null on failure (e.g. non-browser environment or load error).
     * @private
     */
    static _generateThumbnailDataUrl(blobUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 64; // Max thumbnail dimension
                const scale = Math.min(MAX / img.width, MAX / img.height, 1);
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(null);
            img.src = blobUrl;
        });
    }

    /**
     * Search for an item image in Google Drive folder
     * @param {string} itemNumber - The item number to search for
     * @param {string} folderId - Google Drive folder ID containing the images
     * @returns {Promise<string|null>} Direct image URL or null if not found
     */
    static async getItemImageUrl(deps, itemNumber, folderId = window.ENDPOINT_IDS.THUMBNAILS) {
        if (!itemNumber || itemNumber === null || itemNumber === undefined) return '';
        const itemNumberStr = String(itemNumber).trim();
        if (!itemNumberStr) return '';

        // 1. Check thumbnail table — serve prefix placeholder immediately if available,
        //    then let the Drive fetch below replace it with the real image.
        //    TODO: re-enable blob serving from the table once we confirm the file-based approach works.
        const record = await deps.call(ApplicationUtils.getThumbnailRecord, itemNumberStr);
        if (record && record.file) {
            // Use the stored Drive file ID to fetch the full authenticated blob directly.
            // This bypasses the thumbnail blob entirely for testing.
            const blobUrl = await GoogleSheetsService.getAuthenticatedImageUrl(record.file);
            if (blobUrl) return blobUrl;
        }

        // 2. Fall back to Drive search
        const extensions = ['jpg', 'jpeg', 'png'];
        for (const ext of extensions) {
            const fileName = `${itemNumberStr}.${ext}`;
            const file = await GoogleSheetsService.searchDriveFileInFolder(fileName, folderId);
            if (file && file.id) {
                const blobUrl = await GoogleSheetsService.getAuthenticatedImageUrl(file.id);
                if (blobUrl) {
                    // Generate thumbnail and store to CACHE sheet (fire-and-forget)
                    database_uncached._generateThumbnailDataUrl(blobUrl).then(thumbnailDataUrl => {
                        if (thumbnailDataUrl) {
                            ApplicationUtils.storeThumbnailRecord(itemNumberStr, file.id, thumbnailDataUrl)
                                .catch(err => console.warn('[icons] Failed to store thumbnail record:', err));
                        }
                    });
                    return blobUrl;
                }
            }
        }

        // 3. Prefix fallback — commented out to prevent automatic prefix icon searching.
        //    Prefix icons that already exist in the table are served via step 1 above.
        // const separators = /[\s\-_]+/;
        // const parts = itemNumberStr.split(separators);
        // if (parts.length > 1 && parts[0]) {
        //     return await deps.call(Database.getItemImageUrl, parts[0], folderId);
        // }

        return '';
    }

    /**
     * Upload an image for an item to the Drive thumbnails folder.
     * Replaces any existing image files for that item number.
     * MUTATION — not cached.
     * @param {File} file - The image file to upload
     * @param {string} itemNumber - The item number used to name the file
     * @param {string} folderId - Google Drive folder ID for thumbnails
     * @returns {Promise<string|null>} The new image URL, or null on failure
     */
    static async uploadItemImage(file, itemNumber, folderId = window.ENDPOINT_IDS.THUMBNAILS) {
        const itemNumberStr = String(itemNumber).trim();
        const ext = file.type === 'image/png' ? 'png' : 'jpg';
        const fileName = `${itemNumberStr}.${ext}`;

        // Find any existing files for this item to delete after upload
        const extensions = ['jpg', 'jpeg', 'png'];
        const existingFileIds = [];
        for (const existingExt of extensions) {
            const existing = await GoogleSheetsService.searchDriveFileInFolder(`${itemNumberStr}.${existingExt}`, folderId);
            if (existing && existing.id) existingFileIds.push(existing.id);
        }

        const uploaded = await GoogleSheetsService.uploadDriveFile(file, fileName, folderId);
        if (!uploaded || !uploaded.id) return null;

        for (const oldId of existingFileIds) {
            await GoogleSheetsService.deleteDriveFile(oldId);
        }
        
        invalidateCache([
            { namespace: 'database', methodName: 'getItemImageBlobUrl', args: [itemNumberStr] },
            { namespace: 'database', methodName: 'getItemImageUrl', args: [itemNumberStr] }
        ], true);

        // Fetch full blob, generate 32×32 thumbnail, store to CACHE sheet
        const blobUrl = await GoogleSheetsService.getAuthenticatedImageUrl(uploaded.id);
        if (blobUrl) {
            const thumbnailDataUrl = await database_uncached._generateThumbnailDataUrl(blobUrl);
            if (thumbnailDataUrl) {
                ApplicationUtils.storeThumbnailRecord(itemNumberStr, uploaded.id, thumbnailDataUrl)
                    .catch(err => console.warn('[icons] Failed to store thumbnail record on upload:', err));
            }
            return blobUrl;
        }
        return null;
    }

    /**
     * Fetch the full-resolution image for an item as a blob URL.
     * Only called when the full-size image modal is opened.
     * @param {Object} deps - Dependency decorator
     * @param {string} itemNumber - Item number to search for
     * @param {string} folderId - Google Drive folder ID
     * @returns {Promise<string>} Blob URL or empty string
     */
    static async getItemImageBlobUrl(deps, itemNumber, folderId = window.ENDPOINT_IDS.THUMBNAILS) {
        if (!itemNumber) return '';
        const itemNumberStr = String(itemNumber).trim();
        if (!itemNumberStr) return '';

        const extensions = ['jpg', 'jpeg', 'png'];
        for (const ext of extensions) {
            const fileName = `${itemNumberStr}.${ext}`;
            const file = await GoogleSheetsService.searchDriveFileInFolder(fileName, folderId);
            if (file && file.id) {
                const blobUrl = await GoogleSheetsService.getAuthenticatedImageUrl(file.id);
                if (blobUrl) return blobUrl;
            }
        }

        const separators = /[\s\-_]+/;
        const parts = itemNumberStr.split(separators);
        // Prefix fallback commented out — only search for exact match for now.
        // if (parts.length > 1 && parts[0]) {
        //     return await deps.call(Database.getItemImageBlobUrl, parts[0], folderId);
        // }

        return '';
    }


    /* MUTATION FUNCTIONS */


    /**
     * Updates data for a table/tab using JS objects
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Tab name or logical identifier
     * @param {Array<Object>} updates - Array of JS objects to save
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @param {Object} [options] - Optional parameters for edithistory tracking
     * @param {string} [options.username] - Username making the change
     * @param {boolean} [options.skipMetadata] - Skip edithistory generation (for EditHistory table itself)
     * @param {string} [options.identifierKey] - Key to identify rows (for deletion tracking)
     * @param {string} [options.source] - Source system for history entries ('web' | 'cad')
     * @returns {Promise<boolean>} - Success status
     */
    static async setData(tableId, tabName, updates, mapping = null, options = {}) {
        const {
            username = null,
            skipMetadata = false,
            identifierKey = null,
            source = 'web'
        } = options;

        let updatesWithMetadata = updates;

        // Add edithistory tracking if not skipped
        if (!skipMetadata && mapping && mapping.edithistory) {
            try {
                // Get original data for comparison (use Database.getData to leverage cache)
                const transformedOriginal = await Database.getData(tableId, tabName, mapping);

                // Add edithistory to updated rows
                updatesWithMetadata = await _addMetadataToRows(
                    transformedOriginal,
                    updates,
                    username,
                    mapping,
                    source
                );

                // Detect and archive deleted rows
                if (identifierKey) {
                    const deletedRows = EditHistoryUtils.detectDeletedRows(
                        transformedOriginal,
                        updates,
                        identifierKey
                    );

                    if (deletedRows.length > 0) {
                        await _archiveDeletedRows(
                            tableId,
                            tabName,
                            deletedRows,
                            username
                        );
                    }
                }
            } catch (error) {
                console.warn('Failed to add edithistory, continuing with save:', error);
                // Continue with save even if edithistory fails
            }
        }

        const result = await GoogleSheetsService.setSheetData(tableId, tabName, updatesWithMetadata, mapping);
        
        // Invalidate related caches using prefix to handle custom mapped data
        stampDataChange(`database:getData:"${tableId}","${tabName}"`);
        invalidateCache([
            { namespace: 'database', methodName: 'getData', args: [tableId, tabName] }
        ], true);
        
        return result;
    }

    
    /**
     * Updates a single row in a table/tab using a unique identifier.
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Tab name or logical identifier
     * @param {Object} update - JS object representing the row to update
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @param {Object} [options] - Optional parameters for edithistory tracking
     * @param {string} [options.username] - Username making the change
      * @param {string} [options.source] - Source system for history entries ('web' | 'cad')
     * @returns {Promise<boolean>} - Success status
     */
    static async updateRow(tableId, tabName, update, mapping = null, options = {}) {
          const { username = null, source = 'web' } = options;

        const existingData = await GoogleSheetsService.getSheetData(tableId, tabName);

        const transformedData = mapping
            ? GoogleSheetsService.transformSheetData(existingData, mapping, tabName)
            : GoogleSheetsService.sheetArrayToObjects(existingData);

        const rowIndex = transformedData.findIndex(row => {
            const identifierKey = mapping ? Object.keys(mapping).find(k => k.includes('Number') || k.includes('Id')) : 'id';
            const updateKey = Object.keys(update).find(k => k.includes('Number') || k.includes('Id')) || Object.keys(update)[0];
            return row[identifierKey] === update[updateKey];
        });
        
        if (rowIndex === -1) {
            throw new Error(`Row with identifier not found in tab ${tabName}`);
        }

        const originalRow = transformedData[rowIndex];

        // Calculate changes and add edithistory if mapping includes it
        let updatedRow = { ...originalRow, ...update };
        if (mapping && mapping.edithistory && username) {
            const changes = EditHistoryUtils.calculateRowDiff(originalRow, update);
            if (changes.length > 0) {
                const metaEntry = EditHistoryUtils.createEditHistoryEntry(username, changes, source);
                const existingMetadata = originalRow.edithistory || originalRow.EditHistory || '';
                const newMetadata = EditHistoryUtils.appendToEditHistory(existingMetadata, metaEntry);
                updatedRow.edithistory = newMetadata;
            }
        }

        // Update the transformed row
        transformedData[rowIndex] = updatedRow;

        // Convert back to sheet format for saving
        const updatedSheetData = mapping
            ? GoogleSheetsService.reverseTransformSheetData(mapping, transformedData)
            : GoogleSheetsService.objectsToSheetArray(transformedData);

        await GoogleSheetsService.setSheetData(tableId, tabName, updatedSheetData);

        // Invalidate related caches using prefix to handle custom mapped data
        stampDataChange(`database:getData:"${tableId}","${tabName}"`);
        invalidateCache([
            { namespace: 'database', methodName: 'getData', args: [tableId, tabName] }
        ], true);

        return true;
    }

    /**
     * Write a single cell value using A1 notation range.
     * This avoids full-table writes for high-concurrency updates.
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Sheet/tab name
     * @param {number} rowNumber - 1-based row number
     * @param {number} columnNumber - 1-based column number
     * @param {string} value - Cell value
     * @returns {Promise<boolean>}
     */
    static async setCellValue(tableId, tabName, rowNumber, columnNumber, value) {
        const colLetter = _numberToColumnLetter(columnNumber);
        const range = `${tabName}!${colLetter}${rowNumber}:${colLetter}${rowNumber}`;

        await GoogleSheetsService.setSheetData(tableId, range, [[value ?? '']], null);

        stampDataChange(`database:getData:"${tableId}","${tabName}"`);
        invalidateCache([
            { namespace: 'database', methodName: 'getData', args: [tableId, tabName] }
        ], true);

        return true;
    }

    /**
     * Append a single row to the end of a tab using a targeted range write.
     * @param {string} tableId - Identifier for the table
     * @param {string} tabName - Sheet/tab name
     * @param {Array<string>} values - Row values in column order
     * @returns {Promise<number>} 1-based row number that was appended
     */
    static async appendSheetRow(tableId, tabName, values) {
        const rawData = await GoogleSheetsService.getSheetData(tableId, tabName);
        const nextRow = (Array.isArray(rawData) ? rawData.length : 0) + 1;
        const endCol = _numberToColumnLetter(Math.max(values.length, 1));
        const range = `${tabName}!A${nextRow}:${endCol}${nextRow}`;

        await GoogleSheetsService.setSheetData(tableId, range, [values], null);

        stampDataChange(`database:getData:"${tableId}","${tabName}"`);
        invalidateCache([
            { namespace: 'database', methodName: 'getData', args: [tableId, tabName] }
        ], true);

        return nextRow;
    }
    
    /**
     * Hides specified logical tabs in a table
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to hide
     */
    static async hideTabs(tableId, tabs) {
        await GoogleSheetsService.hideTabs(tableId, tabs);
    }
    
    /**
     * Shows specified logical tabs in a table
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {Array<{title: string, sheetId: number}>} tabs - Tabs to show
     */
    static async showTabs(tableId, tabs) {
        await GoogleSheetsService.showTabs(tableId, tabs);
    }
    
    /**
     * Creates a new logical tab by copying a template or creating blank
     * @param {Object} deps - Dependency decorator for tracking calls
     * @param {string} tableId - Identifier for the table
     * @param {{title: string, sheetId: number}|null} templateTab - Template tab to copy (null for blank tab)
     * @param {string} newTabName - Name for the new tab
     * @returns {Promise<void>}
     */
    static async createTab(tableId, templateTab, newTabName) {
        if (templateTab && templateTab.sheetId) {
            await GoogleSheetsService.copySheetTab(tableId, templateTab, newTabName);
        } else {
            await GoogleSheetsService.createBlankTab(tableId, newTabName);
        }
        
        // Invalidate related caches, including the possible attempt to get data from this tab before it existed
        stampDataChange(`database:getTabs:"${tableId}"`);
        invalidateCache([
            { namespace: 'database', methodName: 'getTabs', args: [tableId] },
            { namespace: 'database', methodName: 'getData', args: [tableId, newTabName] }
        ]);
    }
}

// Wrap and export the class with caching, excluding mutation methods
// Image URLs get infinite cache since they rarely change and are expensive Google Drive API calls
export const Database = wrapMethods(
    database_uncached, 
    'database', 
    ['createTab', 'hideTabs', 'showTabs', 'setData', 'updateRow', 'setCellValue', 'appendSheetRow', 'uploadItemImage'],
    ['getItemImageUrl', 'getItemImageBlobUrl', 'getTabs'], // Infinite cache: image URLs (expensive Google Drive API calls)
    {
        // Sheet data: infinite for INVENTORY and PACK_LISTS (cross-session poller handles freshness);
        // 20-minute default for everything else (PROD_SCHED, CACHE, etc.)
        'getData': (args) => (args[0] === 'INVENTORY' || args[0] === 'PACK_LISTS') ? null : undefined
    }
);


/**
 * Add edithistory to rows that have changed
 * @private
 */
async function _addMetadataToRows(originalRows, updatedRows, username, mapping, source = 'web') {
    if (!Array.isArray(updatedRows)) {
        return updatedRows;
    }

    return updatedRows.map((updatedRow, index) => {
        const originalRow = originalRows[index];

        // Calculate changes for this row
        const changes = EditHistoryUtils.calculateRowDiff(originalRow, updatedRow);

        // If changes exist, append to edithistory
        if (changes.length > 0 && username) {
            const metaEntry = EditHistoryUtils.createEditHistoryEntry(username, changes, source);
            const existingMetadata = updatedRow.edithistory || '';
            const newMetadata = EditHistoryUtils.appendToEditHistory(existingMetadata, metaEntry);

            // Update the edithistory field using the mapping key (always 'edithistory')
            return { ...updatedRow, edithistory: newMetadata };
        }

        return updatedRow;
    });
}

/**
 * Archive deleted rows to EditHistory table
 * @private
 */
async function _archiveDeletedRows(sourceTable, sourceTab, deletedRows, username) {
    try {
        // Get existing edithistory table data (use Database to leverage cache if available)
        let edithistoryTableData = [];
        try {
            // Try to get with mapping first
            const edithistoryMapping = {
                SourceTable: 'SourceTable',
                SourceTab: 'SourceTab',
                RowIdentifier: 'RowIdentifier',
                Username: 'Username',
                Timestamp: 'Timestamp',
                Operation: 'Operation',
                RowData: 'RowData'
            };
            
            edithistoryTableData = await Database.getData(sourceTable, 'EditHistory', edithistoryMapping);
        } catch (error) {
            // EditHistory tab doesn't exist yet, will be created
            //console.log('EditHistory tab does not exist yet, will create');
            edithistoryTableData = [];
        }

        // Create archive entries for deleted rows
        const archiveEntries = deletedRows.map(deleted => 
            EditHistoryUtils.createArchiveEntry(
                sourceTable,
                sourceTab,
                deleted.identifier,
                deleted.rowData,
                username
            )
        );

        // Append to existing edithistory
        const updatedMetadata = [...edithistoryTableData, ...archiveEntries];

        // Save to EditHistory table (skip edithistory for this table itself)
        const edithistoryMapping = {
            SourceTable: 'SourceTable',
            SourceTab: 'SourceTab',
            RowIdentifier: 'RowIdentifier',
            Username: 'Username',
            Timestamp: 'Timestamp',
            Operation: 'Operation',
            RowData: 'RowData'
        };

        await GoogleSheetsService.setSheetData(
            sourceTable,
            '_EditHistory',
            updatedMetadata,
            edithistoryMapping
        );

        //console.log(`Archived ${deletedRows.length} deleted rows to EditHistory table`);
    } catch (error) {
        console.error('Failed to archive deleted rows:', error);
        // Don't throw - archival failure shouldn't block the main save
    }
}

/**
 * Convert a 1-based column number to A1 notation column letter(s).
 * @private
 */
function _numberToColumnLetter(num) {
    let letter = '';
    let n = Number(num);
    while (n > 0) {
        const remainder = (n - 1) % 26;
        letter = String.fromCharCode(65 + remainder) + letter;
        n = Math.floor((n - 1) / 26);
    }
    return letter;
}