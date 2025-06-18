// Google Sheets API configuration
const API_KEY = 'AIzaSyCDA4ynZWF1xbuFQ2exsX2orRYQPpsiX1U';
const CLIENT_ID = '381868581846-a5hdjs5520u9u1jve5rdalm3kua2iqpf.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

let tokenClient;
let gapiInited = false;
let gisInited = false;

export class GoogleSheetsAuth {
    static userEmail = null;

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

    static async authenticate(silent = false) {
        if (!gapiInited || !gisInited) {
            throw new Error('Google API not properly initialized');
        }

        try {
            const lastEmail = localStorage.getItem('last_email');
            
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: '',
                login_hint: silent ? lastEmail : '',
                prompt: silent ? 'none' : 'select_account'
            });

            return new Promise((resolve, reject) => {
                tokenClient.callback = async (resp) => {
                    if (resp.error !== undefined) {
                        if (silent) {
                            // Silent refresh failed, but this isn't an error
                            resolve(false);
                            return;
                        }
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
                    
                    // Store email for future silent refresh
                    const email = await this.getUserEmail();
                    if (email) {
                        localStorage.setItem('last_email', email);
                    }
                    
                    resolve(true);
                };
                
                try {
                    tokenClient.requestAccessToken({
                        prompt: silent ? 'none' : 'select_account',
                        login_hint: silent ? lastEmail : ''
                    });
                } catch (error) {
                    if (silent) {
                        resolve(false);
                    } else {
                        console.error('Token request error:', error);
                        reject(error);
                    }
                }
            });
        } catch (error) {
            if (silent) {
                return false;
            }
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
            
            // Try silent refresh first
            const silentSuccess = await this.authenticate(true);
            if (!silentSuccess) {
                // If silent refresh fails, try interactive login
                await this.authenticate(false);
            }
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
        localStorage.removeItem('last_email');
    }

    static isAuthenticated() {
        return !!gapi.client?.getToken();
    }

    static async getUserEmail() {
        if (this.userEmail) return this.userEmail;
        
        try {
            await this.checkAuth();
            const token = gapi.client.getToken();
            if (!token) return null;

            // Get basic profile from google identity
            const googleUser = google.accounts.oauth2.hasGrantedAllScopes(token, 'email');
            const profile = googleUser && token.access_token;
            
            if (profile) {
                const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${token.access_token}` }
                });
                const data = await response.json();
                this.userEmail = data.email;
                return this.userEmail;
            }
            return null;
        } catch (error) {
            console.error('Error getting user email:', error);
            return null;
        }
    }

    static async logout() {
        this.userEmail = null;
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
