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
            
            // Try to restore previous session
            const savedToken = this.getStoredToken();
            if (savedToken && !this.isTokenExpired(savedToken)) {
                gapi.client.setToken(savedToken);
                return true;
            }
            
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
                ux_mode: 'popup'  // Changed from 'redirect' to 'popup'
            });
    
            return new Promise((resolve, reject) => {
                tokenClient.callback = async (resp) => {
                    if (resp.error !== undefined) {
                        console.error('Authentication error:', resp);
                        reject(resp);
                        return;
                    }
                    
                    const token = gapi.client.getToken();
                    if (!token) {
                        console.error('No access token obtained');
                        reject(new Error('Authentication failed - no token obtained'));
                        return;
                    }
                    
                    this.storeToken(token);
                    console.log('Authentication successful, token stored');
                    resolve(resp);
                };
                
                try {
                    tokenClient.requestAccessToken({prompt: 'consent'});
                } catch (error) {
                    console.error('Token request error:', error);
                    reject(error);
                }
            });
        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    }

    static async checkAuth() {
        const token = gapi.client.getToken();
        if (!token) {
            const savedToken = this.getStoredToken();
            if (savedToken && !this.isTokenExpired(savedToken)) {
                gapi.client.setToken(savedToken);
                return true;
            }
            await this.authenticate();
        }
        return true;
    }

    // Token storage methods
    static storeToken(token) {
        if (!token) return;
        token.timestamp = new Date().getTime();
        localStorage.setItem('gapi_token', JSON.stringify(token));
    }

    static getStoredToken() {
        const tokenStr = localStorage.getItem('gapi_token');
        return tokenStr ? JSON.parse(tokenStr) : null;
    }

    static isTokenExpired(token) {
        if (!token || !token.timestamp) return true;
        const tokenAge = (new Date().getTime() - token.timestamp) / 1000;
        // Tokens typically expire after 1 hour (3600 seconds)
        return tokenAge > 3500; // Check slightly before actual expiration
    }

    static clearStoredToken() {
        localStorage.removeItem('gapi_token');
    }

    static isAuthenticated() {
        return !!gapi.client?.getToken();
    }

    static async logout() {
        const token = gapi.client.getToken();
        if (token) {
            try {
                // Revoke the token
                await fetch(`https://oauth2.googleapis.com/revoke?token=${token.access_token}`, {
                    method: 'POST'
                });
            } catch (error) {
                console.warn('Token revocation failed:', error);
            }
            
            // Clear token from gapi client
            gapi.client.setToken(null);
            
            // Clear stored token
            this.clearStoredToken();
        }
    }
}
