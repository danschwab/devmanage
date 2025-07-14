/**
 * Simplified caching system for application data
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
    
    /**
     * Start tracking cache operations for a function call
     * @param {string} trackingId - Unique ID for the function call
     * @returns {string} The tracking ID
     */
    static beginTracking(trackingId = null) {
        trackingId = trackingId || `op_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        
        const trackingContext = {
            accessed: new Set(),
            created: new Set()
        };
        
        this._activeOperations.set(trackingId, trackingContext);
        return trackingId;
    }
    
    /**
     * Get the current tracking ID (simplified - just return the most recent one)
     * @returns {string|null} Current tracking ID or null
     */
    static getCurrentTrackingId() {
        const keys = Array.from(this._activeOperations.keys());
        return keys.length > 0 ? keys[keys.length - 1] : null;
    }
    
    /**
     * End tracking and get the dependencies
     * @param {string} trackingId - The tracking ID
     * @returns {Array<{namespace: string, key: string}>} Dependencies detected
     */
    static endTracking(trackingId) {
        const operation = this._activeOperations.get(trackingId);
        if (!operation) return [];
        
        const dependencies = Array.from(operation.accessed).map(entry => {
            const [namespace, key] = entry.split(':::');
            return { namespace, key };
        });
        
        this._activeOperations.delete(trackingId);
        return dependencies;
    }
    
    /**
     * Set a value in cache with dependency tracking
     * @param {string} namespace - Cache namespace
     * @param {string} key - Cache key
     * @param {any} value - Value to store
     * @param {number} [expiration] - Expiration time in milliseconds
     * @param {Array<{namespace: string, key?: string}>} [dependencies] - Other caches this cache depends on
     * @param {string} [trackingId] - Optional tracking ID for automatic dependency detection
     */
    static set(namespace, key, value, expiration = this.DEFAULT_EXPIRATION, dependencies = [], trackingId = null) {
        if (!namespace || !key) return;
        
        const namespaceCache = this._getNamespace(namespace);
        const cacheKey = this._formatKey(key);
        
        namespaceCache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expiration
        });
        
        // Register the entry in active operations if tracking
        trackingId = trackingId || this.getCurrentTrackingId();
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
     * Get a value from cache with dependency tracking
     * @param {string} namespace - Cache namespace
     * @param {string} key - Cache key
     * @param {string} [trackingId] - Optional tracking ID for automatic dependency detection
     * @returns {any|null} - Cached value or null if not found/expired
     */
    static get(namespace, key, trackingId = null) {
        if (!namespace || !key) return null;
        
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
        trackingId = trackingId || this.getCurrentTrackingId();
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
        
        namespaceCache.delete(cacheKey);
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
        
        const keysToInvalidate = [];
        for (const key of namespaceCache.keys()) {
            if (key.startsWith(prefix)) {
                keysToInvalidate.push(key);
            }
        }
        
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
        const keys = [...namespaceCache.keys()];
        
        namespaceCache.clear();
        
        this._invalidateDependents(namespace, '*');
        for (const key of keys) {
            this._invalidateDependents(namespace, key);
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
     * Register explicit dependencies between cache entries
     * @param {string} sourceNamespace - The namespace that other caches depend on
     * @param {string} sourceKey - The key that other caches depend on
     * @param {Array<{namespace: string, key: string}>} dependentCaches - Caches that depend on this entry
     */
    static registerDependencies(sourceNamespace, sourceKey, dependentCaches) {
        if (!this._dependencyMap.has(sourceNamespace)) {
            this._dependencyMap.set(sourceNamespace, new Map());
        }
        
        const nsMap = this._dependencyMap.get(sourceNamespace);
        const formattedKey = this._formatKey(sourceKey);
        
        if (!nsMap.has(formattedKey)) {
            nsMap.set(formattedKey, []);
        }
        
        const existingDeps = nsMap.get(formattedKey);
        
        for (const dep of dependentCaches) {
            const exists = existingDeps.some(existing => 
                existing.namespace === dep.namespace && existing.key === dep.key
            );
            
            if (!exists) {
                existingDeps.push({
                    namespace: dep.namespace,
                    key: this._formatKey(dep.key)
                });
            }
        }
    }
    
    /**
     * Apply tracked dependencies to a cache entry
     * @param {string} namespace - Target cache namespace
     * @param {string} key - Target cache key
     * @param {string} trackingId - The tracking ID with recorded dependencies
     */
    static applyTrackedDependencies(namespace, key, trackingId) {
        const operation = this._activeOperations.get(trackingId);
        if (!operation) return;
        
        const dependencies = [];
        for (const access of operation.accessed) {
            const [depNamespace, depKey] = access.split(':::');
            dependencies.push({ namespace: depNamespace, key: depKey });
        }
        
        if (dependencies.length > 0) {
            for (const dep of dependencies) {
                this.registerDependencies(dep.namespace, dep.key, [{ namespace, key }]);
            }
        }
    }
    
    /**
     * Wraps a method with automatic tracking
     * @param {Function} method - The method to wrap
     * @param {string} methodName - Name of the method for tracking ID
     * @returns {Function} Wrapped method with automatic tracking
     */
    static withTracking(method, methodName) {
        return async function(...args) {
            const argsIdentifier = args.length > 0 
                ? (typeof args[0] === 'string' ? args[0] : JSON.stringify(args.slice(0, 2)).substring(0, 20)) 
                : 'noargs';
            const trackingId = CacheManager.beginTracking(`${methodName}_${argsIdentifier}_${Date.now()}`);
            
            try {
                return await method.apply(this, args);
            } finally {
                CacheManager.endTracking(trackingId);
            }
        };
    }
    
    /**
     * Applies tracking to all methods of a class
     * @param {Object} classObj - The class to apply tracking to
     * @returns {Object} Class with tracked methods
     */
    static applyTracking(classObj) {
        const TrackedClass = {};
        
        const methodNames = Object.getOwnPropertyNames(classObj)
            .filter(name => {
                return typeof classObj[name] === 'function' && 
                       name !== 'constructor' &&
                       name !== 'length' &&
                       name !== 'prototype' &&
                       name !== 'name';
            });
        
        for (const methodName of methodNames) {
            const originalMethod = classObj[methodName];
            if (originalMethod.constructor.name === 'AsyncFunction') {
                TrackedClass[methodName] = this.withTracking(originalMethod, methodName);
            } else {
                TrackedClass[methodName] = originalMethod;
            }
        }
        
        return TrackedClass;
    }
    
    /**
     * Defines standard dependency relationships between caches
     * @returns {Object} Map of dependencies
     */
    static getDependencyMap() {
        return {
            [this.NAMESPACES.SHEET_DATA]: {
                affects: [
                    this.NAMESPACES.QUERY_RESULTS,
                    this.NAMESPACES.INVENTORY,
                    this.NAMESPACES.PACK_LISTS,
                    this.NAMESPACES.PROD_SCHEDULE
                ]
            },
            [this.NAMESPACES.SHEET_TABS]: {
                affects: [
                    this.NAMESPACES.SHEET_DATA,
                    this.NAMESPACES.QUERY_RESULTS,
                    this.NAMESPACES.PACK_LISTS
                ]
            },
            [this.NAMESPACES.PROD_SCHEDULE]: {
                affects: [this.NAMESPACES.PACK_LISTS, this.NAMESPACES.INVENTORY]
            },
            [this.NAMESPACES.PACK_LISTS]: {
                affects: [this.NAMESPACES.INVENTORY]
            },
            [this.NAMESPACES.INVENTORY]: {
                affects: []
            }
        };
    }
    
    // Private helper methods
    static _invalidateDependents(namespace, key) {
        const nsMap = this._dependencyMap.get(namespace);
        if (!nsMap) return;
        
        const keyDependents = nsMap.get(key) || [];
        const namespaceDependents = nsMap.get('*') || [];
        const allDependents = [...keyDependents, ...namespaceDependents];
        
        const processed = new Set();
        for (const dep of allDependents) {
            const depKey = `${dep.namespace}:${dep.key}`;
            if (processed.has(depKey)) continue;
            processed.add(depKey);
            
            const depNamespaceCache = this._getNamespace(dep.namespace);
            if (depNamespaceCache.has(dep.key)) {
                depNamespaceCache.delete(dep.key);
                this._invalidateDependents(dep.namespace, dep.key);
            }
        }
    }
    
    static _getNamespace(namespace) {
        if (!this._cacheStore.has(namespace)) {
            this._cacheStore.set(namespace, new Map());
        }
        return this._cacheStore.get(namespace);
    }
    
    static _formatKey(key) {
        if (typeof key === 'object') {
            return JSON.stringify(key);
        }
        return String(key);
    }
}

/**
 * Enhanced cache decorator with dependency tracking
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
            
            // Check cache first
            const cachedValue = CacheManager.get(namespace, key);
            if (cachedValue !== null) {
                return cachedValue;
            }
            
            // Create a tracking ID for this method call
            const trackingId = CacheManager.beginTracking(`${methodName}_${Date.now()}`);
            
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

// Export convenience functions that delegate to CacheManager
export const applyTracking = (classObj) => CacheManager.applyTracking(classObj);
export const withTracking = (method, methodName) => CacheManager.withTracking(method, methodName);
export const getCurrentTrackingId = () => CacheManager.getCurrentTrackingId();