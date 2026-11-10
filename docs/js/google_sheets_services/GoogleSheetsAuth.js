import { AUTH_STATUS, authRequiredError } from './authStatus.js';

/**
 * The sign-in session: the one place that gets, keeps and renews Google tokens.
 * See docs/notes/auth-audit-findings.md.
 *
 * With the sign-in service (APP_CONFIG.AUTH_BROKER_URL, an Apps Script web app in apps-script/auth-broker):
 *   sign in is one redirect to Google and back (auth-callback.html), and renewing is a background
 *   fetch to the service. No window opens after sign-in, unless the service ends the session; then
 *   the user's click on the session banner opens Google's popup, which keeps unsaved work.
 * Without it: Google's token popup, opened only by the user's click (sign in, or "Stay signed in").
 *
 * Background code never opens a window: getToken() renews through the service or throws
 * AUTH_REQUIRED, and the status tells the UI to ask the user.
 */

const API_KEY = window.APP_CONFIG.API_KEY;
const CLIENT_ID = window.APP_CONFIG.CLIENT_ID;
const SCOPES = window.APP_CONFIG.SCOPES;
const BROKER_URL = window.APP_CONFIG.AUTH_BROKER_URL || '';

const SESSION_KEY = 'auth_session';   // localStorage: the sign-in service's session
const PENDING_KEY = 'auth_pending';   // sessionStorage: a redirect sign-in on its way to Google
const RESULT_KEY = 'auth_result';     // sessionStorage: what auth-callback.html brought back
const RELAY_CHANNEL = 'tse-auth';     // BroadcastChannel: auth-callback.html → the page, for a popup sign-in
const RENEW_LEAD_S = 600;             // with the service: renew this long before the token ends
const WARN_LEAD_S = 300;              // without it: "Stay signed in" this long before the token ends
const MIN_TOKEN_S = 60;               // a token with less left is renewed before it is used
const RETRY_MS = 60 * 1000;           // the service unreachable: try again after this
const BROKER_TIMEOUT_MS = 30 * 1000;
const POPUP_WAIT_MS = 10 * 60 * 1000;

const POPUP_BLOCKED = 'The browser blocked the sign-in window. Allow pop-ups for this site, then try again.';

/**
 * Token storage shared by the real and fake sessions. A token keeps Google's expires_in as
 * expiresAt; tokens saved before expiresAt existed count as 3500 s from their timestamp.
 */
export class BaseTokenManager {
    static tokenKey = 'gapi_token';
    static emailKey = 'last_email';

    static storeToken(token) {
        if (!token) return;
        const now = Date.now();
        token.timestamp = now;
        token.expiresAt = now + (Number(token.expires_in) || 3600) * 1000;
        try { localStorage.setItem(this.tokenKey, JSON.stringify(token)); } catch { /* private mode: memory only */ }
    }

    static getStoredToken() {
        try { return JSON.parse(localStorage.getItem(this.tokenKey) || 'null'); } catch { return null; }
    }

    static expiresAt(token) {
        if (!token) return 0;
        return token.expiresAt || (token.timestamp ? token.timestamp + 3500 * 1000 : 0);
    }

    static secondsLeft(token) {
        return Math.max(0, (this.expiresAt(token) - Date.now()) / 1000);
    }

    static isTokenExpired(token) {
        return this.secondsLeft(token) <= 0;
    }

    static clearStoredToken() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.emailKey);
    }
}

/** The scopes the app needs that a token's scope list lacks */
export function missingScopes(grantedScope) {
    const granted = String(grantedScope || '').split(' ');
    return SCOPES.split(' ').filter(s => s && !granted.includes(s));
}

function _readJson(storage, key) {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}

function _randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
}

function _base64Url(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Google sends the sign-in back here: the page beside the app's index.html */
function _callbackUrl() {
    return new URL('auth-callback.html', location.href.split('#')[0].split('?')[0]).href;
}

function _loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export class GoogleSheetsAuth {
    /** The session as the app sees it. Change it only through _set, which tells the listeners. */
    static state = {
        status: AUTH_STATUS.SIGNED_OUT,
        email: null,
        missingScopes: [],
        expiresAt: 0,
        usesBroker: !!BROKER_URL,
        // Why the status is needs-user: 'expired' (no service), 'ended' (the service ended the
        // session), 'unavailable' (the service can't be reached; renewing retries by itself)
        reason: null,
        error: null      // the last sign-in failure, for the UI to show
    };
    static _listeners = new Set();
    static _token = null;
    static _timer = null;
    static _renewPromise = null;
    static _needConsent = false;   // the service has no refresh token for this user: ask Google for consent
    static _cancelPopupWait = null;

    // ── State ─────────────────────────────────────────────────────────────────

    /** @param {(state) => void} listener  @returns {() => void} unsubscribe */
    static onChange(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    static _set(changes) {
        Object.assign(this.state, changes);
        this._listeners.forEach(listener => {
            try { listener(this.state); } catch (error) { console.error('[GoogleSheetsAuth] Listener failed:', error); }
        });
    }

    static isActive() {
        return this.state.status === AUTH_STATUS.ACTIVE || this.state.status === AUTH_STATUS.EXPIRING;
    }

    static isAuthenticated() {
        return this.isActive();
    }

    static currentToken() {
        return this._token?.access_token || null;
    }

    static getMissingScopes() {
        return this.state.missingScopes;
    }

    static async getUserEmail() {
        return this.state.email;
    }

    // ── Start ─────────────────────────────────────────────────────────────────

    static async initialize() {
        if (typeof gapi === 'undefined') await _loadScript('https://apis.google.com/js/api.js');
        await new Promise((resolve, reject) => gapi.load('client', { callback: resolve, onerror: reject }));
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [
                'https://sheets.googleapis.com/$discovery/rest?version=v4',
                'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
            ]
        });
        // Without the service, Google's token popup must be ready before the user's click
        if (!BROKER_URL && typeof google === 'undefined') await _loadScript('https://accounts.google.com/gsi/client');

        window.addEventListener('storage', (event) => this._onStorage(event));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this._checkClock(); });
        window.addEventListener('online', () => this._checkClock());

        const email = localStorage.getItem(BaseTokenManager.emailKey);

        // Coming back from a redirect sign-in (auth-callback.html saved Google's answer)
        const result = _readJson(sessionStorage, RESULT_KEY);
        if (result) {
            const pending = _readJson(sessionStorage, PENDING_KEY);
            sessionStorage.removeItem(RESULT_KEY);
            sessionStorage.removeItem(PENDING_KEY);
            try {
                await this._finishSignIn(result, pending);
                return;
            } catch (error) {
                this._set({ error: error.message });
            }
        }

        // A token from earlier on this device that is still good
        const token = BaseTokenManager.getStoredToken();
        if (token && email && BaseTokenManager.secondsLeft(token) > MIN_TOKEN_S) {
            this._useToken(token, email);
            return;
        }

        // The service renews in the background: no window
        if (BROKER_URL && localStorage.getItem(SESSION_KEY)) await this._renew();
        // Otherwise signed out: the page asks the user to sign in, with no unsaved work to lose
    }

    // ── Tokens for requests ───────────────────────────────────────────────────

    /**
     * A valid access token for a request. Renews through the service when the token is about to
     * end. Never opens a window: without a token it throws AUTH_REQUIRED, and the status says why.
     */
    static async getToken() {
        if (this.isActive() && BaseTokenManager.secondsLeft(this._token) > MIN_TOKEN_S) return this._token.access_token;
        if (this.state.status !== AUTH_STATUS.SIGNED_OUT && await this._renew()) return this._token.access_token;
        if (this.isActive()) this._expire();
        throw authRequiredError(this.state.status === AUTH_STATUS.SIGNED_OUT ? 'Sign in to continue.' : 'Sign in again to continue.');
    }

    /**
     * Google answered 401 to a request made with `usedToken`. Returns whether a retry may work:
     * the token was already replaced, or the service renewed it.
     */
    static async handleUnauthorized(usedToken) {
        if (this._token && this._token.access_token !== usedToken) return true;
        this._dropToken();
        // Forget the rejected token, so neither this tab nor another one takes it up again
        if (BaseTokenManager.getStoredToken()?.access_token === usedToken) localStorage.removeItem(BaseTokenManager.tokenKey);
        if (await this._renew()) return true;
        if (this.state.status !== AUTH_STATUS.SIGNED_OUT) this._set({ status: AUTH_STATUS.NEEDS_USER, reason: this.state.reason || 'expired' });
        return false;
    }

    // ── User actions (call these from a click) ────────────────────────────────

    /** The header's sign-in: no window when the service still holds a session; else one redirect, or Google's popup */
    static async signIn() {
        this._set({ error: null });
        if (!BROKER_URL) return this._tokenPopup();
        if (localStorage.getItem(SESSION_KEY) && await this._renew()) return true;
        await this._redirectToGoogle({ consent: this._needConsent });
        return false;
    }

    /**
     * The session banner's button. It must run straight from the click: popups open only there.
     * Unreachable service: retry it (no window). Otherwise Google's popup, which keeps unsaved work.
     */
    static renew() {
        this._set({ error: null });
        if (!BROKER_URL) return this._tokenPopup();
        if (this.state.reason === 'unavailable' && localStorage.getItem(SESSION_KEY)) return this._renew();
        return this._codePopup();
    }

    static async signOut() {
        clearTimeout(this._timer);
        const session = localStorage.getItem(SESSION_KEY);
        if (BROKER_URL && session) {
            try { await this._callBroker({ action: 'signout', session }); } catch (error) { console.warn('[GoogleSheetsAuth] Sign-out at the service failed:', error); }
        } else if (this._token?.access_token) {
            try { await fetch(`https://oauth2.googleapis.com/revoke?token=${this._token.access_token}`, { method: 'POST' }); } catch (error) { console.warn('[GoogleSheetsAuth] Token revocation failed:', error); }
        }
        this._dropToken();
        localStorage.removeItem(SESSION_KEY);
        BaseTokenManager.clearStoredToken();
        this._set({ status: AUTH_STATUS.SIGNED_OUT, email: null, missingScopes: [], expiresAt: 0, reason: null });
    }

    // ── Session internals ─────────────────────────────────────────────────────

    static _useToken(token, email) {
        this._token = token;
        gapi.client.setToken({ access_token: token.access_token });
        const expiresAt = BaseTokenManager.expiresAt(token);
        const expiring = !BROKER_URL && (expiresAt - Date.now()) / 1000 < WARN_LEAD_S;
        this._set({
            status: expiring ? AUTH_STATUS.EXPIRING : AUTH_STATUS.ACTIVE,
            email: email || this.state.email,
            missingScopes: missingScopes(token.scope),
            expiresAt,
            reason: null,
            error: null
        });
        this._schedule();
    }

    static _dropToken() {
        this._token = null;
        if (typeof gapi !== 'undefined') gapi.client?.setToken(null);
    }

    /** The token ran out and only the user can get a new one */
    static _expire() {
        this._dropToken();
        this._set({ status: AUTH_STATUS.NEEDS_USER, reason: 'expired' });
    }

    /** Wake when the token needs attention: renew (service), warn, or expire (no service) */
    static _schedule() {
        clearTimeout(this._timer);
        const secondsLeft = (this.state.expiresAt - Date.now()) / 1000;
        let wakeIn;
        if (BROKER_URL) wakeIn = secondsLeft - RENEW_LEAD_S;
        else wakeIn = secondsLeft > WARN_LEAD_S ? secondsLeft - WARN_LEAD_S : secondsLeft;
        this._timer = setTimeout(() => this._checkClock(), Math.max(0, wakeIn) * 1000 + 50);
    }

    /** Hidden tabs throttle timers, so the clock is also checked when the tab shows again */
    static _checkClock() {
        if (this.state.status === AUTH_STATUS.NEEDS_USER && this.state.reason === 'unavailable') {
            this._renew();
            return;
        }
        if (!this.isActive()) return;
        const secondsLeft = (this.state.expiresAt - Date.now()) / 1000;
        if (BROKER_URL) {
            if (secondsLeft < RENEW_LEAD_S) this._renew();
            else this._schedule();
            return;
        }
        if (secondsLeft <= 0) this._expire();
        else {
            if (secondsLeft < WARN_LEAD_S && this.state.status !== AUTH_STATUS.EXPIRING) this._set({ status: AUTH_STATUS.EXPIRING });
            this._schedule();
        }
    }

    /** Another tab renewed, signed in or signed out */
    static _onStorage(event) {
        if (event.key !== BaseTokenManager.tokenKey || this.state.status === AUTH_STATUS.SIGNED_OUT) return;
        const token = _readJson(localStorage, BaseTokenManager.tokenKey);
        if (token && token.access_token !== this._token?.access_token && BaseTokenManager.secondsLeft(token) > MIN_TOKEN_S) {
            this._useToken(token, localStorage.getItem(BaseTokenManager.emailKey));
        } else if (!token && !localStorage.getItem(SESSION_KEY)) {
            // Signed out in another tab: keep this tab's work, and let its user sign in again
            this._dropToken();
            this._set({ status: AUTH_STATUS.NEEDS_USER, reason: 'ended' });
        }
    }

    /** Renew through the service, one renewal at a time across this page and other tabs */
    static _renew() {
        if (!BROKER_URL || !localStorage.getItem(SESSION_KEY)) return Promise.resolve(false);
        if (!this._renewPromise) {
            const run = () => this._renewOnce();
            this._renewPromise = (navigator.locks ? navigator.locks.request('tse-auth-renew', run) : run())
                .finally(() => { this._renewPromise = null; });
        }
        return this._renewPromise;
    }

    static async _renewOnce() {
        // Another tab may have renewed while this one waited for the lock
        const stored = BaseTokenManager.getStoredToken();
        if (stored && stored.access_token !== this._token?.access_token && BaseTokenManager.secondsLeft(stored) > RENEW_LEAD_S) {
            this._useToken(stored, localStorage.getItem(BaseTokenManager.emailKey));
            return true;
        }
        const session = localStorage.getItem(SESSION_KEY);
        if (!session) return false;
        try {
            this._acceptSession(await this._callBroker({ action: 'refresh', session }));
            return true;
        } catch (error) {
            const signedIn = this.state.status !== AUTH_STATUS.SIGNED_OUT;
            const tokenLeft = this._token && BaseTokenManager.secondsLeft(this._token) > MIN_TOKEN_S;
            if (error.brokerError) {
                // The service ended the session (revoked, idle too long, or reused)
                console.warn('[GoogleSheetsAuth] The sign-in service ended the session:', error.brokerError);
                localStorage.removeItem(SESSION_KEY);
                if (error.brokerError === 'NO_REFRESH_TOKEN' || error.brokerError === 'GRANT_REVOKED') this._needConsent = true;
                if (signedIn && !tokenLeft) {
                    this._dropToken();
                    this._set({ status: AUTH_STATUS.NEEDS_USER, reason: 'ended' });
                }
            } else {
                console.warn('[GoogleSheetsAuth] Sign-in service unreachable, retrying in a minute:', error);
                clearTimeout(this._timer);
                this._timer = setTimeout(() => this._checkClock(), RETRY_MS);
                if (signedIn && !tokenLeft) {
                    this._dropToken();
                    this._set({ status: AUTH_STATUS.NEEDS_USER, reason: 'unavailable' });
                } else if (!signedIn) {
                    this._set({ error: 'Could not reach the sign-in service. Try signing in again in a moment.' });
                }
            }
            return false;
        }
    }

    /** The service's answer to a sign-in or renewal: { session, accessToken, expiresIn, scope, email } */
    static _acceptSession(answer) {
        localStorage.setItem(SESSION_KEY, answer.session);
        localStorage.setItem(BaseTokenManager.emailKey, answer.email);
        this._needConsent = false;
        const token = { access_token: answer.accessToken, expires_in: answer.expiresIn, scope: answer.scope, token_type: 'Bearer' };
        BaseTokenManager.storeToken(token);
        this._useToken(token, answer.email);
    }

    /**
     * POST to the service. A plain-text body keeps it a simple request: Apps Script can't answer a
     * CORS preflight. Throws with brokerError set when the service answered with a refusal.
     */
    static async _callBroker(body) {
        const response = await fetch(BROKER_URL, {
            method: 'POST',
            body: JSON.stringify(body),
            signal: AbortSignal.timeout ? AbortSignal.timeout(BROKER_TIMEOUT_MS) : undefined
        });
        if (!response.ok) throw new Error(`Sign-in service answered ${response.status}`);
        let answer;
        try { answer = await response.json(); } catch { throw new Error('Sign-in service sent an unreadable answer'); }
        if (!answer.ok) {
            const error = new Error(answer.message || answer.error || 'Sign-in refused');
            if (answer.error === 'SERVER_ERROR') throw error;   // the service failed: treat as unreachable
            error.brokerError = answer.error;
            throw error;
        }
        return answer;
    }

    // ── Signing in with the service ───────────────────────────────────────────

    /** Google's authorization URL for a code the service exchanges. kind: 'r' redirect, 'p' popup. */
    static async _authorizationRequest(kind, consent) {
        const state = `${kind}.${_randomString(32)}`;
        const verifier = _randomString(64);
        const challenge = _base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
        const email = localStorage.getItem(BaseTokenManager.emailKey);
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: _callbackUrl(),
            response_type: 'code',
            scope: SCOPES,
            access_type: 'offline',
            include_granted_scopes: 'true',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256'
        });
        if (consent) params.set('prompt', 'consent');
        else if (!email) params.set('prompt', 'select_account');
        if (email) params.set('login_hint', email);
        return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, pending: { state, verifier, consent: !!consent } };
    }

    /** One redirect: Google, then auth-callback.html, then back to this page, which finishes in initialize() */
    static async _redirectToGoogle({ consent = false } = {}) {
        const { url, pending } = await this._authorizationRequest('r', consent);
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, returnUrl: location.href }));
        location.assign(url);
        await new Promise(() => {});   // the page is leaving
    }

    /** Google's sign-in in a popup: the page and its unsaved work stay put */
    static _codePopup() {
        // Opened at once, inside the click; it goes to Google once the request is ready
        const popup = window.open('', 'tse-sign-in', 'popup,width=500,height=650');
        if (!popup) {
            this._set({ error: POPUP_BLOCKED });
            return Promise.resolve(false);
        }
        return (async () => {
            const { url, pending } = await this._authorizationRequest('p', this._needConsent);
            popup.location.href = url;
            const result = await this._waitForPopup(pending.state);
            if (!result) return false;
            await this._finishSignIn(result, pending);
            return true;
        })().catch((error) => {
            this._set({ error: error.message });
            return false;
        });
    }

    /** auth-callback.html, open in the popup, broadcasts Google's answer to this page */
    static _waitForPopup(state) {
        this._cancelPopupWait?.();
        return new Promise((resolve) => {
            const channel = new BroadcastChannel(RELAY_CHANNEL);
            const finish = (result) => {
                clearTimeout(timer);
                channel.close();
                this._cancelPopupWait = null;
                resolve(result);
            };
            const timer = setTimeout(() => finish(null), POPUP_WAIT_MS);
            this._cancelPopupWait = () => finish(null);
            channel.onmessage = (event) => { if (event.data?.state === state) finish(event.data); };
        });
    }

    /** Google's answer → the service exchanges the code → a session */
    static async _finishSignIn(result, pending) {
        if (!pending || result.state !== pending.state) throw new Error('Sign-in was interrupted. Please sign in again.');
        if (result.error) throw new Error(result.error === 'access_denied' ? 'Sign-in was cancelled.' : `Google sign-in failed (${result.error}).`);
        try {
            this._acceptSession(await this._callBroker({ action: 'exchange', code: result.code, verifier: pending.verifier, redirectUri: _callbackUrl() }));
        } catch (error) {
            if (error.brokerError !== 'NO_REFRESH_TOKEN') throw error;
            // The service has no refresh token for this account yet: Google gives one with consent
            this._needConsent = true;
            if (pending.consent) throw new Error('Google did not grant offline access. Please sign in again.');
            if (pending.state.startsWith('r.')) await this._redirectToGoogle({ consent: true });   // never returns
            throw new Error('One more step: click Sign in again to let the app stay signed in.');
        }
    }

    // ── Without the service: Google's token popup ─────────────────────────────

    /** Must run straight from the click. Opens Google's popup; it closes by itself when nothing needs approval. */
    static _tokenPopup() {
        if (typeof google === 'undefined' || !google.accounts?.oauth2) {
            this._set({ error: 'Google sign-in is still loading. Try again in a moment.' });
            return Promise.resolve(false);
        }
        const email = localStorage.getItem(BaseTokenManager.emailKey);
        return new Promise((resolve) => {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                login_hint: email || undefined,
                callback: async (response) => {
                    if (response.error) {
                        this._set({ error: `Google sign-in failed (${response.error}).` });
                        resolve(false);
                        return;
                    }
                    const token = { access_token: response.access_token, expires_in: response.expires_in, scope: response.scope, token_type: 'Bearer' };
                    const signedInEmail = await this._fetchEmail(token.access_token);
                    if (!signedInEmail) {
                        this._set({ error: 'Could not read the signed-in account. Please try again.' });
                        resolve(false);
                        return;
                    }
                    BaseTokenManager.storeToken(token);
                    localStorage.setItem(BaseTokenManager.emailKey, signedInEmail);
                    this._useToken(token, signedInEmail);
                    resolve(true);
                },
                error_callback: (error) => {
                    if (error?.type === 'popup_failed_to_open') this._set({ error: POPUP_BLOCKED });
                    else if (error?.type !== 'popup_closed') this._set({ error: 'Google sign-in failed. Please try again.' });
                    resolve(false);
                }
            });
            client.requestAccessToken({ prompt: email ? '' : 'select_account' });
        });
    }

    static async _fetchEmail(accessToken) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
            return (await response.json()).email || null;
        } catch (error) {
            console.error('[GoogleSheetsAuth] Reading the signed-in account failed:', error);
            return null;
        }
    }
}
