import { html, InventoryTableComponent, hamburgerMenuRegistry, NavigationRegistry, Requests, CardsComponent, DashboardToggleComponent } from '../../index.js';
import { InventoryOverviewTableComponent } from './InventoryOverviewTable.js';

// Inventory Hamburger Menu Component (content only)
export const InventoryMenuComponent = {
    props: {
        containerPath: String,
        containerType: String, 
        currentView: String,
        title: String
    },
    inject: ['$modal'],
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
                    this.$modal.alert('Refreshing inventory...', 'Info');
                    break;
                case 'addInventoryItem':
                    this.$modal.confirm(
                        'Do you want to add a new inventory item?',
                        () => this.$modal.alert('Item added!', 'Success'),
                        () => this.$modal.alert('Add cancelled.', 'Info'),
                        'Add Item'
                    );
                    break;
                case 'exportInventory':
                    this.$modal.alert('Export all items functionality coming soon!', 'Info');
                    break;
                case 'inventorySettings':
                    this.$modal.alert('Inventory settings functionality coming soon!', 'Info');
                    break;
                case 'addNewCategory':
                    this.$modal.alert('Add new category functionality coming soon!', 'Info');
                    break;
                case 'manageCategoryOrder':
                    this.$modal.alert('Manage category order functionality coming soon!', 'Info');
                    break;
                case 'exportCategoryReport':
                    this.$modal.alert('Export category report functionality coming soon!', 'Info');
                    break;
                case 'categorySettings':
                    this.$modal.alert('Category settings functionality coming soon!', 'Info');
                    break;
                case 'saveSearchCriteria':
                    this.$modal.alert('Save search criteria functionality coming soon!', 'Info');
                    break;
                case 'loadSavedSearch':
                    this.$modal.alert('Load saved search functionality coming soon!', 'Info');
                    break;
                case 'exportSearchResults':
                    this.$modal.alert('Export search results functionality coming soon!', 'Info');
                    break;
                case 'clearSearchHistory':
                    this.$modal.alert('Clear search history functionality coming soon!', 'Info');
                    break;
                case 'scheduleReport':
                    this.$modal.alert('Schedule automatic reports functionality coming soon!', 'Info');
                    break;
                case 'customReportBuilder':
                    this.$modal.alert('Custom report builder functionality coming soon!', 'Info');
                    break;
                case 'emailReports':
                    this.$modal.alert('Email reports functionality coming soon!', 'Info');
                    break;
                case 'reportSettings':
                    this.$modal.alert('Report settings functionality coming soon!', 'Info');
                    break;
                case 'inventoryHelp':
                    this.$modal.alert('Inventory help functionality coming soon!', 'Info');
                    break;
                default:
                    this.$modal.alert(`Action ${action} not implemented yet.`, 'Info');
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
        'cards-grid': CardsComponent
    },
    props: {
        containerPath: {
            type: String,
            default: 'inventory'
        },
        navigateToPath: Function,
    },
    inject: ['$modal'],
    data() {
        return {
            categories: [] // loaded from spreadsheet
        };
    },
    computed: {
        // Direct navigation options for inventory
        inventoryNavigation() {
            return [
                { id: 'categories', label: 'Categories', path: 'inventory/categories' },
                { id: 'reports', label: 'Reports', path: 'inventory/reports' },
                { id: 'new', label: 'New Item', path: 'inventory/new' }
            ];
        },
        categoryList() {
            // Return loaded categories with formatted title
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
        <slot>
            <!-- Main Inventory View -->
            <slot v-if="containerPath === 'inventory'">
                <div class="content"><div class="button-bar">
                    <button 
                        v-for="nav in inventoryNavigation" 
                        :key="nav.id"
                        class="alert"
                        @click="navigateToPath(nav.path)">
                        {{ nav.label }}
                    </button>
                </div></div>
                <inventory-overview-table
                    :container-path="containerPath"
                    @navigate-to-path="(event) => navigateToPath(event.targetPath)"
                />
            </slot>
            
            <!-- Categories View -->
            <cards-grid
                v-else-if="containerPath === 'inventory/categories'"
                :items="categoryList"
                :on-item-click="handleCategorySelect"
                :is-loading="false"
                default-card-class="button purple"
                loading-message="Loading categories..."
                empty-message="No categories available"
            />
            
            <!-- Specific Category View -->
            <inventory-table
                v-else-if="containerPath.startsWith('inventory/categories/') && currentCategoryName"
                :container-path="containerPath"
                :inventory-name="'Inventory: ' + currentCategoryName.toLowerCase()"
                :tab-title="currentCategoryName.toUpperCase()"
            ></inventory-table>
            
            <!-- Reports View -->
            <slot v-else-if="containerPath === 'inventory/reports'">
                <h3>Reports</h3>
                <p>View and manage inventory reports.</p>
                
                <div style="margin: 1rem 0;">
                    <button @click="$modal.alert('Schedule automatic reports functionality coming soon!', 'Info')">Schedule Report</button>
                    <button @click="$modal.alert('Custom report builder functionality coming soon!', 'Info')">Custom Report Builder</button>
                    <button @click="$modal.alert('Email reports functionality coming soon!', 'Info')">Email Reports</button>
                    <button @click="$modal.alert('Report settings functionality coming soon!', 'Info')">Report Settings</button>
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
                    <button @click="$modal.alert('Add new item functionality coming soon!', 'Info')">Create New Item</button>
                </div>
            </slot>
        </slot>
    `
};
