import { Requests, html, hamburgerMenuRegistry, PacklistTable, CardsComponent, NavigationRegistry, DashboardToggleComponent, getReactiveStore, findMatchingStores, createAnalysisConfig } from '../../index.js';
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
            packlistsStore: null // Reactive store for packlists
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
        isDetailsView() {
            // Check if we're viewing the details subview
            return this.pathSegments[2] === 'details';
        },
        // Determine if we're viewing a specific packlist
        isViewingPacklist() {
            return !!this.currentPacklist && this.currentPacklist !== 'packlist';
        },
        // Computed properties for cards grid
        availablePacklists() {
            if (!this.packlistsStore) return [];
            const tabs = this.packlistsStore.data || [];
            // Filter out TEMPLATE and format for CardsComponent
            return tabs
                .filter(tab => tab.title !== 'TEMPLATE')
                .map(tab => {
                    // Find any reactive stores for this packlist (regardless of analysis config)
                    const matchingStores = findMatchingStores(
                        Requests.getPackList,
                        [tab.title]
                    );
                    
                    // Check if any matching store has unsaved changes
                    const hasUnsavedChanges = matchingStores.some(match => match.isModified);
                    
                    // Determine card styling based on store state
                    const cardClass = hasUnsavedChanges ? 'red' : 'gray';
                    const contentFooter = hasUnsavedChanges ? 'Unsaved changes' : undefined;
                    
                    // Use description from analysis or show loading placeholder
                    const content = tab.description || '...';
                    
                    return {
                        id: tab.sheetId,
                        title: tab.title,
                        content: content,
                        cardClass: cardClass,
                        contentFooter: contentFooter
                    };
                });
        },
        isLoading() {
            return this.packlistsStore ? (this.packlistsStore.isLoading || this.packlistsStore.isAnalyzing) : false;
        },
        isAnalyzing() {
            return this.packlistsStore ? this.packlistsStore.isAnalyzing : false;
        },
        loadingProgress() {
            return this.packlistsStore ? this.packlistsStore.analysisProgress : -1;
        },
        analysisMessage() {
            return this.packlistsStore ? this.packlistsStore.analysisMessage : 'Loading...';
        }
    },
    mounted() {

        // Register packlist navigation routes
        NavigationRegistry.registerNavigation('packlist', {
            routes: {
                active: {
                    displayName: 'Active Packlists',
                    dashboardTitle: 'Active Pack Lists',
                },
                archived: {
                    displayName: 'Archived Packlists',
                    dashboardTitle: 'Archived Pack Lists',
                },
                templates: {
                    displayName: 'Automation',
                    dashboardTitle: 'Pack List Automation',
                }
            }
        });

        // Register hamburger menu for packlist
        hamburgerMenuRegistry.registerMenu('packlist', {
            components: [PacklistMenuComponent, DashboardToggleComponent],
            props: {
                refreshCallback: this.handleRefresh
            }
        });
        
        // Configure analysis for packlist descriptions
        const analysisConfig = [
            createAnalysisConfig(
                Requests.getPacklistDescription,
                'description',
                'Loading packlist details...',
                ['title'], // Use title as the source (project identifier)
                [],
                'description' // Store result in 'description' column
            )
        ];
        
        // Initialize reactive store for available packlists with analysis
        this.packlistsStore = getReactiveStore(
            Requests.getAvailableTabs,
            null,
            ['PACK_LISTS'],
            analysisConfig
        );
    },
    methods: {
        async handleRefresh() {
            // Reload packlists data using reactive store
            if (this.packlistsStore) {
                await this.packlistsStore.load('Refreshing packlists...');
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
                :show-header="true"
                :show-search="true"
                :items="availablePacklists"
                :on-item-click="handlePacklistSelect"
                :is-loading="packlistsStore ? packlistsStore.isLoading : false"
                :is-analyzing="isAnalyzing"
                :loading-progress="loadingProgress"
                :loading-message="analysisMessage"
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