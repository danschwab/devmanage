/**
 * TopShelf Live Inventory: the sign-in service (an OAuth token broker).
 *
 * The app signs in once through Google (one redirect); this script exchanges the code for a
 * refresh token, keeps it, and hands the app new one-hour access tokens when it asks, so the app
 * never opens a window to renew. Setup and security notes: docs/notes/auth-audit-findings.md,
 * "Sign-in service setup".
 *
 * Deploy as a web app: Execute as "Me", Who has access "Anyone". The browser can only reach the
 * script anonymously; every request proves itself with a session or a fresh Google code.
 *
 * Script Properties you set (Project Settings → Script Properties):
 *   CLIENT_ID       the app's OAuth client ID (the same as the app's CLIENT_ID)
 *   CLIENT_SECRET   that client's secret. It lives only here: never in the app or the repo.
 *   ALLOWED_DOMAIN  the company's Google Workspace domain, e.g. topshelfexhibits.com
 *                   (several: comma-separated)
 *   IDLE_DAYS       optional, default 30: a session not used for this many days ends
 * Script Properties the script writes:
 *   SESSION_HMAC_KEY  a random key, made on first use
 *   user:<email>      { rt, updated }: the account's refresh token, shared by its sessions
 *   session:<id>      { email, cur, prev, rotatedAt, created, lastUsed }: hashes of the session
 *                     secret, never the secret itself
 *
 * A session is "<id>.<secret>". Every renewal replaces the secret (the app stores the new one).
 * The previous secret still works for two minutes, for an answer lost on the way; after that it
 * means a copy is in someone else's hands, and the session ends.
 */

var GRACE_MS = 2 * 60 * 1000;
var TOKEN_URL = 'https://oauth2.googleapis.com/token';
var REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
var USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

// ── Web app ───────────────────────────────────────────────────────────────────

function doGet() {
  return ContentService.createTextOutput('TopShelf sign-in service is running.');
}

/** The app POSTs plain-text JSON: { action: 'exchange' | 'refresh' | 'signout', ... } */
function doPost(e) {
  var request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: 'BAD_REQUEST' });
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (request.action === 'exchange') return reply_(exchange_(request));
    if (request.action === 'refresh') return reply_(refresh_(request));
    if (request.action === 'signout') return reply_(signOut_(request));
    return reply_({ ok: false, error: 'BAD_REQUEST' });
  } catch (err) {
    // Never log tokens or secrets: editors can read the logs
    console.error('Sign-in service failure: ' + (err && err.message));
    return reply_({ ok: false, error: 'SERVER_ERROR' });
  } finally {
    lock.releaseLock();
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

/** A Google sign-in code (with its PKCE verifier) → a new session */
function exchange_(request) {
  if (!request.code || !request.redirectUri) return { ok: false, error: 'BAD_REQUEST' };
  var tokens = googleToken_({
    grant_type: 'authorization_code',
    code: request.code,
    redirect_uri: request.redirectUri,
    code_verifier: request.verifier
  });
  if (tokens.error) return { ok: false, error: 'CODE_REJECTED', message: 'Google refused the sign-in. Please sign in again.' };

  var user = userInfo_(tokens.access_token);
  var email = user && user.email_verified && user.email ? String(user.email).toLowerCase() : null;
  if (!email || !isAllowed_(email)) {
    revoke_(tokens.refresh_token || tokens.access_token);
    return { ok: false, error: 'ACCOUNT_NOT_ALLOWED', message: 'Sign in with your company Google account.' };
  }

  var props = PropertiesService.getScriptProperties();
  if (tokens.refresh_token) {
    props.setProperty('user:' + email, JSON.stringify({ rt: tokens.refresh_token, updated: Date.now() }));
  } else if (!props.getProperty('user:' + email)) {
    // Google gives a refresh token only with consent: the app asks again with prompt=consent
    return { ok: false, error: 'NO_REFRESH_TOKEN' };
  }
  cleanUp_(props);

  var id = Utilities.getUuid().replace(/-/g, '');
  var secret = randomSecret_();
  var now = Date.now();
  props.setProperty('session:' + id, JSON.stringify({ email: email, cur: hash_(secret), prev: null, rotatedAt: 0, created: now, lastUsed: now }));
  return answer_(id + '.' + secret, email, tokens);
}

/** A session → a new access token, and the session's next secret */
function refresh_(request) {
  var parsed = parseSession_(request.session);
  var props = PropertiesService.getScriptProperties();
  var key = parsed && 'session:' + parsed.id;
  var record = key && readJson_(props, key);
  if (!record) return { ok: false, error: 'SESSION_ENDED' };

  var now = Date.now();
  if (now - record.lastUsed > idleMs_()) {
    props.deleteProperty(key);
    return { ok: false, error: 'SESSION_ENDED' };
  }

  var hash = hash_(parsed.secret);
  var next;
  if (hash === record.cur) {
    next = nextSecret_(props, parsed.secret);
  } else if (hash === record.prev && now - record.rotatedAt < GRACE_MS) {
    // The answer to the last renewal was lost: the same next secret again
    next = nextSecret_(props, parsed.secret);
  } else {
    props.deleteProperty(key);
    console.warn('An old session secret was used after the grace period; the session for ' + record.email + ' ended.');
    return { ok: false, error: 'SESSION_REUSED' };
  }

  var user = readJson_(props, 'user:' + record.email);
  if (!user) {
    props.deleteProperty(key);
    return { ok: false, error: 'GRANT_REVOKED' };
  }
  var tokens = googleToken_({ grant_type: 'refresh_token', refresh_token: user.rt });
  if (tokens.error === 'invalid_grant') {
    // The user or an admin removed the app's access: every session of this account ends
    endAccount_(props, record.email, false);
    return { ok: false, error: 'GRANT_REVOKED' };
  }
  if (tokens.error) throw new Error('Google refused the refresh: ' + tokens.error);

  if (hash === record.cur) {
    record.prev = record.cur;
    record.cur = hash_(next);
    record.rotatedAt = now;
  }
  record.lastUsed = now;
  props.setProperty(key, JSON.stringify(record));
  return answer_(parsed.id + '.' + next, record.email, tokens);
}

/**
 * Ends this session only. The account's other devices stay signed in, so the Google grant is
 * not revoked (endSessionsFor does that).
 */
function signOut_(request) {
  var parsed = parseSession_(request.session);
  var props = PropertiesService.getScriptProperties();
  var key = parsed && 'session:' + parsed.id;
  var record = key && readJson_(props, key);
  if (record) {
    var hash = hash_(parsed.secret);
    if (hash === record.cur || hash === record.prev) props.deleteProperty(key);
  }
  return { ok: true };
}

// ── Admin: run these from the editor (Run ▸ function) ────────────────────────

/** Logs every session: account, started, last used. No secrets. */
function listSessions() {
  var all = PropertiesService.getScriptProperties().getProperties();
  Object.keys(all).filter(function (k) { return k.indexOf('session:') === 0; }).forEach(function (k) {
    var r = JSON.parse(all[k]);
    console.log(r.email + '  started ' + new Date(r.created).toISOString() + '  last used ' + new Date(r.lastUsed).toISOString());
  });
}

/** Signs an account out everywhere and revokes the app's Google access for it. Edit the email, then run. */
function endSessionsFor() {
  var email = 'someone@example.com';
  endAccount_(PropertiesService.getScriptProperties(), email.toLowerCase(), true);
  console.log('Ended every session of ' + email);
}

/** Emergency: signs everyone out and revokes every account's grant */
function endAllSessions() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).filter(function (k) { return k.indexOf('user:') === 0; }).forEach(function (k) {
    endAccount_(props, k.slice(5), true);
  });
  Object.keys(all).filter(function (k) { return k.indexOf('session:') === 0; }).forEach(function (k) { props.deleteProperty(k); });
  console.log('Ended every session');
}

/** Run once: removes idle sessions every night */
function installCleanUpTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCleanUp') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyCleanUp').timeBased().everyDays(1).atHour(3).create();
}

function dailyCleanUp() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    cleanUp_(PropertiesService.getScriptProperties());
  } finally {
    lock.releaseLock();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function config_(name) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('Script Property ' + name + ' is not set');
  return value;
}

function isAllowed_(email) {
  return config_('ALLOWED_DOMAIN').split(',').some(function (domain) {
    return email.slice(-(domain.trim().length + 1)) === '@' + domain.trim().toLowerCase();
  });
}

function idleMs_() {
  var days = Number(PropertiesService.getScriptProperties().getProperty('IDLE_DAYS')) || 30;
  return days * 24 * 60 * 60 * 1000;
}

/** POST to Google's token endpoint with the client secret. 4xx: { error }. 5xx throws (the app retries). */
function googleToken_(params) {
  var payload = { client_id: config_('CLIENT_ID'), client_secret: config_('CLIENT_SECRET') };
  Object.keys(params).forEach(function (k) { if (params[k]) payload[k] = params[k]; });
  var response = UrlFetchApp.fetch(TOKEN_URL, { method: 'post', payload: payload, muteHttpExceptions: true });
  if (response.getResponseCode() >= 500) throw new Error('Google token endpoint answered ' + response.getResponseCode());
  var body = {};
  try { body = JSON.parse(response.getContentText() || '{}'); } catch (err) { body = { error: 'unreadable' }; }
  if (response.getResponseCode() >= 400 && !body.error) body.error = 'http_' + response.getResponseCode();
  return body;
}

function userInfo_(accessToken) {
  var response = UrlFetchApp.fetch(USERINFO_URL, { headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) return null;
  return JSON.parse(response.getContentText());
}

function revoke_(token) {
  if (!token) return;
  UrlFetchApp.fetch(REVOKE_URL, { method: 'post', payload: { token: token }, muteHttpExceptions: true });
}

function answer_(session, email, tokens) {
  return { ok: true, session: session, accessToken: tokens.access_token, expiresIn: tokens.expires_in, scope: tokens.scope, email: email };
}

function parseSession_(session) {
  var match = /^([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(String(session || ''));
  return match ? { id: match[1], secret: match[2] } : null;
}

function readJson_(props, key) {
  var value = props.getProperty(key);
  return value ? JSON.parse(value) : null;
}

function randomSecret_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function hash_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
}

function toHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** The secret that follows `secret`: the same answer every time, so a lost answer can be repeated */
function nextSecret_(props, secret) {
  var key = props.getProperty('SESSION_HMAC_KEY');
  if (!key) {
    key = randomSecret_();
    props.setProperty('SESSION_HMAC_KEY', key);
  }
  return toHex_(Utilities.computeHmacSha256Signature(secret, key)).slice(0, 64);
}

/** Deletes an account's sessions and refresh token; with revoke, also removes its Google grant */
function endAccount_(props, email, revoke) {
  var user = readJson_(props, 'user:' + email);
  if (revoke && user) revoke_(user.rt);
  props.deleteProperty('user:' + email);
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('session:') === 0 && JSON.parse(all[k]).email === email) props.deleteProperty(k);
  });
}

function cleanUp_(props) {
  var all = props.getProperties();
  var cutoff = Date.now() - idleMs_();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('session:') === 0 && JSON.parse(all[k]).lastUsed < cutoff) props.deleteProperty(k);
  });
}
