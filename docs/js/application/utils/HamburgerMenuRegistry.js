import { DashboardToggleComponent } from './DashboardManagement.js';

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
    template: `
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

// Inventory Menu Component
const InventoryMenuComponent = {
    inject: ['appContext'],
    props: {
        currentView: String,
        containerPath: String,
        title: String
    },
    computed: {
        menuItems() {
            switch (this.currentView) {
                case 'main':
                    return [
                        { label: 'Refresh Inventory', action: 'refreshInventory' },
                        { label: 'Add New Item', action: 'addInventoryItem' },
                        { label: 'Export All Items', action: 'exportInventory' },
                        { label: 'Inventory Settings', action: 'inventorySettings' }
                    ];
                case 'categories':
                    return [
                        { label: 'Add New Category', action: 'addNewCategory' },
                        { label: 'Manage Category Order', action: 'manageCategoryOrder' },
                        { label: 'Export Category Report', action: 'exportCategoryReport' },
                        { label: 'Category Settings', action: 'categorySettings' }
                    ];
                default:
                    return [
                        { label: 'Refresh', action: 'refreshInventory' },
                        { label: 'Help', action: 'inventoryHelp' }
                    ];
            }
        }
    },
    methods: {
        handleAction(action) {
            this.appContext.showAlert?.(`Action ${action} not implemented yet.`, 'Info');
        }
    },
    template: `
        <div>
            <div style="text-align: left;">
                <h4>Inventory Actions</h4>
                <ul style="list-style: none; padding: 0;">
                    <li v-for="item in menuItems" :key="item.action" style="margin-bottom: 5px;">
                        <button 
                            @click="handleAction(item.action)"
                            style="width: 100%; padding: 8px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; text-align: left;">
                            {{ item.label }}
                        </button>
                    </li>
                </ul>
            </div>
            <DashboardToggleComponent 
                :container-path="containerPath"
                :title="title" />
        </div>
    `,
    components: {
        DashboardToggleComponent
    }
};

// Hamburger Menu Registry
export class HamburgerMenuRegistry {
    constructor() {
        this.menus = reactive(new Map());
        this.setupDefaultMenus();
    }

    setupDefaultMenus() {
        // Dashboard Settings gets the management component
        this.registerMenu('dashboard-settings', {
            component: DashboardManagementComponent,
            props: {}
        });

        // Inventory gets inventory menu + dashboard toggle
        this.registerMenu('inventory', {
            component: InventoryMenuComponent,
            props: {
                currentView: 'main'
            }
        });

        // Default fallback for other containers
        this.registerDefaultMenu({
            component: DashboardToggleComponent,
            props: {}
        });
    }

    registerMenu(containerType, menuConfig) {
        this.menus.set(containerType, menuConfig);
    }

    registerDefaultMenu(menuConfig) {
        this.defaultMenu = menuConfig;
    }

    getMenuComponent(containerType, containerPath = '') {
        // Check for exact container type match first
        if (this.menus.has(containerType)) {
            const menu = this.menus.get(containerType);
            return {
                component: menu.component,
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
                    component: menu.component,
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
                component: this.defaultMenu.component,
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
        if (!containerPath) return 'main';
        const segments = containerPath.split('/').filter(s => s.length > 0);
        return segments[1] || 'main';
    }
}

// Create global instance
export const hamburgerMenuRegistry = new HamburgerMenuRegistry();
