import { html, NavigationConfig } from '../../index.js';


// Dashboard Management Component (fully reactive)
export const DashboardManagementComponent = {
    props: {
        getAllPathsWithStatus: Function,
        addToDashboard: Function,
        removeDashboardContainer: Function
    },
    data() {
        return {
            availablePaths: []
        };
    },
    mounted() {
        this.updateAvailablePaths();
        // Poll for changes to ensure reactivity
        this.interval = setInterval(() => {
            this.updateAvailablePaths();
        }, 100);
    },
    beforeUnmount() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    },
    methods: {
        updateAvailablePaths() {
            const newPaths = this.getAllPathsWithStatus?.() || [];
            // Only update if actually changed to avoid unnecessary re-renders
            if (JSON.stringify(newPaths) !== JSON.stringify(this.availablePaths)) {
                this.availablePaths = newPaths;
            }
        },
        handleAddPath(path, title) {
            this.addToDashboard?.(path, title);
            // Force immediate update
            this.$nextTick(() => {
                this.updateAvailablePaths();
            });
        },
        handleRemovePath(path) {
            this.removeDashboardContainer?.(path);
            // Force immediate update
            this.$nextTick(() => {
                this.updateAvailablePaths();
            });
        }
    },
    template: html`
        <div style="text-align: left;">
            <h4>Dashboard Management</h4>
            <p><strong>Available Paths:</strong></p>
            <div v-for="{ path, isAdded, displayName } in availablePaths" :key="path">
                <button 
                    @click="isAdded ? handleRemovePath(path) : handleAddPath(path, displayName)"
                    :class="{ 'red': isAdded, 'green': !isAdded }">
                    {{ isAdded ? 'Remove' : 'Add' }} {{ displayName }}
                </button>
                <br>
            </div>
        </div>
    `
};

/**
 * Dashboard Management Module
 * Provides modular dashboard functionality that can be used across components
 */
export const DashboardManagement = {
    /**
     * Add a path to the dashboard
     * @param {string} containerPath - The path to add to dashboard
     * @param {string} title - Optional title for the dashboard card
     * @param {Object} appContext - App context with methods
     */
    addToDashboard(containerPath, title, appContext) {
        console.log('DashboardManagement.addToDashboard called:', containerPath, title);
        if (appContext.addToDashboard) {
            appContext.addToDashboard(containerPath, title);
        }
    },

    /**
     * Remove a path from the dashboard
     * @param {string} containerPath - The path to remove from dashboard
     * @param {Object} appContext - App context with methods
     */
    removeFromDashboard(containerPath, appContext) {
        console.log('DashboardManagement.removeFromDashboard called:', containerPath);
        if (appContext.removeDashboardContainer) {
            appContext.removeDashboardContainer(containerPath);
        }
    },

    /**
     * Check if a path is on the dashboard
     * @param {string} containerPath - The path to check
     * @param {Object} appContext - App context with dashboard data
     * @returns {boolean} Whether the path is on dashboard
     */
    isOnDashboard(containerPath, appContext) {
        if (appContext.dashboardContainers) {
            return appContext.dashboardContainers.some(dc => dc.path === containerPath);
        }
        return NavigationConfig.hasDashboardContainer(containerPath);
    }
};

/**
 * Standard Vue component for dashboard toggle functionality
 */
export const DashboardToggleComponent = {
    props: {
        containerPath: {
            type: String,
            required: true
        },
        title: {
            type: String,
            required: true
        }
    },
    inject: ['appContext'],
    computed: {
        dashboardContainers() {
            return this.appContext.dashboardContainers || [];
        },
        isOnDashboard() {
            const result = this.dashboardContainers.some(dc => dc.path === this.containerPath);
            console.log('DashboardToggle: isOnDashboard computed for', this.containerPath, ':', result);
            console.log('DashboardToggle: Available dashboard paths:', this.dashboardContainers.map(dc => dc.path));
            return result;
        }
    },
    methods: {
        toggleDashboardPresence() {
            console.log('DashboardToggle: toggleDashboardPresence called');
            console.log('DashboardToggle: Current path:', this.containerPath);
            console.log('DashboardToggle: Current state (before toggle):', this.isOnDashboard);
            
            if (this.isOnDashboard) {
                console.log('DashboardToggle: Removing from dashboard');
                DashboardManagement.removeFromDashboard(this.containerPath, this.appContext);
            } else {
                console.log('DashboardToggle: Adding to dashboard');
                DashboardManagement.addToDashboard(this.containerPath, this.title, this.appContext);
            }
        }
    },
    template: html`
        <div style="border-top: 1px solid #ddd; margin-top: 10px; padding-top: 10px;">
            <button 
                @click="toggleDashboardPresence"
                :class="{ 'red': isOnDashboard, 'green': !isOnDashboard }">
                {{ isOnDashboard ? 'Remove from Dashboard' : 'Add to Dashboard' }}
            </button>
        </div>
    `
};