/**
 * What the sign-in session and the code around it share: the session statuses and the one test
 * of what kind of failure a Google API call ended in. Pure: no imports, no state.
 */

/** Where the sign-in session stands (GoogleSheetsAuth.state.status) */
export const AUTH_STATUS = Object.freeze({
    SIGNED_OUT: 'signed-out',  // nobody is signed in on this page
    ACTIVE: 'active',          // a valid token
    EXPIRING: 'expiring',      // without the sign-in service: the token ends within minutes
    NEEDS_USER: 'needs-user'   // signed in, but renewing needs the user to click
});

/**
 * The kind of failure a Google API call (or the session) ended in.
 * - 'auth': the token is missing, expired or revoked. Renewing or signing in again fixes it.
 * - 'permission': the account may not do this (a sheet not shared, a scope not granted).
 * - 'quota': rate limit or quota. Waiting fixes it.
 * - 'network': no response at all.
 * - 'other'
 * @param {*} err
 * @returns {'auth'|'permission'|'quota'|'network'|'other'}
 */
export function classifyError(err) {
    if (!err) return 'other';
    if (err.code === 'AUTH_REQUIRED') return 'auth';
    if (err instanceof TypeError && !err.status && !err.result) return 'network';
    const status = err.status ?? err.result?.error?.code;
    const apiStatus = err.result?.error?.status;
    const message = String(err.result?.error?.message || '').toLowerCase();
    if (status === 401 || apiStatus === 'UNAUTHENTICATED') return 'auth';
    if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED' || message.includes('rate limit') || message.includes('quota')) return 'quota';
    if (status === 403 || apiStatus === 'PERMISSION_DENIED') return 'permission';
    return 'other';
}

/** Whether signing in again (or renewing) would fix this failure */
export function isAuthError(err) {
    return classifyError(err) === 'auth';
}

/** The error a request gets when there is no token and none can be had without the user */
export function authRequiredError(message = 'Sign in to continue.') {
    const err = new Error(message);
    err.code = 'AUTH_REQUIRED';
    err.status = 401;
    err.result = { error: { code: 401, status: 'UNAUTHENTICATED', message } };
    return err;
}
