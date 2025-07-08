/**
 * General-purpose notification system for application-wide events
 */
export class NotificationManager {
    // Event listeners storage: { eventType: [callbacks] }
    static _listeners = new Map();
    
    // Event history for late subscribers (limited size)
    static _eventHistory = [];
    static _maxHistorySize = 50;
    
    // Event categories
    static CATEGORIES = {
        AUTH: 'auth',           // Authentication events
        DATA: 'data',           // Data loading/saving events
        UI: 'ui',               // UI-related events
        ERROR: 'error',         // Error events
        SYSTEM: 'system',       // System events
        INVENTORY: 'inventory', // Inventory-specific events
        SCHEDULE: 'schedule'    // Schedule-specific events
    };
    
    /**
     * Subscribe to events
     * @param {string} eventType - Event type to subscribe to (can use wildcards: *)
     * @param {function(Object)} callback - Callback function receiving event object
     * @param {Object} [options] - Subscription options
     * @param {boolean} [options.receiveHistory=false] - Whether to receive past events immediately
     * @param {number} [options.priority=0] - Listener priority (higher = earlier execution)
     * @returns {string} Subscription ID for unsubscribing
     */
    static subscribe(eventType, callback, options = {}) {
        const { receiveHistory = false, priority = 0 } = options;
        
        // Generate a unique subscription ID
        const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        // Initialize the event type array if it doesn't exist
        if (!this._listeners.has(eventType)) {
            this._listeners.set(eventType, []);
        }
        
        // Add the callback to the listeners
        const listeners = this._listeners.get(eventType);
        listeners.push({
            id: subscriptionId,
            callback,
            priority
        });
        
        // Sort listeners by priority (higher priority first)
        listeners.sort((a, b) => b.priority - a.priority);
        
        // Send history if requested
        if (receiveHistory && this._eventHistory.length > 0) {
            const matchingEvents = this._eventHistory.filter(event => 
                this._eventTypeMatches(event.type, eventType)
            );
            
            // Send past events asynchronously to avoid blocking
            if (matchingEvents.length > 0) {
                setTimeout(() => {
                    matchingEvents.forEach(event => {
                        try {
                            callback(event);
                        } catch (error) {
                            console.error(`Error in history event handler for ${event.type}:`, error);
                        }
                    });
                }, 0);
            }
        }
        
        return subscriptionId;
    }
    
    /**
     * Unsubscribe from events
     * @param {string} subscriptionId - Subscription ID returned by subscribe
     * @returns {boolean} Whether the subscription was found and removed
     */
    static unsubscribe(subscriptionId) {
        let found = false;
        
        // Check all event types for the subscription ID
        for (const [eventType, listeners] of this._listeners.entries()) {
            const index = listeners.findIndex(listener => listener.id === subscriptionId);
            if (index >= 0) {
                listeners.splice(index, 1);
                found = true;
                
                // Clean up empty event types
                if (listeners.length === 0) {
                    this._listeners.delete(eventType);
                }
                break;
            }
        }
        
        return found;
    }
    
    /**
     * Publish an event to all subscribers
     * @param {string} eventType - Event type
     * @param {Object} [data={}] - Event data
     * @param {Object} [options] - Publication options
     * @param {boolean} [options.saveToHistory=true] - Whether to save event to history
     */
    static publish(eventType, data = {}, options = {}) {
        const { saveToHistory = true } = options;
        
        // Create the event object
        const event = {
            type: eventType,
            timestamp: Date.now(),
            data
        };
        
        // Save to history if enabled
        if (saveToHistory) {
            this._eventHistory.push(event);
            
            // Trim history if needed
            if (this._eventHistory.length > this._maxHistorySize) {
                this._eventHistory.shift();
            }
        }
        
        // Notify all matching subscribers
        this._notifySubscribers(event);
    }
    
    /**
     * Clear event history
     * @param {string} [eventType] - Optional event type to clear (or all if not specified)
     */
    static clearHistory(eventType = null) {
        if (eventType) {
            this._eventHistory = this._eventHistory.filter(event => 
                !this._eventTypeMatches(event.type, eventType)
            );
        } else {
            this._eventHistory = [];
        }
    }
    
    /**
     * Get event history
     * @param {string} [eventType] - Optional event type filter
     * @param {number} [limit] - Maximum number of events to return (newest first)
     * @returns {Array<Object>} Matching events
     */
    static getHistory(eventType = null, limit = null) {
        let events = eventType ? 
            this._eventHistory.filter(event => this._eventTypeMatches(event.type, eventType)) : 
            [...this._eventHistory];
            
        // Sort by timestamp (newest first)
        events.sort((a, b) => b.timestamp - a.timestamp);
        
        // Apply limit if specified
        if (limit && limit > 0 && limit < events.length) {
            events = events.slice(0, limit);
        }
        
        return events;
    }
    
    /**
     * Configure notification manager
     * @param {Object} options - Configuration options
     * @param {number} [options.maxHistorySize] - Maximum history size
     */
    static configure(options) {
        if (typeof options.maxHistorySize === 'number') {
            this._maxHistorySize = Math.max(0, options.maxHistorySize);
            
            // Trim history if needed after changing size
            if (this._eventHistory.length > this._maxHistorySize) {
                this._eventHistory = this._eventHistory.slice(-this._maxHistorySize);
            }
        }
    }
    
    /**
     * Check if event type matches the subscription pattern
     * @param {string} eventType - Actual event type
     * @param {string} pattern - Subscription pattern (can contain wildcards)
     * @returns {boolean} Whether the event matches the pattern
     * @private
     */
    static _eventTypeMatches(eventType, pattern) {
        // Handle wildcards
        if (pattern === '*') return true;
        
        // Handle category wildcards (e.g., "auth:*")
        if (pattern.endsWith(':*')) {
            const category = pattern.slice(0, -2);
            return eventType.startsWith(category + ':');
        }
        
        // Direct match
        return eventType === pattern;
    }
    
    /**
     * Notify all subscribers that match the event type
     * @param {Object} event - Event object
     * @private
     */
    static _notifySubscribers(event) {
        // Find all matching subscription patterns
        for (const [pattern, listeners] of this._listeners.entries()) {
            if (this._eventTypeMatches(event.type, pattern)) {
                // Notify each listener
                listeners.forEach(({ callback }) => {
                    try {
                        callback(event);
                    } catch (error) {
                        console.error(`Error in event handler for ${event.type}:`, error);
                    }
                });
            }
        }
    }
}

// Common notification types
export const NOTIFICATIONS = {
    // Authentication events
    AUTH_INITIALIZED: 'auth:initialized',
    AUTH_STARTED: 'auth:started',
    AUTH_SUCCESS: 'auth:success',
    AUTH_ERROR: 'auth:error',
    AUTH_SIGNOUT: 'auth:signout',
    
    // Data events
    DATA_LOADING: 'data:loading',
    DATA_LOADED: 'data:loaded',
    DATA_ERROR: 'data:error',
    DATA_SAVING: 'data:saving',
    DATA_SAVED: 'data:saved',
    DATA_REFRESHED: 'data:refreshed',
    
    // UI events
    UI_VIEW_CHANGE: 'ui:view_change',
    UI_MODAL_OPEN: 'ui:modal_open',
    UI_MODAL_CLOSE: 'ui:modal_close',
    UI_FORM_SUBMIT: 'ui:form_submit',
    UI_STATE_CHANGE: 'ui:state_change',
    
    // Inventory events
    INVENTORY_UPDATED: 'inventory:updated',
    INVENTORY_ITEM_CHANGED: 'inventory:item_changed',
    INVENTORY_CHECK: 'inventory:check_complete',
    
    // Schedule events
    SCHEDULE_UPDATED: 'schedule:updated',
    SCHEDULE_OVERLAP_CHECK: 'schedule:overlap_check',
    
    // System events
    SYSTEM_ERROR: 'system:error',
    SYSTEM_WARNING: 'system:warning',
    SYSTEM_INFO: 'system:info',
    SYSTEM_READY: 'system:ready',
    SYSTEM_CACHE_CLEARED: 'system:cache_cleared'
};
