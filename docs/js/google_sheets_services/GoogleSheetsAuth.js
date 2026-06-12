let tokenClient;
let gapiInited = false;
let gisInited = false;

const API_KEY = window.APP_CONFIG.API_KEY;
const CLIENT_ID = window.APP_CONFIG.CLIENT_ID;
const SCOPES = window.APP_CONFIG.SCOPES;

/**
 * Base token management functionality shared between real and fake implementations
 */
export class BaseTokenManager {
    static tokenKey = 'gapi_token';
    static emailKey = 'last_email';
    
    static storeToken(token) {
        if (!token) return;
        token.timestamp = new Date().getTime();
        localStorage.setItem(this.tokenKey, JSON.stringify(token));
    }
    
    static getStoredToken() {
        const tokenStr = localStorage.getItem(this.tokenKey);
        return tokenStr ? JSON.parse(tokenStr) : null;
    }
    
    static isTokenExpired(token) {
        if (!token || !token.timestamp) return true;
        const tokenAge = (new Date().getTime() - token.timestamp) / 1000;
        // Tokens typically expire after 1 hour (3600 seconds)
        return tokenAge > 3500; // Check slightly before actual expiration
    }
    
    static clearStoredToken() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.emailKey);
    }
}

export class GoogleSheetsAuth {
    static userEmail = null;
    static _authenticatePromise = null;
    static _silentRefreshPromise = null;

    static _tokenCoversRequiredScopes(token) {
        if (!token || !token.scope) return false;
        const granted = token.scope.split(' ');
        return SCOPES.split(' ').filter(s => s).every(s => granted.includes(s));
    }

    static async initialize() {
        try {
            // Check if APIs are already loaded (from HTML script tags)
            if (typeof gapi === 'undefined') {
                await this.loadGAPIScript();
            }
            
            if (typeof google === 'undefined') {
                await this.loadGISScript();
            } else {
                gisInited = true;
            }
            
            await this.initializeGAPI();
            
            // Try to restore previous session
            const savedToken = BaseTokenManager.getStoredToken();
            if (savedToken && !BaseTokenManager.isTokenExpired(savedToken)) {
                if (!this._tokenCoversRequiredScopes(savedToken)) {
                    console.warn('[GoogleSheetsAuth] Stored token is missing required scopes — clearing to force re-auth');
                    BaseTokenManager.clearStoredToken();
                    return true;
                }
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
                discoveryDocs: [
                    'https://sheets.googleapis.com/$discovery/rest?version=v4',
                    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
                ],
            });

            gapiInited = true;
        } catch (error) {
            console.error('Error initializing GAPI client:', error);
            throw error;
        }
    }

    static async authenticate() {
        if (this._authenticatePromise) {
            return this._authenticatePromise;
        }

        this._authenticatePromise = this._authenticateInternal()
            .finally(() => {
                this._authenticatePromise = null;
            });

        return this._authenticatePromise;
    }

    static async _authenticateInternal() {
        if (!gapiInited || !gisInited) {
            throw new Error('[GoogleSheetsAuth.authenticate] INIT_ERROR: Google API not properly initialized');
        }

        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: ''
            });

            return new Promise((resolve, reject) => {
                tokenClient.callback = async (resp) => {
                    if (resp.error !== undefined) {
                        console.error('[GoogleSheetsAuth.authenticate] AUTH_FAILED: Authentication error:', resp);
                        reject(resp);
                        return;
                    }
                    
                    const token = gapi.client.getToken();
                    if (!token) {
                        console.error('[GoogleSheetsAuth.authenticate] AUTH_FAILED: No access token obtained');
                        reject(new Error('[GoogleSheetsAuth.authenticate] AUTH_FAILED: Authentication failed - no token obtained'));
                        return;
                    }

                    if (!this._tokenCoversRequiredScopes(token)) {
                        const missing = SCOPES.split(' ').filter(s => s && !token.scope?.split(' ').includes(s));
                        console.warn('[GoogleSheetsAuth.authenticate] Granted token is missing scopes (user may have declined):', missing);
                    }
                    
                    BaseTokenManager.storeToken(token);
                    
                    // Store email for future reference
                    const email = await this.getUserEmail();
                    if (email) {
                        localStorage.setItem('last_email', email);
                    }
                    
                    resolve(true);
                };
                
                try {
                    const storedEmail = localStorage.getItem(BaseTokenManager.emailKey);
                    tokenClient.requestAccessToken({
                        prompt: storedEmail ? '' : 'select_account',
                        login_hint: storedEmail || undefined
                    });
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

    static async silentRefresh() {
        // Deduplicate concurrent calls — return the same in-flight promise to all callers
        if (this._silentRefreshPromise) {
            return this._silentRefreshPromise;
        }

        if (!gapiInited || !gisInited) return false;

        const storedEmail = localStorage.getItem(BaseTokenManager.emailKey);

        this._silentRefreshPromise = new Promise((resolve) => {
            try {
                const silentClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    login_hint: storedEmail || undefined,
                    prompt: '',
                    callback: (resp) => {
                        if (resp.error) {
                            resolve(false);
                            return;
                        }
                        const token = gapi.client.getToken();
                        if (!token) {
                            resolve(false);
                            return;
                        }
                        if (!this._tokenCoversRequiredScopes(token)) {
                            console.warn('[GoogleSheetsAuth.silentRefresh] Refreshed token is missing required scopes — full re-auth needed');
                            resolve(false);
                            return;
                        }
                        BaseTokenManager.storeToken(token);
                        resolve(true);
                    },
                    error_callback: () => resolve(false)
                });
                silentClient.requestAccessToken({ prompt: '' });
            } catch {
                resolve(false);
            }
        }).finally(() => {
            this._silentRefreshPromise = null;
        });

        return this._silentRefreshPromise;
    }

    static getTokenSecondsRemaining() {
        const token = BaseTokenManager.getStoredToken();
        if (!token || !token.timestamp) return 0;
        const tokenAge = (Date.now() - token.timestamp) / 1000;
        return Math.max(0, 3500 - tokenAge);
    }

    static async checkAuth() {
        const token = gapi.client.getToken();
        if (!token) {
            const savedToken = BaseTokenManager.getStoredToken();
            if (savedToken && !BaseTokenManager.isTokenExpired(savedToken)) {
                if (!this._tokenCoversRequiredScopes(savedToken)) {
                    console.warn('[GoogleSheetsAuth.checkAuth] Stored token is missing required scopes — clearing');
                    BaseTokenManager.clearStoredToken();
                    return false;
                }
                gapi.client.setToken(savedToken);
                return true;
            }
            return false;
        }

        // Token exists in gapi.client — verify it's not expired
        const savedToken = BaseTokenManager.getStoredToken();
        if (savedToken && BaseTokenManager.isTokenExpired(savedToken)) {
            gapi.client.setToken(null);
            BaseTokenManager.clearStoredToken();
            return false;
        }

        return true;
    }

    static isAuthenticated() {
        return !!gapi.client?.getToken();
    }

    static getMissingScopes() {
        const token = gapi.client?.getToken() || BaseTokenManager.getStoredToken();
        if (!token || !token.scope) return [];
        const grantedScopes = token.scope.split(' ');
        const requiredScopes = SCOPES.split(' ').filter(s => s);
        return requiredScopes.filter(scope => !grantedScopes.includes(scope));
    }

    static async getUserEmail() {
        if (this.userEmail) return this.userEmail;
        
        try {
            await this.checkAuth();
            const token = gapi.client.getToken();
            if (!token?.access_token) return null;

            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${token.access_token}` }
            });
            const data = await response.json();
            this.userEmail = data.email;
            return this.userEmail;
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
            BaseTokenManager.clearStoredToken();
        }
    }
}
