import { Requests, html, modalManager, hamburgerMenuRegistry, PacklistTable, TabsListComponent, NavigationRegistry } from '../../index.js';

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
        'tabs-list': TabsListComponent
    },
    props: {
        showAlert: Function,
        containerPath: String,
        navigateToPath: Function
    },
    data() {
        return {
            availablePacklists: [], // loaded from API
            isLoading: false
        };
    },
    computed: {
        pathSegments() {
            return this.containerPath.split('/').filter(segment => segment.length > 0);
        },
        currentView() {
            // For packlist paths, the view is always 'packlist'
            return 'packlist';
        },
        currentPacklist() {
            // Handle direct packlist access: packlist/{name}
            // pathSegments[0] = 'packlist', pathSegments[1] = packlist identifier
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
        }
    },
    watch: {
        // No watchers needed for simplified navigation
    },
    mounted() {
        // Register packlist navigation routes
        NavigationRegistry.registerNavigation('packlist', {
            routes: {
                active: {
                    displayName: 'Active Packlists',
                    dashboardTitle: 'Active Pack Lists',
                    icon: 'play_arrow'
                },
                archived: {
                    displayName: 'Archived Packlists',
                    dashboardTitle: 'Archived Pack Lists',
                    icon: 'archive'
                },
                templates: {
                    displayName: 'Templates',
                    dashboardTitle: 'Pack List Templates',
                    icon: 'content_copy'
                }
            }
        });

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
        }
    },
    template: html `
        <div class="packlist-page">
            <!-- Main Packlist View - List of Available Packlists -->
            <div v-if="!isViewingPacklist">
                <tabs-list
                    :tabs="availablePacklists"
                    :on-select="handlePacklistSelect"
                    :is-loading="isLoading"
                    loading-message="Loading available packlists..."
                />
            </div>
            
            <!-- Individual Packlist View -->
            <div v-else>
                <packlist-table :tab-name="currentPacklist" />
            </div>
        </div>
    `
};