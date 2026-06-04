# Authentication & Token Refresh Audit - Findings

## Executive Summary

The authentication system has **multiple layers of auth checking and refresh mechanisms** that can interact in confusing ways. While there are protections against concurrent token refreshes, there are **race conditions with the session expired modal**, and **automatic reauthentication can happen silently in ways that may surprise users**.

---

## Architecture Overview

### Authentication Layers

1. **GoogleSheetsAuth** (`google_sheets_services/GoogleSheetsAuth.js`)
   - Low-level token management
   - Handles Google OAuth flow
   - Stores tokens in localStorage

2. **Auth wrapper** (`application/utils/auth.js`)
   - Application-level auth state
   - Manages auth UI (modals)
   - Coordinates with reactive stores

3. **API Error Handling** (`google_sheets_services/GoogleSheetsData.js`)
   - Automatic retry on 401 errors
   - Triggers reauthentication during API calls

4. **Proactive Refresh System** (`application/utils/auth.js`)
   - Timer-based token renewal
   - Triggers 5 minutes before expiry

---

## Key Components

### 1. Token Refresh Deduplication ✅ WORKING

**Location:** `GoogleSheetsAuth.silentRefresh()`

```javascript
static _silentRefreshPromise = null;

static async silentRefresh() {
    // Deduplicate concurrent calls — return the same in-flight promise to all callers
    if (this._silentRefreshPromise) {
        return this._silentRefreshPromise;
    }
    // ... rest of refresh logic
}
```

**Status:** ✅ **GOOD** - This prevents multiple simultaneous token refresh attempts. All concurrent callers get the same promise and wait for the same result.

---

### 2. Auth Prompt Deduplication ⚠️ RACE CONDITION RISK

**Location:** `Auth.checkAuthWithPrompt()`

```javascript
let authPromptShowing = false;

static async checkAuthWithPrompt(options = {}) {
    if (authPromptShowing) {
        console.log(`[Auth] Auth prompt already showing, returning false`);
        return false;
    }
    authPromptShowing = true;
    // ... show modal and handle auth
}
```

**Issues:**

- ⚠️ **Race condition**: Multiple near-simultaneous calls can check `authPromptShowing` before any sets it to `true`
- ⚠️ **Not atomic**: JavaScript is single-threaded but async operations can interleave
- ⚠️ **Edge case**: If two API calls fail auth at the same microsecond, both might pass the check

**Impact:** Low probability but possible duplicate modals

**Recommendation:** Use a Promise-based approach like `silentRefresh`:

```javascript
static _authPromptPromise = null;

static async checkAuthWithPrompt(options = {}) {
    if (this._authPromptPromise) {
        return this._authPromptPromise;
    }

    this._authPromptPromise = this._showAuthPromptInternal(options)
        .finally(() => { this._authPromptPromise = null; });

    return this._authPromptPromise;
}
```

---

### 3. Automatic 401 Reauthentication ⚠️ CONFUSING

**Location:** `GoogleSheetsService.withExponentialBackoff()`

```javascript
// If 401 Unauthorized, try to re-authenticate once and retry
if (
    (err && (err.status === 401 || (err.result && err.result.error && err.result.error.code === 401)))
    && attempt === 0
) {
    try {
        await GoogleSheetsAuth.authenticate(false);
        attempt++;
        continue;
    } catch (reauthErr) {
        throw reauthErr;
    }
}
```

**Issues:**

- ⚠️ **Silent popup**: This calls `GoogleSheetsAuth.authenticate()` which opens the Google login popup **without any warning modal**
- ⚠️ **No user context**: User doesn't know why a popup appeared
- ⚠️ **Bypasses checkAuthWithPrompt**: This bypasses the normal "Session Expired" modal flow
- ⚠️ **Popup blocker risk**: If not in a user gesture context, popup may be blocked and fail silently

**When this triggers:**

- Any API call (read or write) that gets a 401 from Google
- Token expired but the app didn't detect it proactively
- Token was revoked externally

**User Experience:**

1. User is working normally
2. Token expires
3. User clicks "Save" or loads data
4. **Popup suddenly appears** (no warning)
5. User may be confused - "Why am I seeing Google login?"

**Recommendation:**

- Remove automatic reauthentication from `withExponentialBackoff`
- Let 401 errors bubble up to reactive stores
- Reactive stores should catch auth errors and call `Auth.checkAuthWithPrompt()` with context

---

### 4. Multiple Reauthentication Paths 🔄 CONFUSING

**Current paths to reauthentication:**

#### Path 1: Proactive Refresh (GOOD)

1. Timer fires 5 minutes before expiry
2. User interacts (click/keydown)
3. `silentRefresh()` called
4. Token renewed silently (no popup if Google session active)

#### Path 2: CheckAuthWithPrompt (GOOD)

1. App code explicitly checks auth (navigation, save, etc.)
2. Auth expired → Modal shown: "Session Expired"
3. User clicks "Renew Session"
4. Attempts silent refresh → falls back to full login if needed

#### Path 3: Auto-401-Reauth (CONFUSING)

1. API call fails with 401
2. **No modal shown**
3. **Popup immediately opened**
4. User confused

#### Path 4: Auto-save (SILENT)

1. Auto-save timer fires (every 2 minutes)
2. Checks auth silently
3. If expired: skips save, **no modal**
4. User not notified

**Issues:**

- ⚠️ User may not understand which path triggered auth
- ⚠️ Inconsistent UX (sometimes modal, sometimes direct popup)
- ⚠️ Path 3 can show popup when auth was actually fine (transient 401)

---

### 5. Auth Check Methods - Confusion Matrix

| Method                             | Shows Modal? | Opens Popup? | When Used                       |
| ---------------------------------- | ------------ | ------------ | ------------------------------- |
| `GoogleSheetsAuth.checkAuth()`     | ❌ No        | ❌ No        | Silent check only               |
| `GoogleSheetsAuth.silentRefresh()` | ❌ No        | ⚠️ Maybe\*   | Background refresh              |
| `GoogleSheetsAuth.authenticate()`  | ❌ No        | ✅ Yes       | Direct login                    |
| `Auth.checkAuth()`                 | ❌ No        | ❌ No        | Wrapper around GoogleSheetsAuth |
| `Auth.checkAuthWithPrompt()`       | ✅ Yes       | ⚠️ Maybe\*\* | Manual auth check               |
| `withExponentialBackoff` (401)     | ❌ No        | ✅ Yes       | Auto-retry                      |

\* silentRefresh opens popup only if Google session expired  
\*\* checkAuthWithPrompt shows modal first, then attempts silent refresh, then full login

**Problem:** Too many overlapping mechanisms

---

## Possible Weird States

### Scenario 1: Duplicate Modals (LOW PROBABILITY)

**Trigger:** Two API calls fail auth at exactly the same time

**Flow:**

```
API Call 1 → fails auth → checkAuthWithPrompt() → check authPromptShowing=false
API Call 2 → fails auth → checkAuthWithPrompt() → check authPromptShowing=false (race)
Call 1 → set authPromptShowing=true → show modal
Call 2 → set authPromptShowing=true → show modal (DUPLICATE)
```

**Result:** Two "Session Expired" modals on screen

---

### Scenario 2: Modal During Valid Session

**Trigger:** Transient 401 error from Google (network glitch, server hiccup)

**Flow:**

```
User authenticated with valid token
API call → 401 (transient error)
withExponentialBackoff → authenticate() → popup opens
User confused: "I'm already logged in!"
```

**Result:** Confusing popup when auth was fine

---

### Scenario 3: Popup Without Warning

**Trigger:** Token expires, user triggers save

**Flow:**

```
User working offline/slowly
Token expires silently
User clicks "Save"
API call → 401
withExponentialBackoff → authenticate() (no modal) → popup
User: "What just happened?"
```

**Result:** Unexpected popup, no context

---

### Scenario 4: Proactive Refresh Fires During Modal

**Trigger:** Proactive timer expires while modal is showing

**Flow:**

```
Auth expires → checkAuthWithPrompt() → modal shown: "Session Expired"
(User reading modal)
5 seconds later → proactive refresh timer → user clicks → silentRefresh()
Modal still visible but refresh happening in background
silentRefresh succeeds → modal becomes stale
User clicks "Renew Session" → auth already done → confusing state
```

**Result:** Modal shows outdated state

---

### Scenario 5: Auto-save Silent Failure

**Trigger:** Token expires between auto-saves

**Flow:**

```
Auto-save timer (2 min) → check auth → OK → saves
60 seconds later → token expires
Auto-save timer → check auth → FAIL → skip save silently
User has no idea their work isn't being auto-saved
User navigates away → "Session Expired" modal → data loss risk
```

**Result:** User thinks auto-save is working but it's not

---

## Unexpected Modal Scenarios

### When Modal Can Appear Unexpectedly:

1. **Navigation** - User clicks a nav link, not authenticated
   - Modal: "Please log in to view content"
   - **Unexpected?** ⚠️ Maybe - user might expect to see the page first

2. **Background Data Reload** - Data invalidation triggers reload while user idle
   - If token expired → no modal (reactive store error state)
   - **Unexpected?** ⚠️ Maybe - silent failure

3. **Proactive Refresh Failure** - Silent refresh fails, then user does any action
   - Modal: "Session Expired"
   - **Unexpected?** ✅ No - appropriate

4. **Multiple API Calls** - Save + parallel data fetches all fail auth
   - Multiple calls to checkAuthWithPrompt
   - authPromptShowing flag should prevent duplicates (but race risk)
   - **Unexpected?** ⚠️ Risk of duplicate modals

---

## Token Refresh Race Conditions

### Can Two Subscribers Attempt Token Refresh Simultaneously?

**Answer:** ✅ **PROTECTED** (mostly)

The `_silentRefreshPromise` deduplication ensures that only one actual token refresh happens:

```javascript
// Call 1
await GoogleSheetsAuth.silentRefresh(); // starts refresh, stores promise
// Call 2 (simultaneous)
await GoogleSheetsAuth.silentRefresh(); // returns existing promise, waits
```

**But:** The 401 auto-reauth path calls `GoogleSheetsAuth.authenticate()` directly, which does NOT have deduplication:

```javascript
// withExponentialBackoff on 401
await GoogleSheetsAuth.authenticate(false); // No deduplication!
```

**Potential issue:**

```
API Call 1 → 401 → authenticate() → opens popup 1
API Call 2 → 401 (simultaneous) → authenticate() → opens popup 2
Result: Two Google login popups
```

**Recommendation:** Add deduplication to `authenticate()` as well:

```javascript
static _authenticatePromise = null;

static async authenticate() {
    if (this._authenticatePromise) {
        return this._authenticatePromise;
    }

    this._authenticatePromise = this._authenticateInternal()
        .finally(() => { this._authenticatePromise = null; });

    return this._authenticatePromise;
}
```

---

## Recommendations

### High Priority

1. **Remove auto-401-reauth from withExponentialBackoff**
   - Let 401 errors bubble up
   - Handle at reactive store level with `checkAuthWithPrompt()`
   - Provides consistent UX with modal warning

2. **Add deduplication to authenticate()**
   - Use promise-based approach like `silentRefresh()`
   - Prevents duplicate popups

3. **Fix authPromptShowing race condition**
   - Use `_authPromptPromise` pattern
   - Make it truly atomic

### Medium Priority

4. **Cancel proactive refresh when modal showing**
   - If `checkAuthWithPrompt()` is active, don't run proactive refresh
   - Prevents confusing state

5. **Add auto-save failure notification**
   - Show subtle indicator when auto-save skipped due to expired auth
   - Don't auto-open modal, but warn user

6. **Add context to navigation auth check**
   - Navigation currently shows generic message
   - Could be more specific: "Log in to view [Inventory/Packlist/etc]"

### Low Priority

7. **Consolidate auth check methods**
   - Consider reducing the number of different auth methods
   - Current complexity makes maintenance difficult

8. **Add telemetry**
   - Log which auth path triggered (for debugging)
   - Track how often each path is used

---

## Testing Scenarios

### Manual Testing Checklist

- [ ] Let token expire naturally, trigger navigation → modal should show
- [ ] Let token expire, trigger save → modal should show (not direct popup)
- [ ] Trigger two simultaneous saves after expiry → should show single modal
- [ ] Let token expire during modal interaction → should not confuse state
- [ ] Close modal without responding → should logout
- [ ] Revoke token externally, trigger API call → should show modal
- [ ] Work offline, trigger save → should show appropriate error
- [ ] Let auto-save run with expired token → should silently skip (check logs)
- [ ] Proactive refresh at 55min → should silently renew
- [ ] Proactive refresh fails → next action should show modal

---

## Summary

**What can attempt reauthentication:**

1. ✅ Proactive refresh timer (silent)
2. ✅ `checkAuthWithPrompt()` (with modal)
3. ⚠️ `withExponentialBackoff` on 401 (direct popup, confusing)
4. ❌ Auto-save (only checks, doesn't reauth)

**Methods to catch session expiry:**

1. ✅ `checkAuth()` - silent check
2. ✅ Token timestamp check (proactive timer)
3. ✅ 401 error from API
4. ✅ Explicit `checkAuthWithPrompt()` calls

**Can show weird states:**

- ⚠️ Yes - duplicate modals possible (low probability race)
- ⚠️ Yes - modal during valid session (transient 401)
- ⚠️ Yes - unexpected popup without warning (401 auto-reauth)
- ⚠️ Yes - stale modal if proactive refresh succeeds during modal

**Can two subscribers refresh simultaneously:**

- ✅ silentRefresh: No (protected)
- ⚠️ authenticate: Yes (not protected)

**Can modal show unexpectedly:**

- ⚠️ Yes - navigation can trigger modal when user doesn't expect it
- ⚠️ Yes - auto-reauth bypasses modal and shows popup instead
- ⚠️ Yes - race conditions can cause duplicate modals
