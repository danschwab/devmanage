import { html, DashboardToggleComponent } from '../index.js';

const { reactive } = Vue;

// Dashboard Management Component for settings
const DashboardManagementComponent = {
    inject: ['appContext'],
    data() {
        return {
            availablePaths: []
        };
    },
    mounted() {
        this.updateAvailablePaths();
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
            const newPaths = this.appContext.getAllPathsWithStatus?.() || [];
            if (JSON.stringify(newPaths) !== JSON.stringify(this.availablePaths)) {
                this.availablePaths = newPaths;
            }
        },
        handleAddPath(path, title) {
            this.appContext.addToDashboard?.(path, title);
            this.$nextTick(() => {
                this.updateAvailablePaths();
            });
        },
        handleRemovePath(path) {
            this.appContext.removeDashboardContainer?.(path);
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

// Hamburger Menu Registry
export class HamburgerMenuRegistry {
    constructor() {
        this.menus = reactive(new Map());
        this.setupDefaultMenus();
    }

    setupDefaultMenus() {
        // Dashboard Settings gets the management component
        this.menus.set('dashboard-settings', {
            components: [DashboardManagementComponent],
            props: {}
        });

        // Default fallback for other containers
        this.defaultMenu = {
            components: [DashboardToggleComponent],
            props: {}
        };
    }

    registerMenu(containerType, menuConfig) {
        // Ensure all components from defaultMenu are included
        this.defaultMenu.components.forEach(component => {
            if (!menuConfig.components.includes(component)) {
                menuConfig.components = [...menuConfig.components, component];
            }
        });
        this.menus.set(containerType, menuConfig);
    }

    getMenuComponent(containerType, containerPath = '') {
        // Check for exact container type match first
        if (this.menus.has(containerType)) {
            const menu = this.menus.get(containerType);
            return {
                components: menu.components,
                props: {
                    ...menu.props,
                    containerPath,
                    currentView: this.getCurrentView(containerPath)
                }
            };
        }

        // Check for path-based matches
        if (containerPath) {
            const segments = containerPath.split('/').filter(s => s.length > 0);
            const basePath = segments[0];
            
            if (this.menus.has(basePath)) {
                const menu = this.menus.get(basePath);
                return {
                    components: menu.components,
                    props: {
                        ...menu.props,
                        containerPath,
                        currentView: this.getCurrentView(containerPath)
                    }
                };
            }
        }

        // Return default menu for containers that need dashboard toggle
        if (containerType !== 'dashboard-settings') {
            return {
                components: this.defaultMenu.components,
                props: {
                    ...this.defaultMenu.props,
                    containerPath: containerPath || containerType,
                    title: containerType.charAt(0).toUpperCase() + containerType.slice(1)
                }
            };
        }

        return null;
    }

    getCurrentView(containerPath) {
        if (!containerPath) return '';
        const segments = containerPath.split('/').filter(s => s.length > 0);
        return segments.length > 0 ? segments[segments.length - 1] : '';
    }
}

// Create global instance
export const hamburgerMenuRegistry = new HamburgerMenuRegistry();
