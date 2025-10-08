// Simple dashboard registry that works with existing reactive store system
import { authState } from './auth.js';
import { getReactiveStore } from './reactiveStores.js';
import { Requests } from '../../data_management/api.js';

export const DashboardRegistry = {
    store: null,
    isInitiallyLoaded: false,
    saveTimeout: null,
    SAVE_DELAY_MS: 5000, // 5 seconds
    
    /**
     * Initialize the dashboard registry
     */
    async initialize() {
        if (!authState.isAuthenticated || !authState.user?.email) {
            return;
        }
        
        try {
            // Use existing reactive store system
            this.store = getReactiveStore(
                Requests.getUserData,
                Requests.storeUserData,
                [authState.user.email, 'dashboard_containers']
            );
            
            await this.store.load();
            this.isInitiallyLoaded = true;

        } catch (error) {
            console.error('Failed to initialize dashboard registry:', error);
        }
    },

    /**
     * Check if dashboard is loading for the first time
     */
    get isLoading() {
        return !this.isInitiallyLoaded && this.store?.isLoading;
    },

    /**
     * Get loading message (only shown during initial load)
     */
    get loadingMessage() {
        return this.isLoading ? (this.store?.loadingMessage || 'Loading dashboard...') : '';
    },

    /**
     * Get all dashboard containers
     */
    get containers() {
        return this.store?.data || [];
    },

    /**
     * Get container IDs in order
     */
    get containerIds() {
        return this.containers.map(container => 
            typeof container === 'string' ? container : container.path
        );
    },

    /**
     * Check if a container is on the dashboard
     */
    has(containerId) {
        return this.containerIds.includes(containerId);
    },

    /**
     * Get container metadata (for classes like wide/tall)
     */
    getContainer(containerId) {
        return this.containers.find(container => 
            (typeof container === 'string' ? container : container.path) === containerId
        );
    },

    /**
     * Add container to dashboard
     */
    async add(containerId) {
        if (!this.has(containerId)) {
            // Add as object with metadata
            const newContainer = {
                path: containerId,
                classes: ''
            };
            this.store.data.push(newContainer);
            await this.save();
        }
    },

    /**
     * Remove container from dashboard
     */
    async remove(containerId) {
        const index = this.store.data.findIndex(container => 
            (typeof container === 'string' ? container : container.path) === containerId
        );
        if (index > -1) {
            this.store.data.splice(index, 1);
            await this.save();
        }
    },

    /**
     * Toggle a CSS class on a container
     */
    async toggleClass(containerId, className) {
        const container = this.getContainer(containerId);
        if (!container) return;

        // Ensure container is an object with classes property
        if (typeof container === 'string') {
            // Convert string ID to object
            const index = this.store.data.findIndex(c => c === containerId);
            if (index > -1) {
                this.store.data[index] = { path: containerId, classes: '' };
            }
        }

        const containerObj = this.getContainer(containerId);
        if (!containerObj) return;

        const classes = new Set(containerObj.classes ? containerObj.classes.split(' ').filter(c => c.length > 0) : []);
        
        if (classes.has(className)) {
            classes.delete(className);
        } else {
            classes.add(className);
        }
        
        containerObj.classes = Array.from(classes).join(' ');
        await this.save();
    },

    /**
     * Move container left in the dashboard order
     */
    async moveLeft(containerId) {
        const index = this.store.data.findIndex(container => 
            (typeof container === 'string' ? container : container.path) === containerId
        );
        
        if (index > 0) {
            // Swap with previous item
            [this.store.data[index - 1], this.store.data[index]] = 
            [this.store.data[index], this.store.data[index - 1]];
            await this.save();
        }
    },

    /**
     * Move container right in the dashboard order
     */
    async moveRight(containerId) {
        const index = this.store.data.findIndex(container => 
            (typeof container === 'string' ? container : container.path) === containerId
        );
        
        if (index > -1 && index < this.store.data.length - 1) {
            // Swap with next item
            [this.store.data[index], this.store.data[index + 1]] = 
            [this.store.data[index + 1], this.store.data[index]];
            await this.save();
        }
    },

    /**
     * Get CSS classes for a container
     */
    getClasses(containerId) {
        const container = this.getContainer(containerId);
        if (!container || typeof container === 'string') return '';
        return container.classes || '';
    },

    /**
     * Save dashboard state with debouncing
     */
    async save() {
        if (this.store && typeof this.store.save === 'function') {
            // Clear any existing timeout
            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
            }
            
            // Set new timeout for delayed save
            this.saveTimeout = setTimeout(async () => {
                try {
                    await this.store.save();
                    console.log('[DashboardRegistry] Dashboard saved successfully');
                } catch (error) {
                    console.error('[DashboardRegistry] Failed to save dashboard:', error);
                }
                this.saveTimeout = null;
            }, this.SAVE_DELAY_MS);
            
            console.log('[DashboardRegistry] Dashboard save queued for', this.SAVE_DELAY_MS, 'ms');
        }
    },

    /**
     * Save dashboard immediately (for critical operations)
     */
    async saveNow() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        
        if (this.store && typeof this.store.save === 'function') {
            try {
                await this.store.save();
                console.log('[DashboardRegistry] Dashboard saved immediately');
            } catch (error) {
                console.error('[DashboardRegistry] Failed to save dashboard immediately:', error);
            }
        }
    },

    /**
     * Cleanup any pending saves and reset state
     */
    cleanup() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        this.isInitiallyLoaded = false;
        this.store = null;
    }
};