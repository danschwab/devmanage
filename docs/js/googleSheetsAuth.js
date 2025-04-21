// Google Sheets API configuration
const API_KEY = 'YOUR_API_KEY';
const CLIENT_ID = 'YOUR_CLIENT_ID';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let tokenClient;
let gapiInited = false;
let gisInited = false;

export class GoogleSheetsAuth {
    static async initialize() {
        await this.loadGAPIScript();
        await this.loadGISScript();
        await this.initializeGAPI();
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
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    static async initializeGAPI() {
        await new Promise((resolve) => gapi.load('client', resolve));
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInited = true;
    }

    static async authenticate() {
        if (!gapiInited) {
            throw new Error('GAPI not initialized');
        }

        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // defined later
        });

        return new Promise((resolve, reject) => {
            tokenClient.callback = (resp) => {
                if (resp.error !== undefined) {
                    reject(resp);
                }
                resolve(resp);
            };
            tokenClient.requestAccessToken();
        });
    }

    static async getSheetData(spreadsheetId, range) {
        try {
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: range,
            });
            return response.result.values;
        } catch (err) {
            throw new Error('Error reading sheet data: ' + err.message);
        }
    }
}
