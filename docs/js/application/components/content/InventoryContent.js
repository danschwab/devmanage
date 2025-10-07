import { html, InventoryTableComponent, modalManager, hamburgerMenuRegistry, NavigationRegistry, Requests, TabsListComponent, CardsComponent, DashboardToggleComponent } from '../../index.js';
import { InventoryOverviewTableComponent } from './InventoryOverviewTable.js';

// Inventory Hamburger Menu Component (content only)
export const InventoryMenuComponent = {
    props: {
        containerPath: String,
        containerType: String, 
        currentView: String,
        title: String
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
                    modalManager.showAlert('Export all items functionality coming soon!', 'Info');
                    break;
                case 'inventorySettings':
                    modalManager.showAlert('Inventory settings functionality coming soon!', 'Info');
                    break;
                case 'addNewCategory':
                    modalManager.showAlert('Add new category functionality coming soon!', 'Info');
                    break;
                case 'manageCategoryOrder':
                    modalManager.showAlert('Manage category order functionality coming soon!', 'Info');
                    break;
                case 'exportCategoryReport':
                    modalManager.showAlert('Export category report functionality coming soon!', 'Info');
                    break;
                case 'categorySettings':
                    modalManager.showAlert('Category settings functionality coming soon!', 'Info');
                    break;
                case 'saveSearchCriteria':
                    modalManager.showAlert('Save search criteria functionality coming soon!', 'Info');
                    break;
                case 'loadSavedSearch':
                    modalManager.showAlert('Load saved search functionality coming soon!', 'Info');
                    break;
                case 'exportSearchResults':
                    modalManager.showAlert('Export search results functionality coming soon!', 'Info');
                    break;
                case 'clearSearchHistory':
                    modalManager.showAlert('Clear search history functionality coming soon!', 'Info');
                    break;
                case 'scheduleReport':
                    modalManager.showAlert('Schedule automatic reports functionality coming soon!', 'Info');
                    break;
                case 'customReportBuilder':
                    modalManager.showAlert('Custom report builder functionality coming soon!', 'Info');
                    break;
                case 'emailReports':
                    modalManager.showAlert('Email reports functionality coming soon!', 'Info');
                    break;
                case 'reportSettings':
                    modalManager.showAlert('Report settings functionality coming soon!', 'Info');
                    break;
                case 'inventoryHelp':
                    modalManager.showAlert('Inventory help functionality coming soon!', 'Info');
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
        'inventory-overview-table': InventoryOverviewTableComponent,
        'tabs-list': TabsListComponent,
        'cards-grid': CardsComponent
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
        // Add modalManager reference for template access
        modalManager() {
            return modalManager;
        },
        // Direct navigation options for inventory
        inventoryNavigation() {
            return [
                { id: 'categories', label: 'Categories', path: 'inventory/categories' },
                { id: 'reports', label: 'Reports', path: 'inventory/reports' },
                { id: 'new', label: 'New Item', path: 'inventory/new' }
            ];
        },
        categoryList() {
            // Return loaded categories with formatted title for TabsListComponent
            return this.categories.map(cat => ({
                id: cat.id,
                title: cat.title ? cat.title.charAt(0).toUpperCase() + cat.title.slice(1).toLowerCase() : (cat.name.charAt(0).toUpperCase() + cat.name.slice(1).toLowerCase())
            }));
        },
        // Get current category name from path for specific category views
        currentCategoryName() {
            if (this.containerPath.startsWith('inventory/categories/')) {
                const categorySlug = this.containerPath.replace('inventory/categories/', '');
                const match = this.categoryList.find(c => {
                    return c.title.toLowerCase() === categorySlug.toLowerCase();
                });
                return match ? match.title : (categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1).toLowerCase());
            }
            return '';
        }
    },
    methods: {
        handleCategorySelect(categoryTitle) {
            this.navigateToPath('inventory/categories/' + categoryTitle.toLowerCase());
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

        // Register inventory navigation routes
        NavigationRegistry.registerNavigation('inventory', {
            routes: {
                categories: {
                    displayName: 'Categories',
                    dashboardTitle: 'Inventory Categories',
                    icon: 'category',
                    children: {}
                },
                reports: {
                    displayName: 'Reports',
                    dashboardTitle: 'Inventory Reports',
                    icon: 'assessment'
                },
                new: {
                    displayName: 'New Item',
                    dashboardTitle: 'Add New Item',
                    icon: 'add'
                }
            }
        });

        // Register hamburger menu for inventory
        hamburgerMenuRegistry.registerMenu('inventory', {
            components: [InventoryMenuComponent, DashboardToggleComponent],
            props: {}
        });
        
        await this.loadCategories();
    },
    template: html `
        <div class="inventory-page">
            <!-- Main Inventory View -->
            <slot v-if="containerPath === 'inventory'">
                <div class="button-bar">
                    <button 
                        v-for="nav in inventoryNavigation" 
                        :key="nav.id"
                        @click="navigateToPath(nav.path)">
                        {{ nav.label }}
                    </button>
                </div>
                <inventory-overview-table
                    :container-path="containerPath"
                    @navigate-to-path="(event) => navigateToPath(event.targetPath)"
                />
            </slot>
            
            <!-- Categories View -->
            <slot v-else-if="containerPath === 'inventory/categories'">
                <cards-grid
                    :items="categoryList"
                    :on-item-click="handleCategorySelect"
                    :is-loading="false"
                    loading-message="Loading categories..."
                    empty-message="No categories available"
                />
            </slot>
            
            <!-- Specific Category View -->
            <slot v-else-if="containerPath.startsWith('inventory/categories/') && currentCategoryName">
                <inventory-table
                    :container-path="containerPath"
                    :inventory-name="'Inventory: ' + currentCategoryName.toLowerCase()"
                    :tab-title="currentCategoryName.toUpperCase()"
                ></inventory-table>
            </slot>
            
            <!-- Reports View -->
            <slot v-else-if="containerPath === 'inventory/reports'">
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
                    >
                    </inventory-table>
                </div>
            </slot>

            <!-- New Item View -->
            <slot v-else-if="containerPath === 'inventory/new'">
                <h3>Add New Item</h3>
                <p>Add a new item to the inventory.</p>
                <div style="margin: 1rem 0;">
                    <button @click="modalManager.showAlert('Add new item functionality coming soon!', 'Info')">Create New Item</button>
                </div>
            </slot>
        </div>
    `
};
