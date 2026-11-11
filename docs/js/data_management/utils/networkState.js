/**
 * The connection to Google, as every layer sees it. No imports, so any layer may import it.
 *
 * Statuses (CONNECTION):
 *   online       requests are answered
 *   slow         answered, but slowly: the fastest of the last few answers took over SLOW_MS,
 *                one request has waited over STALLED_MS, or the browser reports a 2G connection
 *   unreachable  FAILURES_TO_UNREACHABLE requests in a row got no answer, though the browser says
 *                it is online (Wi-Fi up but no internet, a sign-in portal, a dropped VPN). A probe
 *                asks again every PROBE_MS, when the tab shows and on checkConnection().
 *   offline      the browser says it has no network
 * isOffline is true while unreachable or offline: nothing can be fetched, so caches keep what they
 * hold and background work waits (caching.js, reactiveStores.js). isSlow is true while slow.
 *
 * The Sheets service reports every request attempt (trackRequest); services.js sets the probe.
 * The application mirrors the state for the UI (auth.js) and listens with onConnectionChange.
 */
export const CONNECTION = Object.freeze({
    ONLINE: 'online',
    SLOW: 'slow',
    UNREACHABLE: 'unreachable',
    OFFLINE: 'offline'
});

const SLOW_MS = 4000;
const SAMPLES = 5;               // answers kept for the slow test
const MIN_SAMPLES = 3;           // fewer than this never count as slow
const STALLED_MS = 15000;
const FAILURES_TO_UNREACHABLE = 2;
const PROBE_MS = 15000;
const CONNECTED_RETRY_MS = 10000;

export const networkState = {
    status: CONNECTION.ONLINE,
    isOffline: false,
    isSlow: false,
    reconnecting: false,         // a probe is out while unreachable
    noAnswers: 0                 // requests that got no answer so far: the cache skips results
                                 // computed while this moved (caching.js)
};

let browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
let unreachable = false;
let failures = 0;
let durations = [];
const inFlight = new Map();      // request id → start time
let nextId = 0;
let stallTimer = null;
let probeTimer = null;
let probe = null;
const listeners = new Set();

function reportsTwoG() {
    const type = typeof navigator !== 'undefined' ? navigator.connection?.effectiveType : null;
    return type === '2g' || type === 'slow-2g';
}

function update() {
    const now = Date.now();
    const stalled = [...inFlight.values()].some(start => now - start >= STALLED_MS);
    const measuredSlow = durations.length >= MIN_SAMPLES && Math.min(...durations) > SLOW_MS;
    const status = browserOffline ? CONNECTION.OFFLINE
        : unreachable ? CONNECTION.UNREACHABLE
        : (stalled || measuredSlow || reportsTwoG()) ? CONNECTION.SLOW
        : CONNECTION.ONLINE;
    scheduleProbe();
    if (status === networkState.status) return;
    const wasOffline = networkState.isOffline;
    networkState.status = status;
    networkState.isOffline = status === CONNECTION.OFFLINE || status === CONNECTION.UNREACHABLE;
    networkState.isSlow = status === CONNECTION.SLOW;
    notify({ reconnected: wasOffline && !networkState.isOffline });
}

function notify(change = { reconnected: false }) {
    for (const fn of [...listeners]) {
        try { fn(networkState, change); } catch (err) { console.error('[connection] Listener failed:', err); }
    }
}

// While requests are out, look for one that has stalled
function watchStalls() {
    if (inFlight.size && !stallTimer) stallTimer = setInterval(update, 1000);
    if (!inFlight.size && stallTimer) { clearInterval(stallTimer); stallTimer = null; }
}

function scheduleProbe() {
    const wanted = unreachable && !browserOffline && !!probe;
    if (wanted && !probeTimer) probeTimer = setTimeout(() => { probeTimer = null; checkConnection(); }, PROBE_MS);
    if (!wanted && probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
}

/**
 * Report one request attempt: call at its start; call the returned function with 'answered'
 * (any HTTP answer, even an error) or 'no-answer' (network failure or timeout) when it ends.
 * @param {{sample?: boolean}} [options] - sample: false leaves the duration out of the slow test
 *   (an upload, whose time grows with its size)
 * @returns {(outcome: 'answered'|'no-answer') => void}
 */
export function trackRequest({ sample = true } = {}) {
    const id = ++nextId;
    const start = Date.now();
    inFlight.set(id, start);
    watchStalls();
    return (outcome) => {
        if (!inFlight.delete(id)) return;
        if (outcome === 'no-answer') {
            networkState.noAnswers++;
            failures++;
            if (failures >= FAILURES_TO_UNREACHABLE) unreachable = true;
        } else {
            failures = 0;
            unreachable = false;
            if (sample) durations = [...durations, Date.now() - start].slice(-SAMPLES);
        }
        watchStalls();
        update();
    };
}

/** Set the probe: resolves when Google answers, rejects when it doesn't (services.js). */
export function setConnectionProbe(fn) {
    probe = fn;
    update();
}

/** Ask Google now whether it can be reached (the banner's Try again, the probe timer). */
export async function checkConnection() {
    if (!probe || browserOffline || networkState.reconnecting) return;
    networkState.reconnecting = true;
    notify();
    const done = trackRequest();
    try {
        await probe();
        done('answered');
    } catch {
        done('no-answer');
    } finally {
        networkState.reconnecting = false;
        notify();
    }
}

/**
 * Listen for changes: fn(networkState, { reconnected }), where reconnected is true when
 * requests can go out again after an outage.
 * @returns {() => void} stops listening
 */
export function onConnectionChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/**
 * Run fn once requests can go out: on reconnecting while offline or unreachable, otherwise after
 * a short wait (a single failure that didn't mark Google unreachable).
 * @returns {() => void} cancels
 */
export function whenConnected(fn) {
    if (!networkState.isOffline) {
        const timer = setTimeout(fn, CONNECTED_RETRY_MS);
        return () => clearTimeout(timer);
    }
    const stop = onConnectionChange((state, { reconnected }) => {
        if (!reconnected) return;
        stop();
        fn();
    });
    return stop;
}

/** Tests: forget every measurement and report online. */
export function resetConnection() {
    browserOffline = false;
    unreachable = false;
    failures = 0;
    durations = [];
    inFlight.clear();
    watchStalls();
    update();
}

if (typeof window !== 'undefined') {
    networkState.status = browserOffline ? CONNECTION.OFFLINE : CONNECTION.ONLINE;
    networkState.isOffline = browserOffline;
    window.addEventListener('offline', () => {
        browserOffline = true;
        update();
    });
    window.addEventListener('online', () => {
        browserOffline = false;
        // Not known to answer until the probe says so
        if (probe) unreachable = true;
        update();
        checkConnection();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && unreachable) checkConnection();
    });
    navigator.connection?.addEventListener?.('change', update);
}
