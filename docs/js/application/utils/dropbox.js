// Dynamically select DropboxAuth based on environment
import { isLocalhost } from '../../google_sheets_services/FakeGoogle.js';
import { Requests } from '../../data_management/api.js';
let DropboxAuth;
if (isLocalhost()) {
    // eslint-disable-next-line no-undef
    ({ FakeDropboxAuth: DropboxAuth } = await import('../../dropbox_services/FakeDropbox.js'));
} else {
    // eslint-disable-next-line no-undef
    ({ DropboxAuth } = await import('../../dropbox_services/DropboxAuth.js'));
}

/**
 * Reactive Dropbox connection state
 */
export const dropboxState = Vue.reactive({
    isInitialized: false,
    isConnected: false,
    isConnecting: false,
    account: null,
    error: null
});

/**
 * Reads the Dropbox app key from the CACHE Preferences table (row ID "DropboxAppKey").
 */
async function getDropboxAppKey() {
    const prefs = await Requests.getPreferences();
    const appKey = prefs?.find(p => p.id === 'DropboxAppKey')?.value?.trim();
    if (!appKey) throw new Error('DropboxAppKey is missing from the CACHE Preferences table');
    return appKey;
}

export class Dropbox {
    /**
     * Restore a previous connection from localStorage, if any. No popup.
     */
    static async initialize() {
        try {
            if (DropboxAuth.hasStoredToken()) await Dropbox._loadAccount();
        } finally {
            dropboxState.isInitialized = true;
        }
    }

    /**
     * Must be called directly from a click handler (no await before it) so the popup is allowed.
     */
    static async connect() {
        dropboxState.isConnecting = true;
        dropboxState.error = null;
        try {
            await DropboxAuth.authenticate(getDropboxAppKey);
            console.log('[Dropbox] Authentication successful');
            await Dropbox._loadAccount();
            return dropboxState.isConnected;
        } catch (error) {
            console.error('[Dropbox] Authentication failed:', error);
            dropboxState.error = error.message;
            return false;
        } finally {
            dropboxState.isConnecting = false;
        }
    }

    static async disconnect() {
        const wasConnected = DropboxAuth.hasStoredToken();
        await DropboxAuth.logout();
        dropboxState.isConnected = false;
        dropboxState.account = null;
        if (wasConnected) console.log('[Dropbox] Disconnected');
    }

    static async _loadAccount() {
        try {
            const account = await DropboxAuth.getCurrentAccount();
            dropboxState.account = account;
            dropboxState.isConnected = true;
            console.log(`[Dropbox] Connected as ${account.name?.display_name} <${account.email}>`, account);
        } catch (error) {
            console.error('[Dropbox] Failed to load account:', error);
            dropboxState.error = error.message;
            dropboxState.isConnected = DropboxAuth.hasStoredToken();
        }
    }
}
