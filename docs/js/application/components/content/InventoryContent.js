import { TestTableComponent } from '../testTableComponent.js';
import { html } from '../../utils/template-helpers.js';

// Inventory Hamburger Menu Component (reactive)
const InventoryMenuComponent = {
    props: {
        currentView: String,
        showAlert: Function,
        addInventoryItem: Function,
        refreshInventory: Function,
        // Dashboard toggle props
        containerType: String,
        isOnDashboard: Boolean,
        addToDashboard: Function,
        removeDashboardContainer: Function
    },
    data() {
        return {
            localIsOnDashboard: this.isOnDashboard
        };
    },
    watch: {
        isOnDashboard(newVal) {
            this.localIsOnDashboard = newVal;
        }
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
                    this.showAlert?.('Refreshing inventory...', 'Info');
                    break;
                case 'addInventoryItem':
                    this.showAlert?.('Add new item functionality coming soon!', 'Info');
                    break;
                case 'exportInventory':
                    this.showAlert?.('Export all items functionality coming soon!', 'Info');
                    break;
                case 'inventorySettings':
                    this.showAlert?.('Inventory settings functionality coming soon!', 'Info');
                    break;
                case 'addNewCategory':
                    this.showAlert?.('Add new category functionality coming soon!', 'Info');
                    break;
                case 'manageCategoryOrder':
                    this.showAlert?.('Manage category order functionality coming soon!', 'Info');
                    break;
                case 'exportCategoryReport':
                    this.showAlert?.('Export category report functionality coming soon!', 'Info');
                    break;
                case 'categorySettings':
                    this.showAlert?.('Category settings functionality coming soon!', 'Info');
                    break;
                case 'saveSearchCriteria':
                    this.showAlert?.('Save search criteria functionality coming soon!', 'Info');
                    break;
                case 'loadSavedSearch':
                    this.showAlert?.('Load saved search functionality coming soon!', 'Info');
                    break;
                case 'exportSearchResults':
                    this.showAlert?.('Export search results functionality coming soon!', 'Info');
                    break;
                case 'clearSearchHistory':
                    this.showAlert?.('Clear search history functionality coming soon!', 'Info');
                    break;
                case 'scheduleReport':
                    this.showAlert?.('Schedule automatic reports functionality coming soon!', 'Info');
                    break;
                case 'customReportBuilder':
                    this.showAlert?.('Custom report builder functionality coming soon!', 'Info');
                    break;
                case 'emailReports':
                    this.showAlert?.('Email reports functionality coming soon!', 'Info');
                    break;
                case 'reportSettings':
                    this.showAlert?.('Report settings functionality coming soon!', 'Info');
                    break;
                case 'inventoryHelp':
                    this.showAlert?.('Inventory help functionality coming soon!', 'Info');
                    break;
                default:
                    this.showAlert?.(`Action ${action} not implemented yet.`, 'Info');
            }
        },
        toggleDashboardPresence() {
            if (this.localIsOnDashboard) {
                this.removeDashboardContainer?.(this.containerType);
                this.localIsOnDashboard = false;
            } else {
                this.addToDashboard?.(this.containerType);
                this.localIsOnDashboard = true;
            }
        }
    },
    template: html`
        <div style="text-align: left;">
            <h4>Inventory Actions</h4>
            <ul style="list-style: none; padding: 0;">
                <li v-for="item in menuItems" :key="item.action" style="margin-bottom: 5px;">
                    <button 
                        @click="handleAction(item.action)"
                        :style="{
                            width: '100%',
                            padding: '8px 12px',
                            background: '#f5f5f5',
                            border: '1px solid #ddd',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            textAlign: 'left'
                        }">
                        {{ item.label }}
                    </button>
                </li>
            </ul>
            
            <!-- Dashboard Toggle Section -->
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
        </div>
    `
};

export const InventoryContent = {
    components: {
        'test-table': TestTableComponent,
        InventoryMenuComponent
    },
    props: {
        showAlert: Function,
        containerPath: {
            type: String,
            default: 'inventory'
        },
        navigateToPath: Function,
        dashboardToggleProps: {
            type: Object,
            default: () => ({})
        }
    },
    computed: {
        pathSegments() {
            return this.containerPath.split('/').filter(segment => segment.length > 0);
        },
        currentView() {
            return this.pathSegments[1] || 'main';
        },
        currentCategory() {
            return this.pathSegments[2] || '';
        }
    },
    mounted() {
        // Emit the reactive menu component instead of static HTML
        this.updateHamburgerMenuComponent();
    },
    watch: {
        // Watch for changes in current view and emit updated hamburger component
        currentView() {
            this.updateHamburgerMenuComponent();
        }
    },
    methods: {
        updateHamburgerMenuComponent() {
            const componentData = {
                component: InventoryMenuComponent,
                props: {
                    currentView: this.currentView,
                    showAlert: this.showAlert,
                    // Add dashboard toggle props from parent
                    containerType: this.dashboardToggleProps.containerType || 'inventory',
                    isOnDashboard: this.dashboardToggleProps.isOnDashboard || false,
                    addToDashboard: this.dashboardToggleProps.addToDashboard,
                    removeDashboardContainer: this.dashboardToggleProps.removeDashboardContainer
                }
            };
            
            console.log('InventoryContent: Emitting custom-hamburger-component with:', componentData);
            console.log('Current view:', this.currentView);
            console.log('Dashboard toggle props:', this.dashboardToggleProps);
            
            this.$emit('custom-hamburger-component', componentData);
        },
        navigateToView(viewName) {
            if (this.navigateToPath) {
                this.navigateToPath(`inventory/${viewName}`);
            }
        },
        navigateToCategory(categoryName) {
            if (this.navigateToPath) {
                this.navigateToPath(`inventory/categories/${categoryName}`);
            }
        },
        getDisplayName(segmentId) {
            const names = {
                'inventory': 'Inventory',
                'categories': 'Categories',
                'search': 'Search',
                'reports': 'Reports',
                'furniture': 'Furniture',
                'electronics': 'Electronics',
                'signage': 'Signage'
            };
            return names[segmentId] || segmentId.charAt(0).toUpperCase() + segmentId.slice(1);
        }
    },
    template: html `
        <div class="inventory-page">
            <!-- Main Inventory View -->
            <div v-if="currentView === 'main'">
                <h3>Inventory Management</h3>
                <p>Manage and track all inventory items, conditions, and locations.</p>
                
                <div style="margin: 1rem 0; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button @click="showAlert('Add new item functionality coming soon!', 'Info')">Add New Item</button>
                    <button @click="showAlert('QR code scanning functionality coming soon!', 'Info')">Scan QR Code</button>
                    <button @click="showAlert('Bulk import functionality coming soon!', 'Info')">Bulk Import</button>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <h4>Quick Actions</h4>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
                        <button @click="navigateToView('categories')">Browse by Category</button>
                        <button @click="navigateToView('search')">Advanced Search</button>
                        <button @click="navigateToView('reports')">View Reports</button>
                    </div>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <h4>Recent Inventory</h4>
                    <test-table></test-table>
                </div>
            </div>
            
            <!-- Categories View -->
            <div v-else-if="currentView === 'categories' && !currentCategory">
                <h3>Inventory Categories</h3>
                <p>Browse inventory items by category.</p>
                
                <div style="margin: 1rem 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <button class="category-card" @click="navigateToCategory('furniture')">
                        <h4 style="margin: 0 0 0.5rem 0;">Furniture</h4>
                        <p style="margin: 0; color: #666;">Tables, chairs, displays</p>
                    </button>
                    <button class="category-card" @click="navigateToCategory('electronics')">
                        <h4 style="margin: 0 0 0.5rem 0;">Electronics</h4>
                        <p style="margin: 0; color: #666;">AV equipment, lighting</p>
                    </button>
                    <button class="category-card" @click="navigateToCategory('signage')">
                        <h4 style="margin: 0 0 0.5rem 0;">Signage</h4>
                        <p style="margin: 0; color: #666;">Banners, displays, graphics</p>
                    </button>
                </div>
            </div>
            
            <!-- Category View -->
            <div v-else-if="currentView === 'categories' && currentCategory">
                <h3>{{ getDisplayName(currentCategory) }} Inventory</h3>
                <p>Items in the {{ getDisplayName(currentCategory).toLowerCase() }} category.</p>
                
                <div style="margin: 1rem 0; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button @click="showAlert('Filter functionality coming soon!', 'Info')">Filter Items</button>
                    <button @click="showAlert('Sort functionality coming soon!', 'Info')">Sort Options</button>
                    <button @click="showAlert('Export functionality coming soon!', 'Info')">Export List</button>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <test-table></test-table>
                </div>
            </div>
            
            <!-- Search View -->
            <div v-else-if="currentView === 'search'">
                <h3>Advanced Search</h3>
                <p>Search and filter inventory items with advanced criteria.</p>
                
                <div style="margin: 1rem 0; display: flex; flex-direction: column; gap: 1rem; max-width: 500px;">
                    <input type="text" placeholder="Search by item name or description..." style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                    <select style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                        <option value="">All Categories</option>
                        <option value="furniture">Furniture</option>
                        <option value="electronics">Electronics</option>
                        <option value="signage">Signage</option>
                    </select>
                    <div style="display: flex; gap: 0.5rem;">
                        <button style="flex: 1;">Search</button>
                        <button style="flex: 1;" @click="showAlert('Clear filters functionality coming soon!', 'Info')">Clear</button>
                    </div>
                </div>
                
                <div style="margin-top: 1.5rem;">
                    <h4>Search Results</h4>
                    <p style="color: #666;">Enter search criteria to see results.</p>
                </div>
            </div>
            
            <!-- Reports View -->
            <div v-else-if="currentView === 'reports'">
                <h3>Inventory Reports</h3>
                <p>Generate and view various inventory reports.</p>
                
                <div style="margin: 1rem 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                    <div style="padding: 1rem; border: 1px solid #ddd; border-radius: 4px;">
                        <h4 style="margin: 0 0 0.5rem 0;">Stock Levels</h4>
                        <p style="margin: 0 0 1rem 0; color: #666;">Current inventory levels and low stock alerts.</p>
                        <button @click="showAlert('Stock levels report functionality coming soon!', 'Info')">Generate Report</button>
                    </div>
                    <div style="padding: 1rem; border: 1px solid #ddd; border-radius: 4px;">
                        <h4 style="margin: 0 0 0.5rem 0;">Usage History</h4>
                        <p style="margin: 0 0 1rem 0; color: #666;">Track item usage and movement history.</p>
                        <button @click="showAlert('Usage history report functionality coming soon!', 'Info')">Generate Report</button>
                    </div>
                    <div style="padding: 1rem; border: 1px solid #ddd; border-radius: 4px;">
                        <h4 style="margin: 0 0 0.5rem 0;">Maintenance Schedule</h4>
                        <p style="margin: 0 0 1rem 0; color: #666;">Upcoming maintenance and inspection dates.</p>
                        <button @click="showAlert('Maintenance schedule report functionality coming soon!', 'Info')">Generate Report</button>
                    </div>
                </div>
            </div>
        </div>
    `
};
