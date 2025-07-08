import { GoogleSheetsAuth } from './GoogleSheetsAuth.js';
import { SheetSql } from './sheetSql.js';

export class GoogleSheetsService {
    
    static SPREADSHEET_IDS = {
        'INVENTORY': '1qHAJ0FgHJjtqXiyCGohzaL1fuzdYQMF2n4YiDSc5uYE',
        'PACK_LISTS': '1mPHa1lEkhHhZ7WYTDetJyUrhjwVEb3l5J1EBLcO17Z0',
        'PROD_SCHED': '1BacxHxdGXSkS__ZtCv6WqgyxvTs_a2Hsv8NJnNiHU18',
        'CACHE': '1lq3caE7Vjzit38ilGd9gLQd9F7W3X3pNIGLzbOB45aw'
    };

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

    static async getSheetData(tableId, range) {
        await GoogleSheetsAuth.checkAuth();
        
        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

        const response = await GoogleSheetsService.withExponentialBackoff(() =>
            gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            })
        );
        return response.result.values;
    }

    static async setSheetData(tableId, tabName, updates) {
        await GoogleSheetsAuth.checkAuth();

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

        try {
            // Handle cell-by-cell updates
            if (Array.isArray(updates)) {
                const data = updates.map(({row, col, value}) => ({
                    range: `${tabName}!${String.fromCharCode(65 + col)}${row + 1}`,
                    values: [[value]]
                }));
                
                await GoogleSheetsService.withExponentialBackoff(() =>
                    gapi.client.sheets.spreadsheets.values.batchUpdate({
                        spreadsheetId,
                        resource: {
                            data: data,
                            valueInputOption: 'USER_ENTERED'
                        }
                    })
                );
                return true;
            }
            
            // Handle full-table updates
            if (updates?.type === 'full-table' && Array.isArray(updates.values)) {
                const values = updates.values;
                
                // Pad rows to consistent length if needed
                if (values.length > 0) {
                    const maxCols = Math.max(...values.map(row => row.length), 10);
                    values.forEach(row => {
                        while (row.length < maxCols) row.push('');
                    });
                }
                
                // Setup range parameters
                const startRow = updates.startRow || 0;
                const startCol = 0;
                const numRows = values.length;
                const numCols = values[0]?.length || 1;
                const endColLetter = String.fromCharCode(65 + startCol + numCols - 1);
                const range = `${tabName}!A${startRow + 1}:${endColLetter}${startRow + numRows}`;
                
                // Ensure sheet has enough rows
                await this._ensureSheetSize(spreadsheetId, tabName, startRow + numRows);
                
                // Update the sheet
                await GoogleSheetsService.withExponentialBackoff(() =>
                    gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values }
                    })
                );
                return true;
            }
            
            throw new Error('Invalid updates format for setSheetData');
        } catch (error) {
            console.error('Error updating sheet:', error);
            throw error;
        }
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

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);
        
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

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

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

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

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

        const spreadsheetId = this.SPREADSHEET_IDS[tableId];
        if (!spreadsheetId) throw new Error(`Spreadsheet ID not found for table: ${tableId}`);

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
}