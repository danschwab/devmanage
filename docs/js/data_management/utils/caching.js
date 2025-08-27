/**
 * Default cache expiration in milliseconds
 */
const DEFAULT_CACHE_EXPIRATION_MS = 5 * 60 * 1000;


class CacheManager {
    static cache = new Map();
    static dependencies = new Map();
    
    // Context-aware dependency tracking system
    static _executionContexts = new Map(); // contextId -> { trackStack: [], activeTrack: Set }
    static _contextIdCounter = 0;
    static _currentContextId = null; // Track the current context for nested calls
    
    /**
     * Generates a unique context ID for this execution
     * @private
     * @returns {string} - Unique context identifier
     */
    static _generateContextId() {
        return `ctx_${++this._contextIdCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Gets the current context ID (for nested calls)
     * @private
     * @returns {string|null} - Current context identifier or null
     */
    static _getCurrentContextId() {
        return this._currentContextId;
    }
    
    /**
     * Sets the current context ID
     * @private
     * @param {string} contextId - Context identifier to set
     */
    static _setCurrentContext(contextId) {
        this._currentContextId = contextId;
    }
    
    /**
     * Clears the current context
     * @private
     */
    static _clearCurrentContext() {
        this._currentContextId = null;
    }
    
    /**
     * Generates a unique context ID for this execution
     * @private
     * @returns {string} - Unique context identifier
     */
    static _generateContextId() {
        return `ctx_${++this._contextIdCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Starts tracking dependencies for a specific execution context
     * @private
     * @param {string} contextId - Unique context identifier
     */
    static _startTracking(contextId) {
        if (!this._executionContexts.has(contextId)) {
            this._executionContexts.set(contextId, {
                trackStack: [],
                activeTrack: null
            });
        }
        
        const context = this._executionContexts.get(contextId);
        const deps = new Set();
        context.trackStack.push(deps);
        context.activeTrack = deps;
    }
    
    /**
     * Starts a new tracking level for direct dependencies only (nested calls)
     * @private
     * @param {string} contextId - Unique context identifier
     */
    static _startTrackingLevel(contextId) {
        const context = this._executionContexts.get(contextId);
        if (!context) return;
        
        const deps = new Set();
        context.trackStack.push(deps);
        context.activeTrack = deps;
    }
    
    /**
     * Stops tracking and returns collected dependencies for a specific context
     * @private
     * @param {string} contextId - Unique context identifier
     * @returns {Array} - Array of dependency keys
     */
    static _stopTracking(contextId) {
        const context = this._executionContexts.get(contextId);
        if (!context) return [];
        
        const deps = context.trackStack.pop();
        context.activeTrack = context.trackStack[context.trackStack.length - 1] || null;
        
        // Clean up context if no more tracking levels
        if (context.trackStack.length === 0) {
            this._executionContexts.delete(contextId);
        }
        
        return deps ? Array.from(deps) : [];
    }
    
    /**
     * Stops tracking level and returns only direct dependencies (for nested calls)
     * @private
     * @param {string} contextId - Unique context identifier
     * @returns {Array} - Array of direct dependency keys
     */
    static _stopTrackingLevel(contextId) {
        const context = this._executionContexts.get(contextId);
        if (!context) return [];
        
        const deps = context.trackStack.pop();
        context.activeTrack = context.trackStack[context.trackStack.length - 1] || null;
        
        // Return only the direct dependencies collected at this level
        return deps ? Array.from(deps) : [];
    }
    
    /**
     * Gets a value from cache with expiration check and context-aware dependency tracking
     * @param {string} key - Cache key
     * @param {string} contextId - Optional execution context ID for dependency tracking
     * @returns {*|null} - Cached value or null if not found/expired
     */
    static get(key, contextId = null) {
        // Use current context if no context provided and we're in a tracked execution
        const actualContextId = contextId || this._currentContextId;
        
        // Track dependency for the specific context (if provided or current)
        if (actualContextId) {
            const context = this._executionContexts.get(actualContextId);
            if (context && context.activeTrack) {
                context.activeTrack.add(key);
            }
        }
        
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        
        // Check expiration
        if (entry.expire && entry.expire < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        
        console.log(`[CacheManager] GET HIT: ${key} ${actualContextId ? `(ctx: ${actualContextId})` : ''}`);
        return entry.value;
    }
    
    /**
     * Sets a value in cache with default timeout and dependency registration
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} expirationMs - Expiration time in milliseconds (defaults to DEFAULT_CACHE_EXPIRATION_MS)
     * @param {Array} dependencies - Array of dependency keys this cache entry depends on
     */
    static set(key, value, expirationMs = DEFAULT_CACHE_EXPIRATION_MS, dependencies = []) {
        // Skip caching empty results or booleans
        if (
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === 'object' && value !== null && Object.keys(value).length === 0) ||
            (typeof value === 'boolean')
        ) {
            return;
        }
        
        this.cache.set(key, {
            value,
            expire: expirationMs ? Date.now() + expirationMs : null
        });
        
        // Register dependencies
        if (dependencies.length > 0) {
            this.dependencies.set(key, dependencies);
            console.log(`[CacheManager] SET DEPS: ${key} -> [ ${dependencies.join(' | ')} ]`);
        }
        
        console.log(`[CacheManager] SET: ${key} (expires in ${expirationMs}ms)`);
    }
    
    /**
     * Invalidates a cache entry and all dependent entries
     * @param {string} key - Cache key to invalidate
     * @param {Set} invalidationStack - Set of keys currently being invalidated (to prevent recursion)
     */
    static invalidate(key, invalidationStack = new Set()) {
        // Prevent infinite recursion - if this key is already being invalidated, skip it
        if (invalidationStack.has(key)) {
            console.log(`[CacheManager] SKIP INVALIDATE (already in progress): ${key}`);
            return;
        }
        
        // Add this key to the invalidation stack
        invalidationStack.add(key);
        
        // Remove the cache entry
        this.cache.delete(key);
        console.log(`[CacheManager] INVALIDATE: ${key}`);
        
        // Find and invalidate all dependent entries
        const dependents = [];
        for (const [depKey, deps] of this.dependencies.entries()) {
            if (deps.includes(key)) {
                dependents.push(depKey);
            }
        }
        
        if (dependents.length > 0) {
            console.log(`[CacheManager] INVALIDATE: ${key} has dependents: [${dependents.join(', ')}]`);
        }
        
        // Recursively invalidate dependents with the same invalidation stack
        for (const depKey of dependents) {
            this.invalidate(depKey, invalidationStack);
        }
        
        // Clean up dependency registration
        this.dependencies.delete(key);
        
        // Remove from invalidation stack when done
        invalidationStack.delete(key);
    }
    
    /**
     * Invalidates all cache entries that start with a given prefix
     * @param {string} prefix - Cache key prefix to match
     */
    static invalidateByPrefix(prefix) {
        console.log(`[CacheManager] INVALIDATE BY PREFIX: ${prefix}`);
        
        // Find all cache keys that start with the prefix
        const keysToInvalidate = [];
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                keysToInvalidate.push(key);
            }
        }
        
        // Invalidate each matching key (this will also handle dependents)
        for (const key of keysToInvalidate) {
            this.invalidate(key);
        }
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
        return `${namespace}:${methodName}:${argsString}`;
    }

    /**
     * Invalidates specific cache entries
     * @param {Array<{namespace: string, methodName: string, args: Array}>} cacheEntries - Array of cache entries to invalidate
     * @param {boolean} invalidateByPrefix - If true, invalidates all caches that start with the cache key prefix
     */
    static invalidateCache(cacheEntries, invalidateByPrefix = false) {
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
     * Wraps all static methods of a class with caching and direct dependency tracking
     * @param {Object} targetClass - The class to wrap
     * @param {string} namespace - Cache namespace
     * @returns {Object} - Wrapped class with caching and dependency tracking
     */
    static wrapMethods(targetClass, namespace) {
        const wrappedClass = {};
        
        // Get all static methods
        const methods = Object.getOwnPropertyNames(targetClass)
            .filter(name => typeof targetClass[name] === 'function' && name !== 'constructor');
        
        methods.forEach(methodName => {
            wrappedClass[methodName] = async function(...args) {
                const cacheKey = CacheManager.generateCacheKey(namespace, methodName, args);
                
                // Check cache first - use any existing context or create new one
                let contextId = CacheManager._getCurrentContextId();
                const isNewContext = !contextId;
                
                if (isNewContext) {
                    contextId = CacheManager._generateContextId();
                }
                
                const cached = CacheManager.get(cacheKey, contextId);
                if (cached !== null) {
                    return cached;
                }
                
                // Start tracking dependencies for this specific context (only if new)
                if (isNewContext) {
                    CacheManager._startTracking(contextId);
                } else {
                    // For nested calls, start a new tracking level to capture only direct dependencies
                    CacheManager._startTrackingLevel(contextId);
                }
                
                try {
                    // Set current context for nested calls
                    CacheManager._setCurrentContext(contextId);
                    
                    // Execute method directly
                    const result = await targetClass[methodName](...args);
                    
                    // Stop tracking and get collected dependencies (only direct ones)
                    const dependencies = isNewContext 
                        ? CacheManager._stopTracking(contextId)
                        : CacheManager._stopTrackingLevel(contextId);
                    
                    // Cache result with dependencies
                    CacheManager.set(cacheKey, result, DEFAULT_CACHE_EXPIRATION_MS, dependencies);
                    
                    return result;
                } catch (error) {
                    // Ensure tracking is stopped even if method fails
                    if (isNewContext) {
                        CacheManager._stopTracking(contextId);
                    } else {
                        CacheManager._stopTrackingLevel(contextId);
                    }
                    throw error;
                } finally {
                    // Clear current context if we set it
                    if (isNewContext) {
                        CacheManager._clearCurrentContext();
                    }
                }
            };
        });
        
        return wrappedClass;
    }
}

export const wrapMethods = CacheManager.wrapMethods;
export const invalidateCache = CacheManager.invalidateCache;
export const invalidateByPrefix = CacheManager.invalidateByPrefix;