// Google Sheets API configuration
const API_KEY = 'AIzaSyCDA4ynZWF1xbuFQ2exsX2orRYQPpsiX1U';
const CLIENT_ID = '381868581846-a5hdjs5520u9u1jve5rdalm3kua2iqpf.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;

export class GoogleSheetsAuth {
    static async initialize() {
        try {
            await this.loadGAPIScript();
            await this.loadGISScript();
            await this.initializeGAPI();
            return true;
        } catch (error) {
            console.error('Failed to initialize Google Sheets API:', error);
            throw error;
        }
    }

    static async loadGAPIScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    static async loadGISScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => {
                gisInited = true;
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    static async initializeGAPI() {
        try {
            await new Promise((resolve, reject) => {
                gapi.load('client', {
                    callback: resolve,
                    onerror: reject
                });
            });

            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
            });

            gapiInited = true;
        } catch (error) {
            console.error('Error initializing GAPI client:', error);
            throw error;
        }
    }

    static async authenticate() {
        if (!gapiInited || !gisInited) {
            throw new Error('Google API not properly initialized');
        }
    
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: '', // defined in the promise
                ux_mode: 'redirect',
                redirect_uri: 'https://dschwabdesign.com/TopShelfLiveInventory/'
            });
    
            return new Promise((resolve, reject) => {
                tokenClient.callback = async (resp) => {
                    if (resp.error !== undefined) {
                        console.error('Authentication error:', resp);
                        reject(resp);
                        return;
                    }
                    
                    // Verify we have access token
                    if (!gapi.client.getToken()) {
                        console.error('No access token obtained');
                        reject(new Error('Authentication failed - no token obtained'));
                        return;
                    }
                    
                    console.log('Authentication successful, token obtained');
                    resolve(resp);
                };
                
                // Force consent prompt to ensure we get fresh tokens
                tokenClient.requestAccessToken({prompt: 'consent'});
            });
        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    }

    static async checkAuth() {
        if (!gapi.client.getToken()) {
            console.error('No valid token found, attempting to re-authenticate');
            await this.authenticate();
        }
    }
    
    static async getSheetData(spreadsheetId, range) {
        try {
            await this.checkAuth();
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: range,
            });
            return response.result.values;
        } catch (err) {
            console.error('Error reading sheet data:', err);
            throw new Error('Error reading sheet data: ' + err.message);
        }
    }

    static async getNonEmptyRange(spreadsheetId, tabName, index, isRow = true) {
        try {
            await this.checkAuth();
            // Get either the entire row or column
            const range = isRow 
                ? `${tabName}!${index}:${index}`      // row format
                : `${tabName}!${index}:${index}`;     // column format (same format works for both)

            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: range,
                majorDimension: isRow ? "ROWS" : "COLUMNS" // specify orientation
            });

            const values = isRow 
                ? (response.result.values?.[0] || [])
                : (response.result.values?.map(row => row[0]) || []);
            
            // Find first and last non-empty cell
            let start = 0;
            let end = values.length - 1;

            // Find first non-empty cell
            while (start < values.length && !values[start]) {
                start++;
            }

            // Find last non-empty cell
            while (end >= 0 && !values[end]) {
                end--;
            }

            // Convert number to column letter
            const toColumnLetter = (num) => {
                let letter = '';
                while (num >= 0) {
                    letter = String.fromCharCode(65 + (num % 26)) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            // Return range in A1 notation
            if (start <= end) {
                if (isRow) {
                    return {
                        startColumn: toColumnLetter(start),
                        endColumn: toColumnLetter(end),
                        range: `${tabName}!${toColumnLetter(start)}${index}:${toColumnLetter(end)}${index}`
                    };
                } else {
                    return {
                        startRow: start + 1,
                        endRow: end + 1,
                        range: `${tabName}!${index}${start + 1}:${index}${end + 1}`
                    };
                }
            }

            throw new Error('No non-empty cells found');
        } catch (err) {
            console.error('Error getting non-empty range:', err);
            throw new Error('Error getting non-empty range: ' + err.message);
        }
    }

    static async findIndices(spreadsheetId, tabName, searchString, searchIndex, isRow = true) {
        try {
            await this.checkAuth();
            // First get the non-empty range
            const nonEmptyRange = await this.getNonEmptyRange(spreadsheetId, tabName, searchIndex, isRow);
            if (!nonEmptyRange) {
                return {
                    searchLocation: isRow ? `Row ${searchIndex}` : `Column ${searchIndex}`,
                    matches: []
                };
            }

            // Get the data within the non-empty range
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: nonEmptyRange.range,
                majorDimension: isRow ? "ROWS" : "COLUMNS"
            });

            // Get values and normalize search string
            const values = isRow 
                ? (response.result.values?.[0] || [])
                : (response.result.values?.map(row => row[0]) || []);
            const normalizedSearch = searchString.toLowerCase().trim();

            // Find all matching indices within the non-empty range
            const matches = values.reduce((acc, value, index) => {
                if (value && value.toString().toLowerCase().includes(normalizedSearch)) {
                    const actualIndex = isRow 
                        ? this.toColumnLetter(index + this.letterToColumn(nonEmptyRange.startColumn))
                        : index + nonEmptyRange.startRow;
                    acc.push({
                        index: actualIndex,
                        value: value
                    });
                }
                return acc;
            }, []);

            return {
                searchLocation: isRow ? `Row ${searchIndex}` : `Column ${searchIndex}`,
                range: nonEmptyRange.range,
                matches: matches
            };

        } catch (err) {
            console.error('Error finding indices:', err);
            throw new Error('Error finding indices: ' + err.message);
        }
    }

    // Add helper method to convert column letter to number
    static letterToColumn(letter) {
        let column = 0;
        const length = letter.length;
        for (let i = 0; i < length; i++) {
            column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
        }
        return column - 1; // Convert to 0-based index
    }

    static toColumnLetter(num) {
        let letter = '';
        while (num >= 0) {
            letter = String.fromCharCode(65 + (num % 26)) + letter;
            num = Math.floor(num / 26) - 1;
        }
        return letter;
    }

    static async getDataFromTableSearch(spreadsheetId, tabName, headerName, searchValue) {
        try {
            console.debug('[TableSearch] Starting search:', { headerName, searchValue });
            
            // Get first row to find headers
            const range = `${tabName}!1:1`;
            const headerResponse = await this.getSheetData(spreadsheetId, range);
            console.debug('[TableSearch] Headers:', headerResponse);
            
            if (!headerResponse || !headerResponse[0]) {
                throw new Error('No headers found in first row');
            }

            const headers = headerResponse[0];
            // Find the column index for the header
            const headerIndex = headers.findIndex(h => 
                h && h.toString().toLowerCase() === headerName.toString().toLowerCase()
            );
            console.debug('[TableSearch] Header index:', { headerName, headerIndex });
            
            if (headerIndex === -1) {
                throw new Error(`Header "${headerName}" not found`);
            }

            // Convert header index to column letter
            const columnLetter = this.toColumnLetter(headerIndex);
            
            // Search in the specific column
            const searchResults = await this.findIndices(spreadsheetId, tabName, searchValue, columnLetter, false);
            console.debug('[TableSearch] Search results:', searchResults);

            if (!searchResults.matches || !searchResults.matches.length) {
                console.debug('[TableSearch] No matches found');
                return {
                    headers: headers,
                    data: []
                };
            }

            // Get data for all columns
            const columnIndices = headers.map((_, index) => this.toColumnLetter(index));
            const rowIndices = searchResults.matches.map(match => match.index);

            const result = await this.getDataFromIndices(spreadsheetId, tabName, rowIndices, columnIndices);
            console.debug('[TableSearch] Final result:', result);

            return {
                headers: headers,
                data: result.data
            };

        } catch (err) {
            console.error('[TableSearch] Error:', err);
            throw new Error('Error in table search: ' + err.message);
        }
    }

    static async getDataFromIndices(spreadsheetId, tabName, rowIndices, columnIndices) {
        try {
            console.debug('[GetData] Fetching data for:', { rowIndices, columnIndices });
            
            // Handle empty input arrays
            if (!rowIndices.length || !columnIndices.length) {
                return [];
            }

            // Sort indices to optimize range requests
            const sortedRows = [...rowIndices].sort((a, b) => a - b);
            const sortedCols = [...columnIndices].map(col => 
                typeof col === 'string' ? this.letterToColumn(col) : col
            ).sort((a, b) => a - b);

            // Convert numeric column indices to letters
            const colLetters = sortedCols.map(col => this.toColumnLetter(col));

            // Create range string for the request
            // Example: "Sheet1!A1:C3" for multiple cells
            const range = `${tabName}!${colLetters[0]}${sortedRows[0]}:${colLetters[colLetters.length-1]}${sortedRows[sortedRows.length-1]}`;
            console.debug('[GetData] Constructed range:', range);

            // Get the data
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: range
            });
            console.debug('[GetData] API response:', response);

            // Extract requested cells from the response
            const fullData = response.result.values || [];
            const result = [];

            // Map the original row indices to their positions in the retrieved data
            rowIndices.forEach(rowIndex => {
                const dataRowIndex = sortedRows.indexOf(rowIndex);
                if (dataRowIndex >= 0 && dataRowIndex < fullData.length) {
                    const row = fullData[dataRowIndex] || [];
                    const resultRow = columnIndices.map(colIndex => {
                        const colNum = typeof colIndex === 'string' 
                            ? this.letterToColumn(colIndex)
                            : colIndex;
                        const dataColIndex = sortedCols.indexOf(colNum);
                        return row[dataColIndex] || '';
                    });
                    result.push(resultRow);
                } else {
                    // Push empty row if row index not found
                    result.push(new Array(columnIndices.length).fill(''));
                }
            });

            console.debug('[GetData] Processed result:', { range, data: result });
            return {
                range: range,
                data: result
            };

        } catch (err) {
            console.error('[GetData] Error:', err);
            throw new Error('Error getting data from indices: ' + err.message);
        }
    }
}
