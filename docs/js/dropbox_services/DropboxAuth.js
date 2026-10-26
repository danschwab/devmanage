/**
 * Dropbox OAuth 2 (PKCE) authentication for a browser-only app.
 *
 * Flow: popup -> dropbox.com/oauth2/authorize -> dropbox-auth.html (redirect page)
 *       -> BroadcastChannel message back to this window -> code exchange -> token in localStorage.
 *
 * PKCE does not use the app secret; only the app key (client_id) is needed.
 * The code verifier never leaves memory of the window that started the flow.
 */

// Must match the channel name in docs/dropbox-auth.html
export const DROPBOX_AUTH_CHANNEL = 'tse-dropbox-auth';

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;

function randomString(byteLength) {
    const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
    return base64Url(bytes);
}

function base64Url(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64Url(new Uint8Array(digest));
}

export class DropboxAuth {
    static tokenKey = 'dropbox_token';
    static _cancelAuthentication = null;
    static _refreshPromise = null;

    static getRedirectUri() {
        return new URL('dropbox-auth.html', window.location.origin + window.location.pathname).href;
    }

    // ── Token storage ────────────────────────────────────────────────────────

    static getStoredToken() {
        const tokenStr = localStorage.getItem(this.tokenKey);
        return tokenStr ? JSON.parse(tokenStr) : null;
    }

    static storeToken(resp, appKey) {
        const previous = this.getStoredToken();
        const token = {
            access_token: resp.access_token,
            // Refresh responses do not include a new refresh token
            refresh_token: resp.refresh_token || previous?.refresh_token,
            expires_at: Date.now() + (resp.expires_in || 0) * 1000,
            account_id: resp.account_id || previous?.account_id,
            app_key: appKey
        };
        localStorage.setItem(this.tokenKey, JSON.stringify(token));
        return token;
    }

    static clearStoredToken() {
        localStorage.removeItem(this.tokenKey);
    }

    static hasStoredToken() {
        return !!this.getStoredToken()?.refresh_token;
    }

    // ── Authentication ───────────────────────────────────────────────────────

    /**
     * Must be called synchronously from a user gesture (click) so the popup is not blocked.
     * @param {() => Promise<string>} getAppKey - resolves the Dropbox app key; called after the popup opens
     */
    static authenticate(getAppKey) {
        if (this._cancelAuthentication) {
            console.log('[DropboxAuth.authenticate] Canceling in-flight authentication attempt');
            this._cancelAuthentication();
        }
        // Open before any await to keep the user-gesture context
        const popup = window.open('', 'dropbox-auth', 'width=600,height=720');
        if (!popup) {
            return Promise.reject(new Error('Dropbox sign-in popup was blocked. Please allow popups and try again.'));
        }
        return this._runAuthFlow(popup, getAppKey);
    }

    static async _runAuthFlow(popup, getAppKey) {
        try {
            const appKey = await getAppKey();
            const verifier = randomString(48);
            const state = randomString(16);
            const challenge = await pkceChallenge(verifier);
            const redirectUri = this.getRedirectUri();

            const callbackPromise = this._waitForCallback(state);
            popup.location.href = this._buildAuthorizeUrl({ appKey, redirectUri, state, challenge });
            const { code } = await callbackPromise;

            const resp = await this._exchangeCode({ appKey, code, verifier, redirectUri });
            this.storeToken(resp, appKey);
            return true;
        } catch (error) {
            try { popup.close(); } catch { /* popup may already be gone */ }
            throw error;
        }
    }

    /**
     * Resolves with { code } when the redirect page broadcasts a result for this state.
     * Messages for other states are ignored (stale or concurrent attempts).
     */
    static _waitForCallback(state) {
        return new Promise((resolve, reject) => {
            const channel = new BroadcastChannel(DROPBOX_AUTH_CHANNEL);
            const finish = (fn, value) => {
                clearTimeout(timer);
                channel.close();
                this._cancelAuthentication = null;
                fn(value);
            };
            const timer = setTimeout(() => finish(reject, new Error('Dropbox sign-in timed out')), AUTH_TIMEOUT_MS);
            this._cancelAuthentication = () => finish(reject, new Error('Dropbox authentication cancelled'));

            channel.onmessage = (event) => {
                const msg = event.data || {};
                if (msg.state !== state) return;
                if (msg.error) {
                    finish(reject, new Error(`Dropbox sign-in failed: ${msg.errorDescription || msg.error}`));
                } else if (!msg.code) {
                    finish(reject, new Error('Dropbox sign-in returned no authorization code'));
                } else {
                    finish(resolve, { code: msg.code });
                }
            };
        });
    }

    /**
     * Returns a valid access token, refreshing it if expired. Null if not connected.
     */
    static async getAccessToken() {
        const token = this.getStoredToken();
        if (!token?.refresh_token) return null;
        if (token.access_token && token.expires_at - EXPIRY_MARGIN_MS > Date.now()) {
            return token.access_token;
        }
        if (!this._refreshPromise) {
            this._refreshPromise = this._refreshToken({ appKey: token.app_key, refreshToken: token.refresh_token })
                .then(resp => this.storeToken(resp, token.app_key).access_token)
                .catch(error => {
                    // invalid_grant means the user revoked access or the refresh token is dead
                    if (error.status === 400 || error.status === 401) this.clearStoredToken();
                    throw error;
                })
                .finally(() => { this._refreshPromise = null; });
        }
        return this._refreshPromise;
    }

    static async getCurrentAccount() {
        return this._rpc('users/get_current_account');
    }

    static async logout() {
        const accessToken = await this.getAccessToken().catch(() => null);
        if (accessToken) {
            try {
                await this._revokeToken(accessToken);
            } catch (error) {
                console.warn('[DropboxAuth.logout] Token revocation failed:', error);
            }
        }
        this.clearStoredToken();
    }

    // ── Dropbox endpoints (overridden by FakeDropboxAuth) ───────────────────

    static _buildAuthorizeUrl({ appKey, redirectUri, state, challenge }) {
        const params = new URLSearchParams({
            client_id: appKey,
            response_type: 'code',
            redirect_uri: redirectUri,
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            token_access_type: 'offline'
        });
        return `https://www.dropbox.com/oauth2/authorize?${params}`;
    }

    static async _exchangeCode({ appKey, code, verifier, redirectUri }) {
        return this._tokenRequest({
            grant_type: 'authorization_code',
            code,
            client_id: appKey,
            redirect_uri: redirectUri,
            code_verifier: verifier
        });
    }

    static async _refreshToken({ appKey, refreshToken }) {
        return this._tokenRequest({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: appKey
        });
    }

    static async _revokeToken(accessToken) {
        await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
    }

    static async _tokenRequest(body) {
        const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(`Dropbox token request failed: ${data.error_description || data.error || response.status}`);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    // No-argument RPC call: Dropbox requires no body and no Content-Type for these
    static async _rpc(endpoint) {
        const accessToken = await this.getAccessToken();
        if (!accessToken) throw new Error('Dropbox is not connected');
        const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) {
            const error = new Error(`Dropbox ${endpoint} failed: ${response.status} ${await response.text()}`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }
}
