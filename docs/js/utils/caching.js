/**
 * Caching system for application data
 */
export class CacheManager {
    // Global cache storage
    static _cacheStore = new Map();
    
    // Cache dependency map: { namespace: { key: [dependentCaches] } }
    static _dependencyMap = new Map();
    
    // Default cache expiration (5 minutes)
    static DEFAULT_EXPIRATION = 5 * 60 * 1000;
    
    // Global namespace definitions
    static NAMESPACES = {
        // Database related
        SHEET_TABS: 'sheet_tabs',      // For tab metadata
        SHEET_DATA: 'sheet_data',       // For raw sheet data
        QUERY_RESULTS: 'query_results', // For SQL query results
        
        // Analytics related
        PROD_SCHEDULE: 'prod_schedule', // Production schedule data
        FUZZY_MATCHING: 'fuzzy_matching', // Fuzzy matching reference data
        INVENTORY: 'inventory',         // Inventory information
        PACK_LISTS: 'pack_lists',       // Pack list content
        
        // Application related
        UI_STATE: 'ui_state',           // UI state information
        USER_PREFS: 'user_prefs'        // User preferences
    };
    
    // Common expiration times
    static EXPIRATIONS = {
        SHORT: 2 * 60 * 1000,     // 2 minutes
        MEDIUM: 5 * 60 * 1000,    // 5 minutes
        LONG: 15 * 60 * 1000,     // 15 minutes
        VERY_LONG: 60 * 60 * 1000 // 1 hour
    };
    
    // Track active cache operations for dependency tracking
    static _activeOperations = new Map();
    
    // Use an AsyncLocalStorage-like approach for tracking context
    static _asyncTracking = new Map();
    
    /**
     * Start tracking cache operations for a function call with thread safety
     * @param {string} trackingId - Unique ID for the function call
     * @returns {string} The tracking ID
     */
    static beginTracking(trackingId = null) {
        trackingId = trackingId || `op_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        
        // Create a new tracking context that's isolated to this execution flow
        const trackingContext = {
            accessed: new Set(),
            created: new Set(),
            childContexts: new Set(), // Track child contexts for nested operations
            parentContext: null // Reference to parent context if this is nested
        };
        
        this._activeOperations.set(trackingId, trackingContext);
        
        // Store the tracking ID in the current execution context
        // Use a unique Symbol as a key to avoid collisions
        this._setCurrentTrackingId(trackingId);
        
        return trackingId;
    }
    
    /**
     * Associate this async execution context with a tracking ID
     * @private
     */
    static _setCurrentTrackingId(trackingId) {
        const asyncKey = this._getAsyncExecutionId();
        if (asyncKey) {
            this._asyncTracking.set(asyncKey, trackingId);
        }
    }
    
    /**
     * Get a unique identifier for the current execution context
     * @private
     */
    static _getAsyncExecutionId() {
        // In a true concurrent environment, this would use AsyncLocalStorage
        // For our browser context, we generate a unique ID for the current call stack
        const error = new Error();
        const stack = error.stack || '';
        // Create a hash of the current call stack
        return this._hashString(stack);
    }
    
    /**
     * Simple hash function for strings
     * @private
     */
    static _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 'exec_' + Math.abs(hash).toString(36);
    }
    
    /**
     * Get the tracking ID for the current execution context
     * @returns {string|null} Current tracking ID or null
     */
    static getCurrentTrackingId() {
        const asyncKey = this._getAsyncExecutionId();
        if (asyncKey && this._asyncTracking.has(asyncKey)) {
            return this._asyncTracking.get(asyncKey);
        }
        return null;
    }
    
    /**
     * End tracking and get the dependencies
     * @param {string} trackingId - The tracking ID
     * @returns {Array<{namespace: string, key: string}>} Dependencies detected
     */
    static endTracking(trackingId) {
        const operation = this._activeOperations.get(trackingId);
        if (!operation) return [];
        
        // Merge any child contexts into this one
        this._mergeChildContexts(operation);
        
        const dependencies = Array.from(operation.accessed).map(entry => {
            const [namespace, key] = entry.split(':::');
            return { namespace, key };
        });
        
        // Clean up
        this._activeOperations.delete(trackingId);
        
        // Remove from async tracking
        for (const [key, id] of this._asyncTracking.entries()) {
            if (id === trackingId) {
                this._asyncTracking.delete(key);
            }
        }
        
        return dependencies;
    }
    
    /**
     * Recursively merge child contexts into the parent
     * @private
     */
    static _mergeChildContexts(context) {
        if (!context || !context.childContexts) return;
        
        for (const childId of context.childContexts) {
            const childContext = this._activeOperations.get(childId);
            if (childContext) {
                // First merge any deeper children
                this._mergeChildContexts(childContext);
                
                // Then merge this child's accesses into parent
                for (const access of childContext.accessed) {
                    context.accessed.add(access);
                }
                
                for (const created of childContext.created) {
                    context.created.add(created);
                }
                
                // Remove the child context
                this._activeOperations.delete(childId);
            }
        }
    }
    
    /**
     * Set a value in cache with thread-safe dependency tracking
     * @param {string} namespace - Cache namespace (e.g., 'sheets', 'inventory')
     * @param {string} key - Cache key
     * @param {any} value - Value to store
     * @param {number} [expiration] - Expiration time in milliseconds
     * @param {Array<{namespace: string, key?: string}>} [dependencies] - Other caches this cache depends on
     * @param {string} [trackingId] - Optional tracking ID for automatic dependency detection
     */
    static set(namespace, key, value, expiration = this.DEFAULT_EXPIRATION, dependencies = [], trackingId = null) {
        if (!namespace || !key) return;
        
        // Use the current tracking ID if not explicitly provided
        trackingId = trackingId || this.getCurrentTrackingId();
        
        const namespaceCache = this._getNamespace(namespace);
        const cacheKey = this._formatKey(key);
        
        // Create mutex to prevent concurrent writes to the same key
        const mutexKey = `${namespace}:::${cacheKey}`;
        if (!this._cacheMutexes) this._cacheMutexes = new Map();
        
        // Simple mutex implementation
        let mutex = this._cacheMutexes.get(mutexKey);
        if (!mutex) {
            mutex = { locked: false, queue: [] };
            this._cacheMutexes.set(mutexKey, mutex);
        }
        
        // Acquire mutex
        if (mutex.locked) {
            // Wait for mutex to be available
            const waitPromise = new Promise(resolve => mutex.queue.push(resolve));
            waitPromise.then(() => this._doSet(namespace, key, cacheKey, value, expiration, dependencies, trackingId, namespaceCache));
            return;
        }
        
        mutex.locked = true;
        this._doSet(namespace, key, cacheKey, value, expiration, dependencies, trackingId, namespaceCache);
        
        // Release mutex
        mutex.locked = false;
        if (mutex.queue.length > 0) {
            const next = mutex.queue.shift();
            next();
        }
    }
    
    /**
     * Actual set implementation (protected by mutex)
     * @private
     */
    static _doSet(namespace, key, cacheKey, value, expiration, dependencies, trackingId, namespaceCache) {
        namespaceCache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expiration
        });
        
        // Register the entry in active operations if tracking
        if (trackingId && this._activeOperations.has(trackingId)) {
            this._activeOperations.get(trackingId).created.add(`${namespace}:::${cacheKey}`);
        }
        
        // Register explicit dependencies
        if (dependencies.length > 0) {
            this.registerDependencies(namespace, cacheKey, dependencies);
        }
        
        // Register tracked dependencies
        if (trackingId) {
            this.applyTrackedDependencies(namespace, cacheKey, trackingId);
        }
    }
    
    /**
     * Get a value from cache with thread-safe dependency tracking
     * @param {string} namespace - Cache namespace
     * @param {string} key - Cache key
     * @param {string} [trackingId] - Optional tracking ID for automatic dependency detection
     * @returns {any|null} - Cached value or null if not found/expired
     */
    static get(namespace, key, trackingId = null) {
        if (!namespace || !key) return null;
        
        // Use the current tracking ID if not explicitly provided
        trackingId = trackingId || this.getCurrentTrackingId();
        
        const namespaceCache = this._getNamespace(namespace);
        const cacheKey = this._formatKey(key);
        
        const entry = namespaceCache.get(cacheKey);
        if (!entry) return null;
        
        // Check if expired
        if (Date.now() - entry.timestamp > entry.expiration) {
            namespaceCache.delete(cacheKey);
            return null;
        }
        
        // Register the access in active operations if tracking
        if (trackingId && this._activeOperations.has(trackingId)) {
            this._activeOperations.get(trackingId).accessed.add(`${namespace}:::${cacheKey}`);
        }
        
        return entry.value;
    }
    
    /**
     * Check if a key exists in cache and is not expired
     * @param {string} namespace - Cache namespace
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    static has(namespace, key) {
        if (!namespace || !key) return false;
        
        const namespaceCache = this._getNamespace(namespace);
        const cacheKey = this._formatKey(key);
        
        const entry = namespaceCache.get(cacheKey);
        if (!entry) return false;
        
        // Check if expired
        if (Date.now() - entry.timestamp > entry.expiration) {
            namespaceCache.delete(cacheKey);
            return false;
        }
        
        return true;
    }
    
    /**
     * Remove a specific key from cache and invalidate its dependents
     * @param {string} namespace - Cache namespace
     * @param {string} key - Cache key
     */
    static invalidate(namespace, key) {
        if (!namespace || !key) return;
        
        const namespaceCache = this._getNamespace(namespace);
        const cacheKey = this._formatKey(key);
        
        // Remove the cache entry
        namespaceCache.delete(cacheKey);
        
        // Invalidate dependent caches
        this._invalidateDependents(namespace, cacheKey);
    }
    
    /**
     * Remove all keys in a namespace that match a prefix and invalidate dependents
     * @param {string} namespace - Cache namespace
     * @param {string} keyPrefix - Key prefix to match
     */
    static invalidateByPrefix(namespace, keyPrefix) {
        if (!namespace || !keyPrefix) return;
        
        const namespaceCache = this._getNamespace(namespace);
        const prefix = this._formatKey(keyPrefix);
        
        // Collect keys to invalidate
        const keysToInvalidate = [];
        for (const key of namespaceCache.keys()) {
            if (key.startsWith(prefix)) {
                keysToInvalidate.push(key);
            }
        }
        
        // Delete each key and its dependents
        for (const key of keysToInvalidate) {
            namespaceCache.delete(key);
            this._invalidateDependents(namespace, key);
        }
    }
    
    /**
     * Clear an entire namespace and invalidate all dependents
     * @param {string} namespace - Cache namespace to clear
     */
    static clearNamespace(namespace) {
        if (!namespace) return;
        
        const namespaceCache = this._getNamespace(namespace);
        
        // Collect all keys to invalidate dependents
        const keys = [...namespaceCache.keys()];
        
        // Clear the namespace
        namespaceCache.clear();
        
        // Invalidate namespace-level dependents
        this._invalidateDependents(namespace, '*');
        
        // Invalidate key-level dependents
        for (const key of keys) {
            this._invalidateDependents(namespace, key);
        }
    }
    
    /**
     * Invalidate all caches that depend on the given namespace and key
     * @param {string} namespace - Dependency namespace
     * @param {string} key - Dependency key
     * @private
     */
    static _invalidateDependents(namespace, key) {
        // Check if there are any dependents for this namespace
        const nsMap = this._dependencyMap.get(namespace);
        if (!nsMap) return;
        
        // Get dependents for this specific key
        const keyDependents = nsMap.get(key) || [];
        
        // Also get namespace-level dependents
        const namespaceDependents = nsMap.get('*') || [];
        
        // Combine dependents and remove duplicates
        const allDependents = [...keyDependents, ...namespaceDependents];
        
        // Process each dependent, avoiding circular references
        const processed = new Set();
        for (const dep of allDependents) {
            const depKey = `${dep.namespace}:${dep.key}`;
            if (processed.has(depKey)) continue;
            processed.add(depKey);
            
            // Get the dependent's namespace cache
            const depNamespaceCache = this._getNamespace(dep.namespace);
            
            // Invalidate the dependent
            if (depNamespaceCache.has(dep.key)) {
                depNamespaceCache.delete(dep.key);
                
                // Recursively invalidate dependents of this dependent
                this._invalidateDependents(dep.namespace, dep.key);
            }
        }
    }
    
    /**
     * Clear the entire cache across all namespaces
     */
    static clearAll() {
        this._cacheStore.clear();
        this._dependencyMap.clear();
    }
    
    /**
     * Get statistics about cache usage and dependencies
     * @returns {Object} Cache statistics
     */
    static getStats() {
        const stats = {
            namespaces: [],
            totalEntries: 0,
            totalExpired: 0,
            totalDependencies: 0
        };
        
        for (const [namespace, cache] of this._cacheStore.entries()) {
            let entries = 0;
            let expired = 0;
            
            for (const [key, entry] of cache.entries()) {
                entries++;
                if (Date.now() - entry.timestamp > entry.expiration) {
                    expired++;
                }
            }
            
            // Count dependencies for this namespace
            let dependencies = 0;
            const nsDepMap = this._dependencyMap.get(namespace);
            if (nsDepMap) {
                for (const deps of nsDepMap.values()) {
                    dependencies += deps.length;
                }
            }
            
            stats.namespaces.push({
                name: namespace,
                entries,
                expired,
                dependencies
            });
            
            stats.totalEntries += entries;
            stats.totalExpired += expired;
            stats.totalDependencies += dependencies;
        }
        
        return stats;
    }
    
    /**
     * Get a namespace Map, creating it if it doesn't exist
     * @private
     */
    static _getNamespace(namespace) {
        if (!this._cacheStore.has(namespace)) {
            this._cacheStore.set(namespace, new Map());
        }
        return this._cacheStore.get(namespace);
    }
    
    /**
     * Format a key to ensure it's a string
     * @private
     */
    static _formatKey(key) {
        if (typeof key === 'object') {
            return JSON.stringify(key);
        }
        return String(key);
    }
    
    /**
     * Defines standard dependency relationships between caches
     * @returns {Object} Map of dependencies
     */
    static getDependencyMap() {
        return {
            // Sheet data dependencies
            [this.NAMESPACES.SHEET_DATA]: {
                affects: [
                    this.NAMESPACES.QUERY_RESULTS,
                    this.NAMESPACES.INVENTORY,
                    this.NAMESPACES.PACK_LISTS,
                    this.NAMESPACES.PROD_SCHEDULE
                ]
            },
            
            // Tab changes affect data queries and pack lists
            [this.NAMESPACES.SHEET_TABS]: {
                affects: [
                    this.NAMESPACES.SHEET_DATA,
                    this.NAMESPACES.QUERY_RESULTS,
                    this.NAMESPACES.PACK_LISTS
                ]
            },
            
            // Production schedule affects pack lists and inventory
            [this.NAMESPACES.PROD_SCHEDULE]: {
                affects: [
                    this.NAMESPACES.PACK_LISTS,
                    this.NAMESPACES.INVENTORY
                ]
            },
            
            // Pack list changes affect quantity checks
            [this.NAMESPACES.PACK_LISTS]: {
                affects: [
                    this.NAMESPACES.INVENTORY
                ]
            },
            
            // Inventory changes affect quantity checks
            [this.NAMESPACES.INVENTORY]: {
                affects: []
            }
        };
    }
}

/**
 * Enhanced cache decorator with thread-safe dependency tracking
 * @param {string} namespace - Cache namespace
 * @param {Function} keyGenerator - Function to generate cache key from arguments
 * @param {number} [expiration] - Cache expiration time in ms
 * @param {Array<string>} [explicitDependencies] - Array of namespaces this cache explicitly depends on
 */
export function cached(namespace, keyGenerator, expiration, explicitDependencies = []) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const methodName = propertyKey || originalMethod.name || 'anonymous';
        
        descriptor.value = async function(...args) {
            // Generate cache key
            const key = keyGenerator ? keyGenerator(...args) : args.join(':');
            
            // Check cache first (don't track this access as a dependency)
            const cachedValue = CacheManager.get(namespace, key);
            if (cachedValue !== null) {
                return cachedValue;
            }
            
            // Create a tracking ID specific to this method call
            // Include a reference to the "this" context and args to make it more unique
            const contextRef = this ? Object.prototype.toString.call(this) : 'global';
            const argsRef = args.length > 0 ? JSON.stringify(args[0]).substring(0, 20) : 'noargs';
            const trackingId = CacheManager.beginTracking(`${methodName}_${contextRef}_${argsRef}_${Date.now()}`);
            
            try {
                // Execute the original method, tracking all cache accesses
                const result = await originalMethod.apply(this, args);
                
                // Add explicit dependencies
                const explicitDeps = explicitDependencies.map(ns => ({ namespace: ns }));
                
                // Get tracked dependencies
                const trackedDeps = CacheManager.endTracking(trackingId);
                
                // Combine explicit and tracked dependencies
                const allDependencies = [...explicitDeps, ...trackedDeps];
                
                // Cache the result with all dependencies
                CacheManager.set(namespace, key, result, expiration, allDependencies);
                
                return result;
            } catch (error) {
                // End tracking even if there's an error
                CacheManager.endTracking(trackingId);
                throw error;
            }
        };
        
        return descriptor;
    };
}

/**
 * Wraps a method with automatic tracking
 * @param {Function} method - The method to wrap
 * @param {string} methodName - Name of the method for tracking ID
 * @returns {Function} Wrapped method with automatic tracking
 */
export function withTracking(method, methodName) {
    return async function(...args) {
        // Generate a tracking ID based on the method name and arguments
        const argsIdentifier = args.length > 0 
            ? (typeof args[0] === 'string' ? args[0] : JSON.stringify(args.slice(0, 2)).substring(0, 20)) 
            : 'noargs';
        const trackingId = CacheManager.beginTracking(`${methodName}_${argsIdentifier}_${Date.now()}`);
        
        try {
            // Call the original method with the tracking ID
            return await method.apply(this, args);
        } finally {
            // Always end tracking, even if there's an error
            CacheManager.endTracking(trackingId);
        }
    };
}

/**
 * Applies tracking to all methods of a class
 * @param {Object} classObj - The class to apply tracking to
 * @returns {Object} Class with tracked methods
 */
export function applyTracking(classObj) {
    // Create a new class that extends the original
    const TrackedClass = {};
    
    // Get all static methods
    const methodNames = Object.getOwnPropertyNames(classObj)
        .filter(name => {
            // Filter out non-methods
            return typeof classObj[name] === 'function' && 
                   name !== 'constructor' &&
                   name !== 'length' &&
                   name !== 'prototype' &&
                   name !== 'name';
        });
    
    // Wrap each method with tracking
    for (const methodName of methodNames) {
        const originalMethod = classObj[methodName];
        // Check if the method is async
        if (originalMethod.constructor.name === 'AsyncFunction') {
            // For async methods, apply tracking wrapper
            TrackedClass[methodName] = withTracking(originalMethod, methodName);
        } else {
            // For non-async methods, keep as is
            TrackedClass[methodName] = originalMethod;
        }
    }
    
    return TrackedClass;
}

/**
 * Get currently active tracking ID (for manual dependency tracking)
 * @returns {string|null} Current tracking ID or null
 */
export function getCurrentTrackingId() {
    return CacheManager.getCurrentTrackingId();
}

/**
 * Record a cache access for dependency tracking
 * @param {string} namespace - Cache namespace
 * @param {string} key - Cache key
 * @param {string} trackingId - The tracking ID
 */
export function trackCacheAccess(namespace, key, trackingId) {
    if (!trackingId) return;
    
    const operation = CacheManager._activeOperations.get(trackingId);
    if (operation) {
        operation.accessed.add(`${namespace}:::${CacheManager._formatKey(key)}`);
    }
}