import { html } from './template-helpers.js';
import { NavigationConfig } from './navigation.js';

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