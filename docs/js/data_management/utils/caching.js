import { networkState } from './networkState.js';

/**
 * Cache Management System with CPU-Aware Operations
 * 
 * This system manages caching with automatic TTL expiry, dependency tracking,
 * and CPU-optimized cleanup to prevent UI blocking.
 * 
 * Performance Optimizations:
 * - Cleanup runs during idle time via requestIdleCallback (lowest priority)
 * - Large invalidation cascades (>20 keys) process in batches with yields
 * - Batches of 50 deletions at a time to prevent long synchronous operations
 * - Respects network state (preserves cache while offline)
 * 
 * Priority Levels:
 * - Explicit invalidations (saves): Immediate, synchronous (correctness required)
 * - Small prefix invalidations (<20 keys): Synchronous
 * - Large prefix invalidations (>=20 keys): Batched with yields
 * - Expired entry cleanup: Idle-time async batching (lowest priority)
 */

/**
 * Default cache expiration in milliseconds.
 * Reduced from 20 min to 4 min to limit stale memory accumulation.
 * Dependency chains are preserved through expiry — only the cached value
 * is dropped, so invalidation still fires correctly after a refill.
 */
const DEFAULT_CACHE_EXPIRATION_MS = 4 * 60 * 1000;

/**
 * Lightweight event bus for cache invalidation notifications
 */
class CacheInvalidationBus {
    static listeners = new Map();
    
    /**
     * Subscribe to cache invalidation events for specific patterns
     * @param {string} pattern - Pattern to match (e.g., 'api:getPackList' or 'api:extractItemNumber')
     * @param {Function} callback - Function to call with {key, namespace, methodName, args}
     */
    static on(pattern, callback) {
        if (!CacheInvalidationBus.listeners.has(pattern)) {
            CacheInvalidationBus.listeners.set(pattern, []);
        }
        CacheInvalidationBus.listeners.get(pattern).push(callback);
    }

    static off(pattern, callback) {
        const callbacks = CacheInvalidationBus.listeners.get(pattern);
        if (!callbacks) return;
        const idx = callbacks.indexOf(callback);
        if (idx !== -1) callbacks.splice(idx, 1);
    }
    
    /**
     * Emit cache invalidation event
     * @param {string} key - Full cache key that was invalidated
     * @param {string} namespace - Namespace (e.g., 'api')
     * @param {string} methodName - Method name (e.g., 'getPackList')
     * @param {string} argsString - Serialized arguments
     */
    static emit(key, namespace, methodName, argsString) {
        const eventData = { key, namespace, methodName, argsString };
        
        // Emit to exact pattern matches: 'namespace:methodName'
        const pattern = `${namespace}:${methodName}`;
        const callbacks = CacheInvalidationBus.listeners.get(pattern) || [];
        
        if (callbacks.length > 0) {
            callbacks.forEach(cb => cb(eventData));
        }
        
        // Also emit to wildcard namespace listeners
        const wildcardCallbacks = CacheInvalidationBus.listeners.get(namespace) || [];
        if (wildcardCallbacks.length > 0) {
            wildcardCallbacks.forEach(cb => cb(eventData));
        }
    }
}

class CacheManager {
    static cache = new Map();
    static dependencies = new Map();
    static pendingCalls = new Map(); // Maps cache keys to pending promises to prevent duplicate concurrent calls
    static CACHE_MISS = Symbol('CACHE_MISS');
    static _timestampWriter = null;
    
    /**
     * Gets a value from cache with expiration check
     * @param {string} key - Cache key
     * @returns {*} - Cached value, or CacheManager.CACHE_MISS if not found/expired
     */
    static get(key) {
        const entry = CacheManager.cache.get(key);
        if (!entry) {
            return CacheManager.CACHE_MISS;
        }
        
        // While offline, serve stale-but-valid cache entries regardless of expiry.
        // The freeze prevents reloads that would fail anyway, and data is recovered
        // on connectivity restore via reloadErrorStores().
        if (networkState.isOffline) {
            return entry.value;
        }

        // Check expiration
        if (entry.expire && entry.expire < Date.now()) {
            // Silently remove the expired entry without firing the CacheInvalidationBus.
            // Calling invalidate() here would emit bus events that trigger reactive store
            // reloads — during auth transitions this causes cascading 403 failures.
            // Natural TTL expiry should return CACHE_MISS and let the next access re-populate;
            // only explicit mutation-driven invalidations (stampDataChange / invalidateCache)
            // should fire the bus so stores know actual data has changed.
            CacheManager.cache.delete(key);
            return CacheManager.CACHE_MISS;
        }
        
        return entry.value;
    }
    
    /**
     * Sets a value in cache with default timeout
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} expirationMs - Expiration time in milliseconds (defaults to DEFAULT_CACHE_EXPIRATION_MS)
     */
    static set(key, value, expirationMs = DEFAULT_CACHE_EXPIRATION_MS) {
        // Skip caching null, undefined, empty results, or booleans
        if (
            value === null ||
            value === undefined ||
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === 'object' && value !== null && Object.keys(value).length === 0) ||
            (typeof value === 'boolean')
        ) {
            return;
        }
        
        CacheManager.cache.set(key, {
            value,
            expire: expirationMs ? Date.now() + expirationMs : null,
            filled: Date.now()
        });
    }
    
    /**
     * Creates a dependency decorator that explicitly tracks function calls as dependencies
     * @param {string} callerKey - Cache key of the calling function
     * @returns {Function} - Decorator function
     */
    static createDependencyDecorator(callerKey) {
        return {
            /**
             * Calls a wrapped function and registers it as a dependency
             * @param {Function} wrappedFunction - The wrapped function to call
             * @param {...any} args - Arguments to pass to the function
             * @returns {Promise} - Function result
             */
            call: async (wrappedFunction, ...args) => {
                
                // Generate the cache key for the called function
                const calledKey = CacheManager.generateCacheKey(wrappedFunction._namespace, wrappedFunction._methodName, args);

                // Atomic check-and-set: if pending call exists, await it; otherwise create and store new promise
                let result;
                let promise = CacheManager.pendingCalls.get(calledKey);
                if (promise) {
                    result = await promise;
                } else {
                    // Execute the wrapped function
                    result = await wrappedFunction(...args);
                }

                
                if (calledKey) {
                    // Register the called function as a dependency of the caller
                    CacheManager.addDependency(callerKey, calledKey);
                }

                return result;
            }
        };
    }
    
    /**
     * Adds a dependency relationship between two cache entries
     * @param {string} dependentKey - The cache key that depends on another
     * @param {string} dependencyKey - The cache key that is depended upon
     */
    static addDependency(dependentKey, dependencyKey) {
        if (!CacheManager.dependencies.has(dependentKey)) {
            CacheManager.dependencies.set(dependentKey, new Set());
        }
        CacheManager.dependencies.get(dependentKey).add(dependencyKey);
    }
    
    /**
     * Invalidates a cache entry and all dependent entries.
     *
     * ═══════════════════════════════════════════════════════════════
     * CRITICAL — DO NOT REORDER THESE STEPS
     *
     * The invalidation sequence must be:
     *   1. Delete the cache entry
     *   2. Reverse-scan dependencies to find callers (dependents)
     *   3. Recursively invalidate each dependent (step 2–5 for each)
     *   4. Delete THIS key's own dependency record
     *   5. Emit the CacheInvalidationBus event (MUST be last)
     *
     * Step 4 (dependencies.delete) MUST come after step 3 so that the
     * recursive calls can still find and walk the full chain. Moving it
     * before step 3 would silently break the cascade for every caller.
     *
     * Step 5 (bus emit) MUST come last so that reactive store listeners
     * that fire synchronously on the event see a fully-cleared cache with
     * no stale entries for any part of the chain. Emitting earlier would
     * allow a listener to read a partially-valid cache.
     *
     * Dependency records are destroyed after each invalidation. They are
     * re-registered the next time the chain is executed (on reload). Any
     * code path that calls invalidate() but does NOT trigger a subsequent
     * reload MUST separately repopulate the cache (e.g., via apiCall())
     * to restore the dependency chain before the next external change
     * can be detected.
     * ═══════════════════════════════════════════════════════════════
     *
     * @param {string} key - Cache key to invalidate
     * @param {Set} invalidationStack - Set of keys currently being invalidated (to prevent recursion)
     */
    static invalidate(key, invalidationStack = new Set()) {
        // While offline, preserve cached data — nothing can be re-fetched to replace it.
        if (networkState.isOffline) return;

        // Prevent infinite recursion - if this key is already being invalidated, skip it
        if (invalidationStack.has(key)) {
            return;
        }
        
        // Add this key to the invalidation stack
        invalidationStack.add(key);
        
        // Remove the cache entry
        CacheManager.cache.delete(key);
        
        // Also clean up any pending calls for this key DO NOT CLEAR PENDING CALLS HERE
        //if (CacheManager.pendingCalls.has(key)) {
        //    CacheManager.pendingCalls.delete(key);
        //}
        
        // Find and invalidate all dependent entries
        const dependents = [];
        for (const [depKey, deps] of CacheManager.dependencies.entries()) {
            if (deps.has && deps.has(key)) {
                dependents.push(depKey);
            }
        }
        
        // Recursively invalidate dependents with the same invalidation stack
        for (const depKey of dependents) {
            CacheManager.invalidate(depKey, invalidationStack);
        }
        
        // Clean up dependency registration — MUST come after recursive invalidation above
        // so that the full chain is walked before any records are removed.
        CacheManager.dependencies.delete(key);
        
        
        // Emit invalidation event for reactive stores (only for 'api' namespace)
        // THIS MUST HAPPEN LAST — all cache entries and dependency records for the entire
        // chain must be cleared before any listener callback fires.
        // Extract namespace, methodName, and argsString from key
        // Key format: "namespace:methodName:argsString"
        // Note: argsString may contain colons (e.g., JSON with {"type":"value"})
        // So we need to split only on the first two colons
        const firstColonIndex = key.indexOf(':');
        const secondColonIndex = key.indexOf(':', firstColonIndex + 1);
        const namespace = key.substring(0, firstColonIndex);
        const methodName = key.substring(firstColonIndex + 1, secondColonIndex);
        const argsString = key.substring(secondColonIndex + 1);
        
        if (namespace === 'api') {
            CacheInvalidationBus.emit(key, namespace, methodName, argsString);
        }

        // Remove from invalidation stack when done
        invalidationStack.delete(key);
    }
    
    /**
     * Invalidates all cache entries that start with a given prefix.
     * For large sets of keys (>20), processes in batches with yields to prevent blocking.
     * @param {string} prefix - Cache key prefix to match
     */
    static invalidateByPrefix(prefix) {
        // Find all cache keys that start with the prefix
        const keysToInvalidate = [];
        for (const key of CacheManager.cache.keys()) {
            if (key.startsWith(prefix)) {
                keysToInvalidate.push(key);
            }
        }
        //console.log('[cache] invalidateByPrefix:', prefix, '| matched:', keysToInvalidate);
        
        // For small sets, invalidate synchronously (must complete before listeners fire)
        if (keysToInvalidate.length <= 20) {
            for (const key of keysToInvalidate) {
                CacheManager.invalidate(key);
            }
            return;
        }
        
        // For large sets, batch invalidations with yields to prevent UI freezing
        // This is safe because all matched keys are independent (same prefix = parallel invalidation)
        const BATCH_SIZE = 20;
        let processed = 0;
        
        const processBatch = () => {
            const batch = keysToInvalidate.slice(processed, processed + BATCH_SIZE);
            for (const key of batch) {
                CacheManager.invalidate(key);
            }
            processed += batch.length;
            
            if (processed < keysToInvalidate.length) {
                // Yield control and process next batch
                setTimeout(processBatch, 0);
            }
        };
        
        processBatch();
    }
    
    /**
     * Generates a consistent cache key
     * @param {string} namespace - Cache namespace
     * @param {string} methodName - Method name
     * @param {Array} args - Method arguments
     * @returns {string} - Formatted cache key
     */
    static generateCacheKey(namespace, methodName, args) {
        // Remove brackets to make prefix matching work for custom mapped data
        const argsString = JSON.stringify(args).replace(/^\[|\]$/g, '');
        //console.log('[cache] generateCacheKey:', `${namespace}:${methodName}:${argsString}`);
        return `${namespace}:${methodName}:${argsString}`;
    }

    /**
     * Invalidates specific cache entries
     * @param {Array<{namespace: string, methodName: string, args: Array}>} cacheEntries - Array of cache entries to invalidate
     * @param {boolean} invalidateByPrefix - If true, invalidates all caches that start with the cache key prefix
     */
    static invalidateCache(cacheEntries, invalidateByPrefix = false) {
        //console.log('[cache] invalidateCache called with entries:', cacheEntries, '| invalidateByPrefix:', invalidateByPrefix);
        
        if (!Array.isArray(cacheEntries)) return;
        cacheEntries.forEach(({ namespace, methodName, args }) => {
            if (namespace && methodName && args) {
                if (invalidateByPrefix) {
                    // Generate prefix that matches the actual cache key format
                    // Use the same format as generateCacheKey but only with the first two args
                    const prefixArgs = args.slice(0, 2); // Take first two args (tableId, tabName)
                    const argsString = JSON.stringify(prefixArgs).replace(/^\[|\]$/g, '');
                    const prefix = `${namespace}:${methodName}:${argsString}`;
                    CacheManager.invalidateByPrefix(prefix);
                } else {
                    // Exact key invalidation
                    const fullKey = CacheManager.generateCacheKey(namespace, methodName, args);
                    CacheManager.invalidate(fullKey);
                }
            }
        });
    }

    /**
     * Wraps all static methods of a class with caching and automatic dependency decorator
     * 
     * CRITICAL: Mutation methods must be excluded from wrapping to avoid circular dependencies.
     * Mutation methods trigger cache invalidation through Database.setData() and must NOT:
     * 1. Accept 'deps' as first parameter
     * 2. Use deps.call() to invoke sub-functions
     * 3. Be cached or wrapped by this method
     * 
     * Mutation methods are passed through directly without modification, preserving their
     * original signatures and allowing them to trigger cache invalidation independently.
     * 
     * @param {Object} targetClass - The class to wrap
     * @param {string} namespace - Cache namespace
     * @param {Array<string>} [mutationKeys] - Array of method names to skip wrapping (mutation methods)
     * @param {Array<string>} [infiniteCacheMethods] - Array of method names that should have infinite cache (no expiration)
     * @returns {Object} - Wrapped class with caching and dependency tracking
     */
    static wrapMethods(targetClass, namespace, mutationKeys = [], infiniteCacheMethods = [], customCacheDurations = {}) {
        const wrappedClass = {};
        wrappedClass._namespace = namespace;
        
        // Get all static methods
        const methods = Object.getOwnPropertyNames(targetClass)
            .filter(name => typeof targetClass[name] === 'function' && name !== 'constructor');
        
        methods.forEach(methodName => {
            // Skip wrapping for mutation methods - pass them through directly without modification
            // This preserves their original signatures (no deps parameter) and prevents circular dependencies
            if (mutationKeys.includes(methodName)) {
                wrappedClass[methodName] = targetClass[methodName];
                // Store method name for extractMethodName to retrieve
                wrappedClass[methodName]._namespace = namespace;
                wrappedClass[methodName]._methodName = methodName;
                return;
            }
            
            wrappedClass[methodName] = async function(...args) {
                const cacheKey = CacheManager.generateCacheKey(namespace, methodName, args);
                
                // Check cache first
                const cached = CacheManager.get(cacheKey);
                if (cached !== CacheManager.CACHE_MISS) {
                    return cached;
                }
                
                // Check if there's already a pending call - if so, wait for it
                let promise = CacheManager.pendingCalls.get(cacheKey);
                if (promise) {
                    return await promise;
                }
                
                // Create promise resolver/rejecter that we can store synchronously
                let promiseResolve, promiseReject;
                const pendingPromise = new Promise((resolve, reject) => {
                    promiseResolve = resolve;
                    promiseReject = reject;
                });
                
                // Store the promise IMMEDIATELY before any async work starts (atomic).
                // Attach a no-op catch so the stored promise never triggers an unhandled
                // rejection warning — callers receive the error via the re-thrown exception.
                pendingPromise.catch(() => {});
                CacheManager.pendingCalls.set(cacheKey, pendingPromise);
                
                // Now execute the actual async work
                try {
                    // Create dependency decorator for this function call
                    const deps = CacheManager.createDependencyDecorator(cacheKey);
                    
                    // Execute method with dependency decorator as first parameter
                    const result = await targetClass[methodName](deps, ...args);
                    
                    // Determine expiration time:
                    // 1. Custom duration if specified for this method — value may be a number, null, or
                    //    a function (args) => number | null for per-argument control
                    // 2. Infinite cache (null) if in infiniteCacheMethods
                    // 3. Default duration otherwise (undefined = use DEFAULT_CACHE_EXPIRATION_MS)
                    let expirationMs;
                    if (customCacheDurations[methodName] !== undefined) {
                        const durValue = customCacheDurations[methodName];
                        expirationMs = typeof durValue === 'function' ? durValue(args) : durValue;
                    } else if (infiniteCacheMethods.includes(methodName)) {
                        expirationMs = null;
                    } else {
                        expirationMs = undefined;
                    }
                    
                    CacheManager.set(cacheKey, result, expirationMs);
                    
                    // Resolve the promise for all waiters
                    promiseResolve(result);
                    return result;
                } catch (error) {
                    // Reject the promise for all waiters
                    promiseReject(error);
                    throw error;
                } finally {
                    // Always clean up the pending call when done
                    CacheManager.pendingCalls.delete(cacheKey);
                }
            };
            
            // Store the method name on the wrapped function for extractMethodName to retrieve
            wrappedClass[methodName]._methodName = methodName;
            // Store the cache key info on the function for dependency tracking
            wrappedClass[methodName]._namespace = namespace;
            wrappedClass[methodName]._methodName = methodName;
        });
        
        return wrappedClass;
    }
}

export const wrapMethods = CacheManager.wrapMethods;
export const invalidateCache = CacheManager.invalidateCache;

/**
 * Write a "data changed" timestamp to the CACHE/Caching sheet for the given prefix.
 *
 * ═══════════════════════════════════════════════════════════════
 * CRITICAL — TIMESTAMP ORDERING CONTRACT
 *
 * stampDataChange must be called BEFORE the corresponding local cache
 * entry is repopulated. The current write sequence in Database.setData
 * is:
 *   1. GoogleSheetsService.setSheetData  (data written to sheet)
 *   2. stampDataChange                   (timestamp captured & written — async, fire-and-forget)
 *   3. invalidateCache                   (local cache cleared — synchronous)
 *   4. store.save() → apiCall()          (local cache repopulated — async)
 *
 * Because the timestamp value is captured at step 2 (before the cache
 * refill at step 4), the Caching tab timestamp is always earlier than
 * the local cache's `entry.filled`. This guarantees that the local
 * session's own poller never spuriously re-invalidates its freshly-
 * saved data, while other sessions (whose caches were filled before
 * step 1) correctly detect the change.
 *
 * DO NOT move stampDataChange after invalidateCache or after the cache
 * repopulation — doing so would break detection in the local session.
 * ═══════════════════════════════════════════════════════════════
 */
export function stampDataChange(prefix) {
    if (CacheManager._timestampWriter) {
        CacheManager._timestampWriter(prefix);
    }
}
export function clearCache() {
    // While offline, the cache is the only copy of the data — don't wipe it.
    if (networkState.isOffline) return;
    CacheManager.cache.clear();
    CacheManager.pendingCalls.clear();
}
export { CacheInvalidationBus };

// Expired cache cleanup with CPU-aware batching
//
// Uses requestIdleCallback to run cleanup during browser idle time, preventing
// interference with user operations. Processes deletions in small batches with
// yields to avoid blocking the main thread.
let _cacheCleanupInterval = null;
let _isCleanupRunning = false;

/**
 * Process cache cleanup in batches during idle time
 * Runs as lowest-priority background work to avoid CPU contention
 */
async function performCacheCleanup() {
    if (_isCleanupRunning || networkState.isOffline) return;
    _isCleanupRunning = true;
    
    try {
        const now = Date.now();
        const expiredKeys = [];
        
        // Collect expired keys (fast scan, no deletions yet)
        for (const [key, entry] of CacheManager.cache.entries()) {
            if (entry.expire && entry.expire < now) {
                expiredKeys.push(key);
            }
        }
        
        if (expiredKeys.length === 0) {
            _isCleanupRunning = false;
            return;
        }
        
        // Process deletions in batches of 50 with idle-time yielding
        const BATCH_SIZE = 50;
        let deleted = 0;
        
        for (let i = 0; i < expiredKeys.length; i += BATCH_SIZE) {
            const batch = expiredKeys.slice(i, i + BATCH_SIZE);
            
            // Wait for idle time before processing next batch
            // Falls back to setTimeout if requestIdleCallback unavailable
            await new Promise(resolve => {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(resolve, { timeout: 1000 });
                } else {
                    setTimeout(resolve, 0);
                }
            });
            
            // Delete batch
            for (const key of batch) {
                CacheManager.cache.delete(key);
                deleted++;
            }
        }
        
        if (deleted > 0) {
            console.log(`[CacheCleanup] Removed ${deleted} expired entries (${expiredKeys.length - deleted} remain)`);
        }
    } catch (error) {
        console.warn('[CacheCleanup] Cleanup failed:', error);
    } finally {
        _isCleanupRunning = false;
    }
}

export function startCacheCleanup(intervalMs = 2 * 60 * 1000) { // Default: 2 minutes
    if (_cacheCleanupInterval) return;
    _cacheCleanupInterval = setInterval(() => {
        performCacheCleanup(); // Non-blocking async call
    }, intervalMs);
}

export function stopCacheCleanup() {
    if (_cacheCleanupInterval) {
        clearInterval(_cacheCleanupInterval);
        _cacheCleanupInterval = null;
    }
}

// Remote cache timestamp synchronization
//
// ═══════════════════════════════════════════════════════════════
// HOW EXTERNAL CHANGE DETECTION WORKS
//
// When this app (or an external app) writes data, it also writes a
// timestamp to the CACHE sheet's "Caching" tab:
//   Key                                       | Timestamp
//   database:getData:"INVENTORY","FURNITURE"  | 2026-07-07T12:00:00Z
//
// This poller reads that tab every 30 s (prod) / 10 s (localhost) and
// compares each entry's timestamp against the local in-memory cache:
//
//   FOR INVALIDATION TO FIRE, ALL OF THE FOLLOWING MUST BE TRUE:
//   1. A cache entry exists whose key STARTS WITH the Caching tab key.
//      If no entry exists (data not loaded, or TTL already expired and
//      not yet refilled), the poller silently skips that key.
//   2. remoteTs (Caching tab) > entry.filled (local cache fill time).
//      The external write timestamp must be strictly newer than when
//      this session last loaded the data.
//
// EXTERNAL APP REQUIREMENTS:
//   - Write the data to the sheet FIRST, then write the Caching tab.
//   - The Caching tab key must exactly match the prefix format:
//       database:getData:"<TABLE_ID>","<TAB_NAME>"
//   - TABLE_ID values: INVENTORY, PACK_LISTS, PRODUCTION_SCHEDULE, CACHE
//
// DEBUGGING: On localhost, use the browser console test helper:
//   window.__tsliTestExternalChange('database:getData:"INVENTORY","FURNITURE"')
// ═══════════════════════════════════════════════════════════════
let _cacheTimestampPollerInterval = null;
let _pollerReadFn = null;
let _pollerIntervalMs = 60 * 1000;

export function setTimestampWriter(fn) {
    CacheManager._timestampWriter = fn;
}

/**
 * Check for application updates by comparing server version against stored version.
 * The initial version is set by app.js on mount. This function runs every 60s to detect deploys.
 */
async function checkAppVersion() {
    try {
        const response = await fetch('./version.json');
        const versionData = await response.json();
        const storedVersion = localStorage.getItem('appVersion');
        
        console.log('[VersionCheck] Stored:', storedVersion, 'Server:', versionData.version);
        
        let updateStatus = 'false'; // Default: no update
        
        if (storedVersion && storedVersion !== versionData.version) {
            // Version mismatch detected - show update banner
            console.log('[VersionCheck] Update available');
            updateStatus = 'true';
            // Update stored version so after refresh it will match and banner hides
            //localStorage.setItem('appVersion', versionData.version);
        }
        
        // Update flag and dispatch event
        localStorage.setItem('updateAvailable', updateStatus);
        window.dispatchEvent(new CustomEvent('updateStatusChanged', { detail: { updateAvailable: updateStatus === 'true' } }));
    } catch (err) {
        console.warn('[VersionCheck] Error:', err.message);
        // Silently ignore errors (network issues, version.json not found)
    }
}

export function startCacheTimestampPoller(readFn, intervalMs = 60 * 1000) {
    if (_cacheTimestampPollerInterval) return;
    _pollerReadFn = readFn;
    _pollerIntervalMs = intervalMs;
    _cacheTimestampPollerInterval = setInterval(async () => {
        // Check for application updates
        checkAppVersion();
        
        try {
            const entries = await readFn();
            if (entries === null) {
                // readFn signaled auth is unavailable — pause the poller until re-auth
                stopCacheTimestampPoller();
                stopCacheCleanup();
                return;
            }
            if (!Array.isArray(entries) || entries.length === 0) return;
            for (const { key, timestamp } of entries) {
                if (!key || !timestamp) continue;
                const remoteTs = new Date(timestamp).getTime();
                if (isNaN(remoteTs)) continue;
                // CRITICAL: Poller can only invalidate cache entries that exist in CacheManager.cache.
                // If data hasn't been loaded yet (user never navigated to that page), the cache entry
                // won't exist and invalidation is silently skipped. This is by design - no point
                // invalidating data that hasn't been loaded.
                let shouldInvalidate = false;
                for (const [cacheKey, entry] of CacheManager.cache.entries()) {
                    if (cacheKey.startsWith(key) && entry.filled && remoteTs > entry.filled) {
                        shouldInvalidate = true;
                        break;
                    }
                }
                if (shouldInvalidate) {
                    //console.log('[CacheTimestampPoller] Remote change detected for', key, '- invalidating');
                    CacheManager.invalidateByPrefix(key);
                }
            }
        } catch (err) {
            console.warn('[CacheTimestampPoller] Poll failed:', err);
        }
    }, intervalMs);
}

export function stopCacheTimestampPoller() {
    if (_cacheTimestampPollerInterval) {
        clearInterval(_cacheTimestampPollerInterval);
        _cacheTimestampPollerInterval = null;
    }
}

export function restartCacheTimestampPoller() {
    if (!_cacheTimestampPollerInterval && _pollerReadFn) {
        startCacheTimestampPoller(_pollerReadFn, _pollerIntervalMs);
        startCacheCleanup(2 * 60 * 1000); // Also restart cleanup timer
    }
}

/**
 * Run the cache-timestamp poll cycle immediately (outside of the normal interval).
 * Reads the Caching tab, compares timestamps against in-memory cache entries,
 * and fires CacheInvalidationBus events for any stale entries found.
 *
 * Usage from the browser console:
 *   import('/docs/js/data_management/utils/caching.js').then(m => m.triggerCachePoll())
 * Or via the TSLI test helper (available on localhost):
 *   window.__tsliTestExternalChange('database:getData:"INVENTORY","FURNITURE"')
 */
export async function triggerCachePoll() {
    if (!_pollerReadFn) {
        console.warn('[CachePoll] No poll function configured — call startCacheTimestampPoller first.');
        return;
    }
    try {
        const entries = await _pollerReadFn();
        if (entries === null) {
            console.warn('[CachePoll] Auth unavailable, poll aborted.');
            return;
        }
        if (!Array.isArray(entries) || entries.length === 0) {
            console.log('[CachePoll] Caching tab is empty — no entries to check.');
            return;
        }
        console.log(`[CachePoll] Found ${entries.length} entries in Caching tab:`, entries.map(e => e.key));
        for (const { key, timestamp } of entries) {
            if (!key || !timestamp) continue;
            const remoteTs = new Date(timestamp).getTime();
            if (isNaN(remoteTs)) continue;
            let shouldInvalidate = false;
            let matchedCacheKey = null;
            for (const [cacheKey, entry] of CacheManager.cache.entries()) {
                if (cacheKey.startsWith(key) && entry.filled && remoteTs > entry.filled) {
                    shouldInvalidate = true;
                    matchedCacheKey = cacheKey;
                    break;
                }
            }
            if (shouldInvalidate) {
                console.log(`[CachePoll] Stale entry detected for "${key}" (matched: "${matchedCacheKey}") — invalidating.`);
                CacheManager.invalidateByPrefix(key);
            } else {
                const hasEntry = [...CacheManager.cache.keys()].some(k => k.startsWith(key));
                if (!hasEntry) {
                    console.log(`[CachePoll] No cache entry found matching prefix "${key}" — nothing to invalidate.`);
                } else {
                    console.log(`[CachePoll] Cache for "${key}" is newer than remote timestamp — already up to date.`);
                }
            }
        }
    } catch (err) {
        console.warn('[CachePoll] Poll failed:', err);
    }
}