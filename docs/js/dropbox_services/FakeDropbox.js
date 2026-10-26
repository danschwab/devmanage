/**
 * Fake Dropbox implementation for localhost testing.
 * Reuses the real DropboxAuth flow (popup, redirect page, BroadcastChannel, PKCE, token storage)
 * and replaces only the Dropbox endpoints, so the full sign-in roundtrip runs locally.
 *
 * The fake authorize step skips dropbox.com and sends the popup straight to dropbox-auth.html
 * with an authorization code. The fake token endpoint verifies the PKCE challenge, so a broken
 * verifier/challenge pairing fails here the same way it would against Dropbox.
 */

import { DropboxAuth, pkceChallenge } from './DropboxAuth.js';
import { FakeGoogleSheetsAuth } from '../google_sheets_services/FakeGoogle.js';

export const FAKE_DROPBOX_ACCOUNT = {
    account_id: 'dbid:fake_account_0001',
    name: {
        given_name: 'Test',
        surname: 'User',
        familiar_name: 'Test',
        display_name: 'Test User',
        abbreviated_name: 'TU'
    },
    email: 'test@example.com',
    email_verified: true,
    account_type: { '.tag': 'business' },
    root_info: { '.tag': 'team', root_namespace_id: '1000', home_namespace_id: '2000', home_path: '/Test User' }
};

const FAKE_EXPIRES_IN = 14400; // Dropbox short-lived tokens last 4 hours

export class FakeDropboxAuth extends DropboxAuth {
    static _issuedCodes = new Map(); // code -> { appKey, redirectUri, challenge }

    // Tokens the fake server considers valid; persisted so a connection survives page reloads
    static _serverKey = 'fake_dropbox_server';
    static _loadServer() {
        const saved = JSON.parse(localStorage.getItem(this._serverKey) || '{}');
        return { refresh: new Set(saved.refresh || []), access: new Set(saved.access || []) };
    }
    static _saveServer(server) {
        localStorage.setItem(this._serverKey, JSON.stringify({ refresh: [...server.refresh], access: [...server.access] }));
    }

    static _buildAuthorizeUrl({ appKey, redirectUri, state, challenge }) {
        const code = 'fake_code_' + crypto.randomUUID();
        this._issuedCodes.set(code, { appKey, redirectUri, challenge });
        const params = new URLSearchParams({ code, state });
        return `${redirectUri}?${params}`;
    }

    static async _exchangeCode({ appKey, code, verifier, redirectUri }) {
        await FakeGoogleSheetsAuth.delay(200);
        const issued = this._issuedCodes.get(code);
        this._issuedCodes.delete(code); // codes are single-use
        if (!issued) throw this._error(400, 'invalid_grant: code doesn\'t exist or has expired');
        if (issued.appKey !== appKey) throw this._error(400, 'invalid_grant: client_id mismatch');
        if (issued.redirectUri !== redirectUri) throw this._error(400, 'invalid_grant: redirect_uri mismatch');
        if (issued.challenge !== await pkceChallenge(verifier)) throw this._error(400, 'invalid_grant: invalid code verifier');

        const refreshToken = 'fake_refresh_' + crypto.randomUUID();
        const server = this._loadServer();
        server.refresh.add(refreshToken);
        this._saveServer(server);
        return {
            ...this._issueAccessToken(),
            refresh_token: refreshToken,
            account_id: FAKE_DROPBOX_ACCOUNT.account_id,
            uid: '12345',
            scope: 'account_info.read'
        };
    }

    static async _refreshToken({ refreshToken }) {
        await FakeGoogleSheetsAuth.delay(100);
        if (!this._loadServer().refresh.has(refreshToken)) throw this._error(400, 'invalid_grant: refresh token is invalid or revoked');
        return this._issueAccessToken();
    }

    static async _revokeToken(accessToken) {
        await FakeGoogleSheetsAuth.delay(50);
        const server = this._loadServer();
        server.access.delete(accessToken);
        server.refresh.delete(this.getStoredToken()?.refresh_token);
        this._saveServer(server);
    }

    static async _rpc(endpoint) {
        const accessToken = await this.getAccessToken();
        if (!accessToken) throw new Error('Dropbox is not connected');
        await FakeGoogleSheetsAuth.delay(100);
        if (!this._loadServer().access.has(accessToken)) throw this._error(401, 'expired_access_token');
        if (endpoint === 'users/get_current_account') return structuredClone(FAKE_DROPBOX_ACCOUNT);
        throw this._error(400, `FakeDropboxAuth: endpoint not implemented: ${endpoint}`);
    }

    static _issueAccessToken() {
        const accessToken = 'fake_dbx_access_' + crypto.randomUUID();
        const server = this._loadServer();
        server.access.add(accessToken);
        this._saveServer(server);
        return { access_token: accessToken, token_type: 'bearer', expires_in: FAKE_EXPIRES_IN };
    }

    static _error(status, message) {
        const error = new Error(`Dropbox (fake) request failed: ${message}`);
        error.status = status;
        return error;
    }
}
