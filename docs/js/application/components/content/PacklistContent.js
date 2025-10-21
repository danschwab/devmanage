import { Requests, html, hamburgerMenuRegistry, PacklistTable, TabsListComponent, CardsComponent, NavigationRegistry, DashboardToggleComponent } from '../../index.js';
import { PacklistItemsSummary } from './PacklistItemsSummary.js';

export const PacklistMenuComponent = {
    props: {
        containerPath: String,
        containerType: String,
        currentView: String,
        title: String,
        refreshCallback: Function
    },
    inject: ['$modal'],
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
                        this.$modal.alert('Refreshing packlist data...', 'Info');
                    }
                    break;
                case 'help':
                    this.$modal.alert('Packlist help functionality coming soon!', 'Info');
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





export const PacklistContent = {
    components: {
        'packlist-table': PacklistTable,
        'cards-grid': CardsComponent,
        'PacklistItemsSummary': PacklistItemsSummary
    },
    props: {
        containerPath: String,
        navigateToPath: Function
    },
    inject: ['$modal'],
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
            // Handle direct packlist access: packlist/{name} or packlist/{name}/details or packlist/{name}/edit
            // pathSegments[0] = 'packlist', pathSegments[1] = packlist identifier, pathSegments[2] = 'details' or 'edit' (optional)
            return this.pathSegments[1] || '';
        },
        isEditView() {
            // Check if we're viewing the edit subview
            return this.pathSegments[2] === 'edit';
        },
        isDetailsView() {
            // Check if we're viewing the details subview
            return this.pathSegments[2] === 'details';
        },
        // Determine if we're viewing a specific packlist
        isViewingPacklist() {
            return !!this.currentPacklist && this.currentPacklist !== 'packlist';
        }
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
            components: [PacklistMenuComponent, DashboardToggleComponent],
            props: {
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
                this.$modal.alert('Failed to load available packlists: ' + error.message, 'Error');
            } finally {
                this.isLoading = false;
            }
        },
        handlePacklistSelect(packlistName) {
            this.navigateToPath('packlist/' + packlistName);
        }
    },
    template: html `
        <slot>
            <cards-grid
                v-if="!isViewingPacklist"
                :items="availablePacklists"
                :on-item-click="handlePacklistSelect"
                :is-loading="isLoading"
                loading-message="Loading available packlists..."
                empty-message="No packlists available"
            />
            
            <!-- Individual Packlist View (Read-only or Edit mode) -->
            <packlist-table 
                v-else-if="!isDetailsView"
                :tab-name="currentPacklist"
                :edit-mode="isEditView"
                :container-path="containerPath"
                @navigate-to-path="(event) => navigateToPath(event.targetPath)"
            />
            
            <!-- Packlist Details View (Summary Table Only) -->
            <PacklistItemsSummary 
                v-else-if="isDetailsView"
                :project-identifier="currentPacklist"
                :container-path="containerPath"
                @navigate-to-path="(event) => navigateToPath(event.targetPath)"
            />
        </slot>
    `
};