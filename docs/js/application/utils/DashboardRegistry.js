// Simple dashboard registry that works with existing reactive store system
import { authState } from './auth.js';
import { getReactiveStore } from './reactiveStores.js';
import { Requests } from '../../data_management/api.js';

export const DashboardRegistry = {
    store: null,
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

        } catch (error) {
            console.error('Failed to initialize dashboard registry:', error);
        }
    },

    /**
     * Check if dashboard is loading for the first time
     */
    get isLoading() {
        return this.store?.isLoading;
    },

    /**
     * Check if this is the initial load (first time loading dashboard data)
     */
    get isInitialLoad() {
        return this.store?.initialLoad && this.store?.isLoading;
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
     * Compares clean paths (without parameters) for matching
     */
    has(containerPathWithParams) {
        const cleanPathToCheck = containerPathWithParams.split('?')[0];
        return this.containerIds.some(id => id.split('?')[0] === cleanPathToCheck);
    },

    /**
     * Get container metadata (for classes like wide/tall)
     * Compares clean paths (without parameters) for matching
     */
    getContainer(containerPathWithParams) {
        const cleanPathToCheck = containerPathWithParams.split('?')[0];
        return this.containers.find(container => {
            const containerPath = typeof container === 'string' ? container : container.path;
            return containerPath.split('?')[0] === cleanPathToCheck;
        });
    },

    /**
     * Add container to dashboard
     * Stores full path including parameters
     */
    async add(containerPathWithParams) {
        if (!this.has(containerPathWithParams)) {
            // Add as object with metadata
            const newContainer = {
                path: containerPathWithParams,
                classes: ''
            };
            this.store.data.push(newContainer);
            await this.save();
        }
    },

    /**
     * Update existing container's path with new parameters
     * This allows dashboard containers to preserve parameter state
     */
    async updatePath(cleanPath, newPathWithParams) {
        const index = this.store.data.findIndex(container => {
            const containerPath = typeof container === 'string' ? container : container.path;
            return containerPath.split('?')[0] === cleanPath;
        });
        
        if (index > -1) {
            if (typeof this.store.data[index] === 'string') {
                this.store.data[index] = newPathWithParams;
            } else {
                this.store.data[index].path = newPathWithParams;
            }
            await this.save();
        }
    },

    /**
     * Remove container from dashboard
     * Compares clean paths (without parameters) for matching
     */
    async remove(containerPathWithParams) {
        const cleanPathToRemove = containerPathWithParams.split('?')[0];
        const index = this.store.data.findIndex(container => {
            const containerPath = typeof container === 'string' ? container : container.path;
            return containerPath.split('?')[0] === cleanPathToRemove;
        });
        if (index > -1) {
            this.store.data.splice(index, 1);
            await this.save();
        }
    },

    /**
     * Toggle a CSS class on a container
     */
    async toggleClass(containerPathWithParams, className) {
        const cleanPath = containerPathWithParams.split('?')[0];
        const container = this.getContainer(containerPathWithParams);
        if (!container) return;

        // Ensure container is an object with classes property
        if (typeof container === 'string') {
            // Convert string ID to object
            const index = this.store.data.findIndex(c => {
                const path = typeof c === 'string' ? c : c.path;
                return path.split('?')[0] === cleanPath;
            });
            if (index > -1) {
                this.store.data[index] = { path: containerPathWithParams, classes: '' };
            }
        }

        const containerObj = this.getContainer(containerPathWithParams);
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
        this.store = null;
    }
};