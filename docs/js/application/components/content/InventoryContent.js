import { html, InventoryTableComponent, modalManager, hamburgerMenuRegistry, NavigationConfig, NavigationRegistry, Requests } from '../../index.js';
import { InventoryOverviewTableComponent } from './InventoryOverviewTable.js';

// Inventory Hamburger Menu Component (content only)
export const InventoryMenuComponent = {
    props: {
        currentView: String
    },
    computed: {
        menuItems() {
            switch (this.currentView) {
                case 'inventory':
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
                case 'search':
                    return [
                        { label: 'Save Search Criteria', action: 'saveSearchCriteria' },
                        { label: 'Load Saved Search', action: 'loadSavedSearch' },
                        { label: 'Export Search Results', action: 'exportSearchResults' },
                        { label: 'Clear Search History', action: 'clearSearchHistory' }
                    ];
                case 'reports':
                    return [
                        { label: 'Schedule Automatic Reports', action: 'scheduleReport' },
                        { label: 'Custom Report Builder', action: 'customReportBuilder' },
                        { label: 'Email Reports', action: 'emailReports' },
                        { label: 'Report Settings', action: 'reportSettings' }
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
            switch (action) {
                case 'refreshInventory':
                    modalManager.showAlert('Refreshing inventory...', 'Info');
                    break;
                case 'addInventoryItem':
                    modalManager.showConfirm(
                        'Do you want to add a new inventory item?',
                        () => modalManager.showAlert('Item added!', 'Success'),
                        () => modalManager.showAlert('Add cancelled.', 'Info'),
                        'Add Item'
                    );
                    break;
                case 'exportInventory':
                    modalManager.showAlert?.('Export all items functionality coming soon!', 'Info');
                    break;
                case 'inventorySettings':
                    modalManager.showAlert?.('Inventory settings functionality coming soon!', 'Info');
                    break;
                case 'addNewCategory':
                    modalManager.showAlert?.('Add new category functionality coming soon!', 'Info');
                    break;
                case 'manageCategoryOrder':
                    modalManager.showAlert?.('Manage category order functionality coming soon!', 'Info');
                    break;
                case 'exportCategoryReport':
                    modalManager.showAlert?.('Export category report functionality coming soon!', 'Info');
                    break;
                case 'categorySettings':
                    modalManager.showAlert?.('Category settings functionality coming soon!', 'Info');
                    break;
                case 'saveSearchCriteria':
                    modalManager.showAlert?.('Save search criteria functionality coming soon!', 'Info');
                    break;
                case 'loadSavedSearch':
                    modalManager.showAlert?.('Load saved search functionality coming soon!', 'Info');
                    break;
                case 'exportSearchResults':
                    modalManager.showAlert?.('Export search results functionality coming soon!', 'Info');
                    break;
                case 'clearSearchHistory':
                    modalManager.showAlert?.('Clear search history functionality coming soon!', 'Info');
                    break;
                case 'scheduleReport':
                    modalManager.showAlert?.('Schedule automatic reports functionality coming soon!', 'Info');
                    break;
                case 'customReportBuilder':
                    modalManager.showAlert?.('Custom report builder functionality coming soon!', 'Info');
                    break;
                case 'emailReports':
                    modalManager.showAlert?.('Email reports functionality coming soon!', 'Info');
                    break;
                case 'reportSettings':
                    modalManager.showAlert?.('Report settings functionality coming soon!', 'Info');
                    break;
                case 'inventoryHelp':
                    modalManager.showAlert?.('Inventory help functionality coming soon!', 'Info');
                    break;
                default:
                    modalManager.showAlert(`Action ${action} not implemented yet.`, 'Info');
            }
        }
    },
    template: html`
        <ul>
            <li v-for="item in menuItems" :key="item.action">
                <button 
                    @click="handleAction(item.action)">
                    {{ item.label }}
                </button>
            </li>
        </ul>
    `
};

export const InventoryContent = {
    components: {
        'inventory-table': InventoryTableComponent,
        'inventory-overview-table': InventoryOverviewTableComponent
    },
    props: {
        containerPath: {
            type: String,
            default: 'inventory'
        },
        navigateToPath: Function,
    },
    data() {
        return {
            categories: [] // loaded from spreadsheet
        };
    },
    computed: {
        pathSegments() {
            return this.containerPath.split('/').filter(segment => segment.length > 0);
        },
        currentView() {
            return this.pathSegments[1] || 'inventory';
        },
        currentCategory() {
            return this.pathSegments[2] || '';
        },
        // Expose NavigationConfig to the template
        NavigationConfig() {
            return NavigationConfig;
        },
        // Add modalManager reference for template access
        modalManager() {
            return modalManager;
        },
        // Get quick actions from NavigationRegistry
        quickActions() {
            return NavigationRegistry.getQuickActions('inventory');
        },
        categoryList() {
            // Return loaded categories with formatted name
            return this.categories.map(cat => ({
                id: cat.id,
                name: cat.title ? cat.title.charAt(0).toUpperCase() + cat.title.slice(1).toLowerCase() : (cat.name.charAt(0).toUpperCase() + cat.name.slice(1).toLowerCase())
            }));
        },
        currentCategoryName() {
            // Find the display name for the current category from loaded categories
            const match = this.categoryList.find(c => {
                // Match by formatted name (case-insensitive)
                return c.name.toLowerCase() === this.currentCategory.toLowerCase();
            });
            return match ? match.name : (this.currentCategory.charAt(0).toUpperCase() + this.currentCategory.slice(1).toLowerCase());
        }
    },
    methods: {
        exampleMethod() {
            // Example method logic
            modalManager.showAlert('Example method called!', 'Info');
        },
        async loadCategories() {
            // Use API to get all tabs for INVENTORY, filter out INDEX
            const tabs = await Requests.getAvailableTabs('INVENTORY');
            // tabs: [{title, sheetId}]
            this.categories = tabs.filter(tab => tab.title !== 'INDEX').map(tab => ({
                id: tab.sheetId,
                title: tab.title
            }));
        }
    },
    async mounted() {
        // Ensure we emit hamburger component for the initial view
        hamburgerMenuRegistry.registerMenu('inventory', {
            components: [InventoryMenuComponent],
            props: {
                currentView: 'inventory',
            }
        });
        await this.loadCategories();
    },
    template: html `
        <div class="inventory-page">
            <!-- Main Inventory View -->
            <div v-if="currentView === 'inventory'">
                <h3>Inventory Management</h3>
                <p>Manage and track all inventory items, conditions, and locations.</p>
                
                <div style="margin: 1rem 0; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button @click="modalManager.showAlert('Add new item functionality coming soon!', 'Info')">Add New Item</button>
                    <button @click="modalManager.showAlert('QR code scanning functionality coming soon!', 'Info')">Scan QR Code</button>
                    <button @click="modalManager.showAlert('Bulk import functionality coming soon!', 'Info')">Bulk Import</button>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <h4>Quick Actions</h4>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
                        <button 
                            v-for="action in quickActions" 
                            :key="action.id"
                            @click="navigateToPath(action.path)">
                            {{ action.label }}
                        </button>
                    </div>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <inventory-overview-table
                        :container-path="containerPath"
                        :navigate-to-path="navigateToPath"
                    ></inventory-overview-table>
                </div>
            </div>
            
            <!-- Categories View -->
            <div v-else-if="currentView === 'categories' && !currentCategory">
                <h3>Inventory Categories</h3>
                <p>Browse inventory items by category.</p>
                
                <div style="margin: 1rem 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <button
                        v-for="cat in categoryList"
                        :key="cat.id"
                        class="category-card"
                        @click="navigateToPath('inventory/categories/' + (cat.slug || cat.name.toLowerCase()))"
                    >
                        {{ cat.name }}
                    </button>
                </div>
            </div>
            
            <!-- Category View -->
            <div v-else-if="currentView === 'categories' && currentCategory">
                <div style="margin-top: 1.5rem;">
                    <inventory-table
                        :container-path="containerPath"
                        :inventory-name="'Inventory: ' + currentCategoryName.toLowerCase()"
                        :tab-title="currentCategoryName.toUpperCase()"
                    ></inventory-table>
                </div>
            </div>
            
            <!-- Search View -->
            <div v-else-if="currentView === 'search'">
                <h3>Advanced Search</h3>
                <p>Search for inventory items using various criteria.</p>
                
                <div style="margin: 1rem 0;">
                    <button @click="modalManager.showAlert('Save search criteria functionality coming soon!', 'Info')">Save Current Criteria</button>
                    <button @click="modalManager.showAlert('Load saved search functionality coming soon!', 'Info')">Load Saved Search</button>
                    <button @click="modalManager.showAlert('Export search results functionality coming soon!', 'Info')">Export Results</button>
                    <button @click="modalManager.showAlert('Clear search history functionality coming soon!', 'Info')">Clear History</button>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <h4>Search Results</h4>
                    <inventory-table
                        :container-path="containerPath"
                    ></inventory-table>
                </div>
            </div>
            
            <!-- Reports View -->
            <div v-else-if="currentView === 'reports'">
                <h3>Reports</h3>
                <p>View and manage inventory reports.</p>
                
                <div style="margin: 1rem 0;">
                    <button @click="modalManager.showAlert('Schedule automatic reports functionality coming soon!', 'Info')">Schedule Report</button>
                    <button @click="modalManager.showAlert('Custom report builder functionality coming soon!', 'Info')">Custom Report Builder</button>
                    <button @click="modalManager.showAlert('Email reports functionality coming soon!', 'Info')">Email Reports</button>
                    <button @click="modalManager.showAlert('Report settings functionality coming soon!', 'Info')">Report Settings</button>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <h4>Recent Reports</h4>
                    <inventory-table
                        :container-path="containerPath"
                        :tab-title="'FURNITURE'"
                        :edit-mode="false"
                    ></inventory-table>
                </div>
            </div>
            
            <!-- Default / Not Found -->
            <div v-else>
                <h3>Welcome to Inventory Management</h3>
                <p>Select a view from the menu to get started.</p>
            </div>
        </div>
    `
};
