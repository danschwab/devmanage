import { GoogleSheetsAuth } from './GoogleSheetsAuth.js';
import { SheetSql } from './sheetSql.js';

export class GoogleSheetsService {

    // Exponential backoff helper for Google Sheets API calls
    static async withExponentialBackoff(fn, maxRetries = 7, initialDelay = 500) {
        let attempt = 0;
        let delay = initialDelay;
        let lastError = null;
        while (true) {
            try {
                return await fn();
            } catch (err) {
                // If 401 Unauthorized, try to re-authenticate once and retry
                if (
                    (err && (err.status === 401 || (err.result && err.result.error && err.result.error.code === 401)))
                    && attempt === 0
                ) {
                    try {
                        await GoogleSheetsAuth.authenticate(false);
                        attempt++;
                        continue;
                    } catch (reauthErr) {
                        throw reauthErr;
                    }
                }
                // Check for rate limit or quota errors
                const isRateLimit = err && (
                    (err.status && (err.status === 429 || err.status === 403)) ||
                    (err.result && err.result.error && (
                        err.result.error.status === 'RESOURCE_EXHAUSTED' ||
                        err.result.error.status === 'PERMISSION_DENIED' ||
                        err.result.error.message?.toLowerCase().includes('rate limit') ||
                        err.result.error.message?.toLowerCase().includes('quota')
                    ))
                );
                if (!isRateLimit || attempt >= maxRetries) throw err;
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
                attempt++;
                lastError = err;
            }
        }
    }

    /**
     * Get sheet data and return as raw 2D array (matches FakeGoogle interface)
     * @param {string} tableId
     * @param {string} range - Range including sheet name (e.g., "FURNITURE!" or "INDEX!A1:Z100")
     * @returns {Promise<Array<Array<string>>>}
     */
    static async getSheetData(tableId, range) {
        await GoogleSheetsAuth.checkAuth();
        const spreadsheetId = window.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`[getSheetData] Spreadsheet ID not found for table: ${tableId}`);

        // Remove try/catch to allow errors to bubble up to reactive store
        const response = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            })
        );
        
        const rawData = response.result && Array.isArray(response.result.values) ? response.result.values : [];
        if (!rawData || rawData.length === 0) return [[]];
        
        // Return raw 2D array data to match FakeGoogle interface
        return rawData;
    }

    /**
     * Set sheet data from array of JS objects
     * @param {string} tableId
     * @param {string} tabName
     * @param {Array<Object>} updates - Array of JS objects to save
     * @param {Object} [mapping] - Optional mapping for object keys to sheet headers
     * @returns {Promise<boolean>}
     */
    static async setSheetData(tableId, tabName, updates, mapping = null) {
        await GoogleSheetsAuth.checkAuth();
        const spreadsheetId = window.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`[setSheetData] Spreadsheet ID not found for table: ${tableId}`);
        // Convert JS objects to sheet format
        let values;
        if (Array.isArray(updates) && updates.length > 0 && Array.isArray(updates[0])) {
            values = updates;
        } else if (Array.isArray(updates) && updates.length > 0) {
            // If mapping is provided, use reverse transform to get proper sheet format
            if (mapping) {
                values = this.reverseTransformSheetData(mapping, updates);
            } else {
                const headers = Object.keys(updates[0]);
                values = [headers, ...updates.map(obj => headers.map(h => obj[h] ?? ''))];
            }
        } else {
            throw new Error('No valid updates provided');
        }
        // Setup range
        const range = `${tabName}`;
        // Write new data
        await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'USER_ENTERED',
                resource: { values }
            })
        );
        // Truncate any rows below the new data
        // Get current sheet row count
        const sheetInfo = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.get({
                spreadsheetId,
                ranges: [tabName],
                includeGridData: false
            })
        );
        const sheet = sheetInfo.result.sheets.find(s => s.properties.title === tabName);
        if (sheet) {
            const sheetRowCount = sheet.properties.gridProperties.rowCount;
            const newRowCount = values.length;
            if (sheetRowCount > newRowCount) {
                await GoogleSheetsService.withExponentialBackoff(() =>
                    gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId,
                        resource: {
                            requests: [{
                                deleteDimension: {
                                    range: {
                                        sheetId: sheet.properties.sheetId,
                                        dimension: 'ROWS',
                                        startIndex: newRowCount,
                                        endIndex: sheetRowCount
                                    }
                                }
                            }]
                        }
                    })
                );
            }
        }
        return true;
    }
    /**
     * Transform raw sheet data to JS objects using mapping
     */
    static transformSheetData(rawData, mapping) {
        if (!rawData || rawData.length < 2 || !mapping) return [];
        const headers = Array.isArray(rawData[0]) ? rawData[0] : [];
        if (headers.length === 0) {
            console.error('GoogleSheetsService.transformSheetData: headers is not an array or empty', headers, rawData);
            return [];
        }
        const rows = rawData.slice(1);
        const headerIdxMap = {};
        Object.entries(mapping).forEach(([key, headerName]) => {
            const idx = headers.findIndex(h => typeof h === 'string' && h.trim() === headerName);
            if (idx === -1) {
                console.warn(`GoogleSheetsService.transformSheetData: header '${headerName}' not found in sheet headers`, headers);
            }
            if (idx !== -1) headerIdxMap[key] = idx;
        });
        return rows.map(row => {
            const obj = {};
            Object.keys(mapping).forEach(key => {
                obj[key] = (Array.isArray(row) && headerIdxMap[key] !== undefined && row[headerIdxMap[key]] !== undefined)
                    ? String(row[headerIdxMap[key]])
                    : '';
            });
            return obj;
        }).filter(obj => Object.values(obj).some(val => val !== ''));
    }

    /**
     * Reverse transform JS objects to sheet data using mapping
     */
    static reverseTransformSheetData(mapping, mappedData) {
        if (!mappedData || mappedData.length === 0) return [];
        const headers = Object.values(mapping);
        const rows = mappedData.map(obj => headers.map(h => {
            const key = Object.keys(mapping).find(k => mapping[k] === h);
            return key ? obj[key] ?? '' : '';
        }));
        return [headers, ...rows];
    }
    
    /**
     * Helper method to ensure a sheet has enough rows
     * @private
     */
    static async _ensureSheetSize(spreadsheetId, tabName, requiredRows) {
        if (typeof gapi === 'undefined' || !gapi.client?.sheets?.spreadsheets?.get) return;
        
        const sheetInfo = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.get({
                spreadsheetId,
                ranges: [tabName],
                includeGridData: false
            })
        );
        
        const sheet = sheetInfo.result.sheets.find(s => s.properties.title === tabName);
        if (!sheet) return;
        
        const sheetRowCount = sheet.properties.gridProperties.rowCount;
        if (requiredRows > sheetRowCount) {
            await GoogleSheetsService.withExponentialBackoff(() =>
                gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: {
                        requests: [{
                            appendDimension: {
                                sheetId: sheet.properties.sheetId,
                                dimension: 'ROWS',
                                length: requiredRows - sheetRowCount
                            }
                        }]
                    }
                })
            );
        }
    }


    /**     
     * Retrieves the list of sheet tabs in a spreadsheet.
     * @param {string} tableId - The identifier for the table (e.g., 'INVENTORY').
     * @returns {Promise<Array<{title: string, sheetId: number}>>} - A promise that resolves to an array of objects with tab names and ids.
     */
    static async getSheetTabs(tableId) {
        await GoogleSheetsAuth.checkAuth();

        const spreadsheetId = window.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`[getSheetTabs] Spreadsheet ID not found for table: ${tableId}`);
        
        const response = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.get({
                spreadsheetId
            })
        );

        // Return array of { title, sheetId }
        const tabs = response.result.sheets.map(sheet => ({
            title: sheet.properties.title,
            sheetId: sheet.properties.sheetId
        }));
        return tabs;
    }

    /**
     * Hides the specified tabs in the spreadsheet.
     * @param {string} tableId
     * @param {Array<{title: string, sheetId: number}>} tabs
     * @returns {Promise<void>}
     */
    static async hideTabs(tableId, tabs) {
        await GoogleSheetsAuth.checkAuth();

        const spreadsheetId = window.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`[hideTabs] Spreadsheet ID not found for table: ${tableId}`);

        // Use provided sheetId and title pairs
        const requests = tabs.map(tab => ({
            updateSheetProperties: {
                properties: { sheetId: tab.sheetId, hidden: true },
                fields: 'hidden'
            }
        }));

        if (requests.length > 0) {
            await GoogleSheetsService.withExponentialBackoff(() =>
                gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests }
                })
            );
        }
    }

    /**
     * Shows the specified tabs in the spreadsheet.
     * @param {string} tableId
     * @param {Array<{title: string, sheetId: number}>} tabs
     * @returns {Promise<void>}
     */
    static async showTabs(tableId, tabs) {
        await GoogleSheetsAuth.checkAuth();

        const spreadsheetId = window.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`[showTabs] Spreadsheet ID not found for table: ${tableId}`);

        // Use provided sheetId and title pairs
        const requests = tabs.map(tab => ({
            updateSheetProperties: {
                properties: { sheetId: tab.sheetId, hidden: false },
                fields: 'hidden'
            }
        }));

        if (requests.length > 0) {
            await GoogleSheetsService.withExponentialBackoff(() =>
                gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests }
                })
            );
        }
    }

    /**
     * Copy a sheet tab within a spreadsheet (e.g., to create a new tab from TEMPLATE).
     * @param {string} tableId
     * @param {{title: string, sheetId: number}} sourceTab
     * @param {string} newTabName
     * @returns {Promise<void>}
     */
    static async copySheetTab(tableId, sourceTab, newTabName) {
        await GoogleSheetsAuth.checkAuth();

        const spreadsheetId = window.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`[copySheetTab] Spreadsheet ID not found for table: ${tableId}`);

        // Use provided sheetId directly
        const sourceSheetId = sourceTab.sheetId;

        // Copy the sheet
        const copyResponse = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.sheets.copyTo({
                spreadsheetId,
                sheetId: sourceSheetId,
                resource: { destinationSpreadsheetId: spreadsheetId }
            })
        );
        // Rename the new sheet to newTabName
        const newSheetId = copyResponse.result.sheetId;
        await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId: newSheetId,
                                    title: newTabName
                                },
                                fields: 'title'
                            }
                        }
                    ]
                }
            })
        );
    }

    /**
     * Executes a SQL-like query against sheet data
     * @param {string} tableId - The identifier for the table (e.g., 'INVENTORY')
     * @param {string} query - SQL-like query string
     * @returns {Promise<Array<Object>>} - Query results as an array of objects
     */
    static async querySheetData(tableId, query) {
        await GoogleSheetsAuth.checkAuth();
        
        try {
            // Parse the query
            const parsedQuery = SheetSql.parseQuery(query);
            
            if (!parsedQuery.from) {
                throw new Error('Invalid query: FROM clause is required');
            }
            
            // Get the data from the sheet
            const data = await this.getSheetData(tableId, parsedQuery.from);
            
            // Execute the query against the data
            const results = SheetSql.executeQuery(parsedQuery, data);
            
            return results;
        } catch (error) {
            console.error('Error executing sheet query:', error);
            throw new Error(`Failed to execute query: ${error.message}`);
        }
    }

    /**
     * Creates a new blank sheet tab in the spreadsheet.
     * @param {string} tableId - The identifier for the table (e.g., 'INVENTORY').
     * @param {string} newTabName - The name for the new tab.
     * @returns {Promise<void>}
     */
    static async createBlankTab(tableId, newTabName) {
        await GoogleSheetsAuth.checkAuth();

        const spreadsheetId = window.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`[createBlankTab] Spreadsheet ID not found for table: ${tableId}`);

        // Add the new sheet/tab
        await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: newTabName
                                }
                            }
                        }
                    ]
                }
            })
        );
    }

    /**
     * Converts a 2D array from Google Sheets to array of objects (first row = headers)
     */
    static sheetArrayToObjects(sheetArray) {
        if (!sheetArray || sheetArray.length < 2) return [];
        const headers = sheetArray[0];
        return sheetArray.slice(1).map(row => {
            const obj = {};
            headers.forEach((h, i) => obj[h] = row[i] ?? '');
            return obj;
        });
    }

    /**
     * Converts array of objects to 2D array for Google Sheets (first row = headers)
     */
    static objectsToSheetArray(data) {
        if (!Array.isArray(data) || data.length === 0) return [[]];
        const headers = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));
        const values = [headers].concat(data.map(obj => headers.map(h => obj[h] ?? '')));
        return values;
    }

    /**
     * Search for a file in Google Drive by name within a specific folder
     * @param {string} fileName - Name of the file to search for
     * @param {string} folderId - ID of the folder to search in
     * @returns {Promise<Object|null>} File object with id and webViewLink, or null if not found
     */
    static async searchDriveFileInFolder(fileName, folderId) {
        return await this.withExponentialBackoff(async () => {
            try {
                if (typeof fileName !== 'string') {
                    console.error('fileName must be a string, received:', typeof fileName, fileName);
                    return null;
                }
                
                if (typeof folderId !== 'string') {
                    console.error('folderId must be a string, received:', typeof folderId, folderId);
                    return null;
                }
                
                const query = `name='${fileName}' and parents in '${folderId}' and trashed=false`;
                
                const response = await gapi.client.request({
                    path: 'https://www.googleapis.com/drive/v3/files',
                    method: 'GET',
                    params: {
                        q: query,
                        fields: 'files(id,name,webViewLink,webContentLink)'
                    }
                });

                if (response.result && response.result.files && response.result.files.length > 0) {
                    const file = response.result.files[0];
                    
                    // Create direct image URL using the file ID
                    const directImageUrl = `https://lh3.googleusercontent.com/d/${file.id}?authuser=1/view`;//`https://drive.google.com/uc?id=${file.id}&export=view`;
                    
                    return {
                        id: file.id,
                        name: file.name,
                        webViewLink: file.webViewLink,
                        directImageUrl: directImageUrl
                    };
                }
                return "";
            } catch (error) {
                console.error('Error searching Drive file:', error);
                return "";
            }
        });
    }

    /**
     * Get a direct image URL for a Google Drive file
     * @param {string} fileId - Google Drive file ID
     * @returns {string} Direct image URL
     */
    static getDriveImageUrl(fileId) {
        return `https://drive.google.com/uc?id=${fileId}&export=view`;
    }
}