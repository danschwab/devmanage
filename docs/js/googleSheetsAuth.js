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

    static async getDataFromTableSearch(spreadsheetId, tabName, headerName, searchValue) {
        try {
            await this.checkAuth();
            console.debug('[TableSearch] Starting search:', { headerName, searchValue });
            
            // Get sheet metadata to find the full data range
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: spreadsheetId,
                ranges: [`${tabName}!1:1`],
                includeGridData: true
            });
            
            const headers = response.result.sheets[0].data[0].rowData[0].values
                .map(cell => cell.formattedValue)
                .filter(value => value);
            
            const headerIndex = headers.findIndex(h => 
                h && h.toString().toLowerCase() === headerName.toString().toLowerCase()
            );

            if (headerIndex === -1) {
                throw new Error(`Header "${headerName}" not found`);
            }

            // Use Grid Query to filter data
            const columnLetter = this.toColumnLetter(headerIndex);
            const query = encodeURIComponent(`SELECT * WHERE ${columnLetter} CONTAINS '${searchValue}'`);
            const queryRange = `${tabName}!A1:${this.toColumnLetter(headers.length-1)}`;
            
            const searchResponse = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: queryRange,
                majorDimension: 'ROWS'
            });

            const allData = searchResponse.result.values || [];
            const filteredData = allData.slice(1).filter(row => 
                row[headerIndex]?.toString().toLowerCase().includes(searchValue.toLowerCase())
            );

            return {
                headers: headers,
                data: filteredData
            };

        } catch (err) {
            console.error('[TableSearch] Error:', err);
            throw new Error('Error in table search: ' + err.message);
        }
    }

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
}
