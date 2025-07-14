import { html } from './template-helpers.js';
import { NavigationConfig } from './navigation.js';

/**
 * Dashboard Management Module
 * Provides modular dashboard functionality that can be used across components
 */
export const DashboardManagement = {
    /**
     * Add a container to the dashboard
     * @param {string} containerType - The container type
     * @param {string} containerPath - The path/location for the container
     * @param {Object} appContext - App context with methods
     */
    addToDashboard(containerType, containerPath, appContext) {
        if (appContext.addToDashboard) {
            appContext.addToDashboard(containerType, containerPath);
        }
    },

    /**
     * Remove a container from the dashboard
     * @param {string} containerType - The container type to remove
     * @param {Object} appContext - App context with methods
     */
    removeFromDashboard(containerType, appContext) {
        if (appContext.removeDashboardContainer) {
            appContext.removeDashboardContainer(containerType);
        }
    },

    /**
     * Check if a container is on the dashboard
     * @param {string} containerType - The container type to check
     * @param {Object} appContext - App context with dashboard data
     * @returns {boolean} Whether the container is on dashboard
     */
    isOnDashboard(containerType, appContext) {
        if (appContext.dashboardContainers) {
            return appContext.dashboardContainers.some(dc => dc.type === containerType);
        }
        return NavigationConfig.hasDashboardContainer(containerType);
    },

    /**
     * Create a dashboard toggle button component
     * @param {string} containerType - The container type
     * @param {string} containerPath - The path for the container
     * @param {Object} appContext - App context
     * @returns {Object} Vue component for dashboard toggle
     */
    createDashboardToggleComponent(containerType, containerPath, appContext) {
        return {
            data() {
                return {
                    localIsOnDashboard: DashboardManagement.isOnDashboard(containerType, appContext)
                };
            },
            methods: {
                toggleDashboardPresence() {
                    if (this.localIsOnDashboard) {
                        DashboardManagement.removeFromDashboard(containerType, appContext);
                        this.localIsOnDashboard = false;
                    } else {
                        DashboardManagement.addToDashboard(containerType, containerPath, appContext);
                        this.localIsOnDashboard = true;
                    }
                }
            },
            template: html`
                <div style="border-top: 1px solid #ddd; margin-top: 10px; padding-top: 10px;">
                    <h5 style="margin: 0 0 5px 0;">Dashboard</h5>
                    <button 
                        @click="toggleDashboardPresence"
                        :style="{
                            width: '100%',
                            padding: '8px 12px',
                            background: localIsOnDashboard ? '#f44336' : '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }">
                        {{ localIsOnDashboard ? 'Remove from Dashboard' : 'Add to Dashboard' }}
                    </button>
                </div>
            `
        };
    }
};
