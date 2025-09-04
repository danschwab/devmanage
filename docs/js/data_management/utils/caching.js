/**
 * Default cache expiration in milliseconds
 */
const DEFAULT_CACHE_EXPIRATION_MS = 5 * 60 * 1000;


class CacheManager {
    static cache = new Map();
    static dependencies = new Map();
    static pendingCalls = new Map(); // Maps cache keys to pending promises to prevent duplicate concurrent calls
    
    /**
     * Gets a value from cache with expiration check
     * @param {string} key - Cache key
     * @returns {*|null} - Cached value or null if not found/expired
     */
    static get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        
        // Check expiration
        if (entry.expire && entry.expire < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        
        console.log(`[CacheManager] GET HIT: ${key}`);
        return entry.value;
    }
    
    /**
     * Sets a value in cache with default timeout
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} expirationMs - Expiration time in milliseconds (defaults to DEFAULT_CACHE_EXPIRATION_MS)
     */
    static set(key, value, expirationMs = DEFAULT_CACHE_EXPIRATION_MS) {
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
        
        console.log(`[CacheManager] SET: ${key} (expires in ${expirationMs}ms)`);
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
                // Execute the wrapped function
                const result = await wrappedFunction(...args);
                
                // Generate the cache key for the called function
                // This assumes the wrapped function has a _cacheKey property or we can derive it
                const calledKey = wrappedFunction._lastCacheKey;
                
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
        if (!this.dependencies.has(dependentKey)) {
            this.dependencies.set(dependentKey, new Set());
        }
        this.dependencies.get(dependentKey).add(dependencyKey);
        console.log(`[CacheManager] DEPENDENCY: ${dependentKey} -> ${dependencyKey}`);
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
        
        // Also clean up any pending calls for this key
        if (this.pendingCalls.has(key)) {
            this.pendingCalls.delete(key);
            console.log(`[CacheManager] CLEANED UP PENDING CALL: ${key}`);
        }
        
        console.log(`[CacheManager] INVALIDATE: ${key}`);
        
        // Find and invalidate all dependent entries
        const dependents = [];
        for (const [depKey, deps] of this.dependencies.entries()) {
            if (deps.has && deps.has(key)) {
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
     * Wraps all static methods of a class with caching and automatic dependency decorator
     * @param {Object} targetClass - The class to wrap
     * @param {string} namespace - Cache namespace
     * @param {Array<string>} [mutationKeys] - Array of method names to skip wrapping (mutation methods)
     * @returns {Object} - Wrapped class with caching and dependency tracking
     */
    static wrapMethods(targetClass, namespace, mutationKeys = []) {
        const wrappedClass = {};
        
        // Get all static methods
        const methods = Object.getOwnPropertyNames(targetClass)
            .filter(name => typeof targetClass[name] === 'function' && name !== 'constructor');
        
        methods.forEach(methodName => {
            // Skip wrapping for mutation methods - call them directly
            if (mutationKeys.includes(methodName)) {
                wrappedClass[methodName] = targetClass[methodName];
                return;
            }
            
            wrappedClass[methodName] = async function(...args) {
                const cacheKey = CacheManager.generateCacheKey(namespace, methodName, args);
                
                // Store the cache key on the function for dependency tracking
                wrappedClass[methodName]._lastCacheKey = cacheKey;
                
                // Check cache first
                const cached = CacheManager.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                
                // Check if there's already a pending call for this cache key
                if (CacheManager.pendingCalls.has(cacheKey)) {
                    console.log(`[CacheManager] AWAITING PENDING: ${cacheKey}`);
                    return await CacheManager.pendingCalls.get(cacheKey);
                }
                
                // Create and store the promise for this function call
                const promise = (async () => {
                    try {
                        // Create dependency decorator for this function call
                        const deps = CacheManager.createDependencyDecorator(cacheKey);
                        
                        // Execute method with dependency decorator as first parameter
                        const result = await targetClass[methodName](deps, ...args);
                        CacheManager.set(cacheKey, result);
                        
                        return result;
                    } finally {
                        // Always clean up the pending call when done
                        CacheManager.pendingCalls.delete(cacheKey);
                    }
                })();
                
                // Store the promise to prevent duplicate concurrent calls
                CacheManager.pendingCalls.set(cacheKey, promise);
                
                return await promise;
            };
        });
        
        return wrappedClass;
    }
}

export const wrapMethods = CacheManager.wrapMethods;
export const invalidateCache = CacheManager.invalidateCache;
export const invalidateByPrefix = CacheManager.invalidateByPrefix;
export const setCacheDependency = CacheManager.createDependencyDecorator;