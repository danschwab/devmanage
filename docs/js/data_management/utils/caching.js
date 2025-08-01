/**
 * Default cache expiration in milliseconds
 */
const DEFAULT_CACHE_EXPIRATION_MS = 5 * 60 * 1000;

class SimpleCacheManager {
    static DEFAULT_CACHE_EXPIRATION_MS = DEFAULT_CACHE_EXPIRATION_MS;
    
    static _store = new Map();
    static _deps = new Map();

    static _activeTrack = null;
    static _trackStack = [];

    static _startTracking() {
        const deps = new Set();
        this._trackStack.push(deps);
        this._activeTrack = deps;
    }

    static _stopTracking() {
        const deps = this._trackStack.pop();
        this._activeTrack = this._trackStack[this._trackStack.length - 1] || null;
        return deps ? Array.from(deps) : [];
    }

    static get(namespace, key) {
        const ns = this._store.get(namespace);
        // Track dependency (always, even on miss)
        if (this._activeTrack) this._activeTrack.add(`${namespace}:${key}`);
        if (!ns) {
            console.log(`[CacheManager] GET MISS (namespace missing): ${namespace}:${key}`);
            return null;
        }
        const entry = ns.get(key);
        if (!entry) {
            console.log(`[CacheManager] GET MISS: ${namespace}:${key}`);
            return null;
        }
        if (entry.expire && entry.expire < Date.now()) {
            ns.delete(key);
            console.log(`[CacheManager] GET EXPIRED: ${namespace}:${key}`);
            return null;
        }
        console.log(`[CacheManager] GET HIT: ${namespace}:${key}`);
        return entry.value;
    }

    static set(namespace, key, value, expirationMs = DEFAULT_CACHE_EXPIRATION_MS, dependencies = []) {
        if (
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === 'object' && value !== null && Object.keys(value).length === 0)
        ) {
            // Don't cache empty results
            console.log(`[CacheManager] SKIP SET (empty): ${namespace}:${key}`);
            return;
        }
        if (!this._store.has(namespace)) this._store.set(namespace, new Map());
        this._store.get(namespace).set(key, {
            value,
            expire: expirationMs ? Date.now() + expirationMs : null
        });
        console.log(`[CacheManager] SET: ${namespace}:${key} (expires in ${expirationMs}ms)`);
        // Register dependencies
        if (dependencies.length > 0) {
            this._deps.set(`${namespace}:${key}`, dependencies);
            console.log(`[CacheManager] SET DEPS: ${namespace}:${key} -> [${dependencies.join(', ')}]`);
            dependencies.forEach(dep => {
                console.log(`[CacheManager] REGISTER DEPENDENCY: ${namespace}:${key} depends on ${dep}`);
            });
        }
    }

    static invalidate(namespace, key) {
        const ns = this._store.get(namespace);
        if (ns) ns.delete(key);
        console.log(`[CacheManager] INVALIDATE: ${namespace}:${key}`);
        // Invalidate dependents
        const dependents = [];
        for (const [depKey, deps] of this._deps.entries()) {
            if (deps.includes(`${namespace}:${key}`)) {
                dependents.push(depKey);
            }
        }
        if (dependents.length > 0) {
            console.log(`[CacheManager] INVALIDATE: ${namespace}:${key} has dependents: [${dependents.join(', ')}]`);
        }
        for (const depKey of dependents) {
            const [depNs, depK] = depKey.split(':');
            console.log(`[CacheManager] INVALIDATE DEPENDENT: ${depKey} because of ${namespace}:${key}`);
            this.invalidate(depNs, depK);
        }
        this._deps.delete(`${namespace}:${key}`);
    }

    static invalidateByPrefix(namespace, prefix) {
        const ns = this._store.get(namespace);
        if (!ns) return;
        for (const key of Array.from(ns.keys())) {
            if (key.startsWith(prefix)) {
                this.invalidate(namespace, key);
            }
        }
        console.log(`[CacheManager] INVALIDATE BY PREFIX: ${namespace}:${prefix}`);
    }

    static clearNamespace(namespace) {
        this._store.delete(namespace);
        // Remove all dependencies for this namespace
        for (const depKey of Array.from(this._deps.keys())) {
            if (depKey.startsWith(namespace + ':')) {
                this._deps.delete(depKey);
            }
        }
        console.log(`[CacheManager] CLEAR NAMESPACE: ${namespace}`);
    }
    
    /**
     * Decorator/wrapper for automatic caching and dependency tracking.
     * Usage: const cachedFn = autoCache(namespace, keyGen, expirationMs)(fn)
     */
    static autoCache(namespace, keyGen, expirationMs = DEFAULT_CACHE_EXPIRATION_MS) {
        return function(fn) {
            return async function(...args) {
                const key = keyGen ? keyGen(...args) : JSON.stringify(args);
                // Try cache
                const cached = SimpleCacheManager.get(namespace, key);
                if (cached !== null) return cached;
                // Track dependencies during execution
                SimpleCacheManager._startTracking();
                const result = await fn.apply(this, args);
                const deps = SimpleCacheManager._stopTracking();
                SimpleCacheManager.set(namespace, key, result, expirationMs, deps);
                return result;
            };
        };
    }
    
    /**
     * Decorator/wrapper for mutation methods that should invalidate caches.
     * Usage: const invalidateFn = autoInvalidate(fn, getAffectedKeys)
     */
    static autoInvalidate(fn, getAffectedKeys) {
        return async function(...args) {
            const result = await fn.apply(this, args);
            const affectedKeys = getAffectedKeys(...args);
            for (const { namespace, key } of affectedKeys) {
                SimpleCacheManager.invalidate(namespace, key);
            }
            return result;
        };
    }
}


/**
 * Helper to wrap all static methods of a class/object with autoCache,
 * and mutation methods with autoInvalidate if mutationKeys and getAffectedKeysFn are provided.
 * Usage: export const MyUtils = wrapMethods(MyUtilsClass, 'namespace', mutationKeys, getAffectedKeysFn);
 */
export function wrapMethods(cls, namespace, mutationKeys = [], getAffectedKeysFn = {}) {
    const wrapped = {};
    for (const methodName of Object.getOwnPropertyNames(cls)) {
        if (typeof cls[methodName] === 'function') {
            if (mutationKeys.includes(methodName)) {
                // Wrap mutation methods with custom invalidation logic
                const getKeys = getAffectedKeysFn[methodName] || (() => []);
                wrapped[methodName] = async function(...args) {
                    const result = await cls[methodName].apply(this, args);
                    const affectedKeys = getKeys(...args);
                    for (const { namespace: ns, key } of affectedKeys) {
                        // Invalidate all cache keys for this namespace/tab prefix
                        const prefix = key.replace(/(\[.*?\])$/, ''); // Remove trailing array/mapping if present
                        SimpleCacheManager.invalidateByPrefix(ns, prefix);
                    }
                    return result;
                };
            } else {
                wrapped[methodName] = SimpleCacheManager.autoCache(namespace, (...args) => methodName + ':' + JSON.stringify(args))(cls[methodName]);
            }
        }
    }
    return wrapped;
}

// Export the cache manager for manual invalidation if needed
export const CacheManager = SimpleCacheManager;