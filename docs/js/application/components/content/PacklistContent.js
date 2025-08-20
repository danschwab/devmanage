import { Requests, html, modalManager, hamburgerMenuRegistry, PacklistTable, TabsListComponent, TabComponent } from '../../index.js';

export const PacklistMenuComponent = {
    props: {
        currentView: String,
        showAlert: Function,
        refreshCallback: Function
    },
    computed: {
        menuItems() {
            switch (this.currentView) {
                default:
                    return [
                        { label: 'Refresh', action: 'refresh' },
                        { label: 'Help', action: 'help' }
                    ];
            }
        }
    },
    methods: {
        handleAction(action) {
            switch (action) {
                case 'refresh':
                    if (this.refreshCallback) {
                        this.refreshCallback();
                    } else {
                        modalManager.showAlert?.('Refreshing packlist data...', 'Info');
                    }
                    break;
                case 'help':
                    modalManager.showAlert?.('Packlist help functionality coming soon!', 'Info');
                    break;
                default:
                    modalManager.showAlert?.(`Action ${action} not implemented yet.`, 'Info');
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





export const PacklistContent = {
    components: {
        'packlist-table': PacklistTable,
        'tabs-list': TabsListComponent,
        'tab-component': TabComponent
    },
    props: {
        showAlert: Function,
        containerPath: String,
        navigateToPath: Function
    },
    data() {
        return {
            availablePacklists: [], // loaded from API
            isLoading: false,
            openTabs: [], // tracks opened packlist tabs
            activeTabName: '' // currently active tab
        };
    },
    computed: {
        pathSegments() {
            return this.containerPath.split('/').filter(segment => segment.length > 0);
        },
        currentView() {
            return this.pathSegments[1] || 'packlist';
        },
        currentPacklist() {
            // Handle direct packlist access: packlist/{name}
            return this.pathSegments[1] || '';
        },
        // Add modalManager reference for template access
        modalManager() {
            return modalManager;
        },
        // Get formatted name for current packlist - keep original case
        currentPacklistName() {
            if (!this.currentPacklist || this.currentPacklist === 'packlist') return '';
            const match = this.availablePacklists.find(p => 
                p.title === this.currentPacklist
            );
            return match ? match.title : this.currentPacklist;
        },
        // Determine if we're viewing a specific packlist
        isViewingPacklist() {
            return !!this.currentPacklist && this.currentPacklist !== 'packlist';
        },
        // Check if we have any open tabs
        hasOpenTabs() {
            return this.openTabs.length > 0;
        },
        // Current tab should match the current packlist from navigation
        currentTabName() {
            return this.currentPacklist;
        }
    },
    watch: {
        // Watch for navigation changes and sync tabs
        currentPacklist(newPacklist, oldPacklist) {
            if (newPacklist && newPacklist !== 'packlist') {
                this.ensureTabExists(newPacklist);
                this.activeTabName = newPacklist;
            } else {
                this.activeTabName = '';
            }
        }
    },
    mounted() {
        // Register hamburger menu for packlist
        hamburgerMenuRegistry.registerMenu('packlist', {
            components: [PacklistMenuComponent],
            props: {
                currentView: this.currentView,
                refreshCallback: this.loadAvailablePacklists
            }
        });
        
        // Load available packlists
        this.loadAvailablePacklists();
        
        // If we're already viewing a specific packlist, ensure its tab exists
        if (this.isViewingPacklist) {
            this.ensureTabExists(this.currentPacklist);
            this.activeTabName = this.currentPacklist;
        }
    },
    methods: {
        async loadAvailablePacklists() {
            this.isLoading = true;
            try {
                const tabs = await Requests.getAvailableTabs('PACK_LISTS');
                this.availablePacklists = tabs.filter(tab => tab.title !== 'TEMPLATE');
            } catch (error) {
                this.modalManager.showAlert?.('Failed to load available packlists: ' + error.message, 'Error');
            } finally {
                this.isLoading = false;
            }
        },
        handlePacklistSelect(packlistName) {
            this.navigateToPath('packlist/' + packlistName);
        },
        // Tab management methods
        ensureTabExists(packlistName) {
            if (!this.openTabs.find(tab => tab.name === packlistName)) {
                this.openTabs.push({
                    name: packlistName,
                    label: packlistName,
                    closable: true,
                    component: PacklistTable,
                    props: {
                        tabName: packlistName
                    }
                });
            }
        },
        handleTabChange(tabName) {
            // Navigate to the selected packlist
            this.navigateToPath('packlist/' + tabName);
        },
        handleTabClose(tabName) {
            const tabIndex = this.openTabs.findIndex(tab => tab.name === tabName);
            if (tabIndex !== -1) {
                this.openTabs.splice(tabIndex, 1);
                
                // If closing the current tab, navigate appropriately
                if (tabName === this.currentPacklist) {
                    if (this.openTabs.length > 0) {
                        // Navigate to the next available tab
                        const nextTab = this.openTabs[Math.max(0, tabIndex - 1)];
                        this.navigateToPath('packlist/' + nextTab.name);
                    } else {
                        // Navigate back to main packlist page
                        this.navigateToPath('packlist');
                    }
                }
            }
        },
        handleNewTab() {
            // Navigate back to main packlist page to select a new packlist
            this.navigateToPath('packlist');
        }
    },
    template: html `
        <div class="packlist-page">
            <!-- Main Packlist View - List of Available Packlists -->
            <div v-if="!isViewingPacklist">
                <p>Open a packlist to view and manage its contents.</p>
                
                <tabs-list
                    :tabs="availablePacklists"
                    :on-select="handlePacklistSelect"
                    :is-loading="isLoading"
                    loading-message="Loading available packlists..."
                />
            </div>
            <!-- Tab Navigation - shown when there are open tabs -->
            <tab-component v-else-if="hasOpenTabs"
                :tabs="openTabs"
                :active-tab="activeTabName"
                :show-new-tab-button="true"
                @tab-change="handleTabChange"
                @tab-close="handleTabClose"
                @new-tab="handleNewTab"
            />
            
            <!-- Default / Not Found -->
            <div v-else-if="!hasOpenTabs">
                <h3>Packlist Management</h3>
                <p>Select a view from the menu to get started.</p>
            </div>
        </div>
    `
};