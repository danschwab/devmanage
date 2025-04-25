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
            // Create an invisible iframe for auth
            const authFrame = document.createElement('iframe');
            authFrame.style.display = 'none';
            document.body.appendChild(authFrame);
            
            // Initialize token client with iframe target
            tokenClient = google.accounts.oauth2.initCodeClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: '', // Will be set in the promise
                error_callback: '', // Will be set in the promise
                ux_mode: 'redirect',
                hosted_domain: window.location.origin,
                iframe: authFrame
            });
    
            return new Promise((resolve, reject) => {
                tokenClient.callback = async (response) => {
                    if (response.error !== undefined) {
                        reject(new Error(response.error));
                        return;
                    }
                    
                    try {
                        await gapi.client.init({
                            apiKey: API_KEY,
                            clientId: CLIENT_ID,
                            scope: SCOPES
                        });
                        
                        const token = gapi.client.getToken();
                        this.storeToken(token);
                        resolve(true);
                    } catch (err) {
                        reject(err);
                    } finally {
                        document.body.removeChild(authFrame);
                    }
                };

                tokenClient.error_callback = (error) => {
                    document.body.removeChild(authFrame);
                    reject(error);
                };
                
                tokenClient.requestCode();
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
}
