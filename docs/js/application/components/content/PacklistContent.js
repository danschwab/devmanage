import { Requests, html, hamburgerMenuRegistry, PacklistTable, CardsComponent, NavigationRegistry, DashboardToggleComponent, getReactiveStore, findMatchingStores, createAnalysisConfig, generateStoreKey, authState, SavedSearchSelect } from '../../index.js';
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
        'PacklistItemsSummary': PacklistItemsSummary,
        'saved-search-select': SavedSearchSelect
    },
    props: {
        containerPath: String,
        navigateToPath: Function
    },
    inject: ['$modal'],
    data() {
        return {
            packlistsStore: null, // Reactive store for packlists
            autoSavedPacklists: new Set(), // Track which packlists have auto-saved data
            selectedYear: new Date().getFullYear(), // Default to current year
            showIdentifiersForYear: [] // Array of show identifiers for the selected year
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
                .filter(tab => {
                    // Filter by comparing with show identifiers from production schedule
                    if (!this.showIdentifiersForYear || this.showIdentifiersForYear.length === 0) {
                        return true; // No filter active, show all
                    }
                    
                    // Check if packlist title matches any show identifier
                    return this.showIdentifiersForYear.some(showId => showId === tab.title);
                })
                .map(tab => {
                    // Find any reactive stores for this packlist (regardless of analysis config)
                    const matchingStores = findMatchingStores(
                        Requests.getPackList,
                        [tab.title]
                    );
                    
                    // If a reactive store exists, use its state. Otherwise check userData for auto-save
                    const hasUnsavedChanges = matchingStores.length > 0
                        ? matchingStores.some(match => match.isModified)
                        : this.autoSavedPacklists.has(tab.title);
                    
                    // Determine card styling based on store state
                    const cardClass = hasUnsavedChanges ? 'red' : 'gray';
                    const contentFooter = hasUnsavedChanges ? 'Unsaved changes' : undefined;
                    
                    // Use description from analysis or show loading placeholder
                    const content = tab.description || '...';

                    if (!tab.description && !(this.packlistsStore.isAnalyzing || this.packlistsStore.isLoading)) {
                        this.packlistsStore.runConfiguredAnalysis();
                    }

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
    watch: {
        // Watch for when packlists data is loaded and check for auto-saved data
        'packlistsStore.data': {
            handler(newData) {
                if (newData && newData.length > 0 && !this.packlistsStore.isLoading) {
                    this.checkAutoSavedPacklists();
                }
            },
            deep: false
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
        
        // Note: checkAutoSavedPacklists will be called by the watcher when data loads
    },
    methods: {
        async checkAutoSavedPacklists() {
            if (!authState.isAuthenticated || !authState.user?.email || !this.packlistsStore?.data) return;
            
            try {
                // Check each individual packlist for auto-saved data
                for (const tab of this.packlistsStore.data) {
                    if (tab.title === 'TEMPLATE') continue;
                    
                    // Generate the store key prefix (without analysis config)
                    const storeKeyPrefix = generateStoreKey(
                        Requests.getPackList,
                        Requests.savePackList,
                        [tab.title],
                        null
                    ).substring(0, generateStoreKey(Requests.getPackList, Requests.savePackList, [tab.title], null).lastIndexOf(':'));
                    
                    // Check if this specific key exists (prefix match since analysis config might vary)
                    const hasAutoSave = await Requests.hasUserDataKey(
                        authState.user.email,
                        storeKeyPrefix,
                        true // prefix match
                    );
                    
                    if (hasAutoSave) {
                        this.autoSavedPacklists.add(tab.title);
                    }
                }
            } catch (error) {
                console.error('[PacklistContent] Error checking auto-saved packlists:', error);
            }
        },
        async handleRefresh() {
            // Reload packlists data using reactive store
            if (this.packlistsStore) {
                await this.packlistsStore.load('Refreshing packlists...');
            }
        },
        handlePacklistSelect(packlistName) {
            this.navigateToPath('packlist/' + packlistName);
        },
        async handleYearSelected(searchData) {
            if (!searchData) {
                // Clear filter
                this.selectedYear = null;
                this.showIdentifiersForYear = [];
            } else if (searchData.type === 'year') {
                // Set year filter and fetch show identifiers from production schedule
                this.selectedYear = searchData.year;
                
                try {
                    // Query production schedule for shows in this year
                    const shows = await Requests.getProductionScheduleData({
                        startDate: searchData.startDate,
                        endDate: searchData.endDate,
                        byShowDate: true,
                        year: searchData.year
                    });
                    
                    // Extract show identifiers (these should match packlist titles)
                    this.showIdentifiersForYear = shows
                        .filter(show => show.Identifier)
                        .map(show => show.Identifier);
                    
                    console.log('[PacklistContent] Loaded show identifiers for year', searchData.year, ':', this.showIdentifiersForYear);
                } catch (error) {
                    console.error('[PacklistContent] Error loading shows for year:', error);
                    this.showIdentifiersForYear = [];
                }
            }
        }
    },
    template: html `
        <slot>
            <cards-grid
                v-if="!isViewingPacklist"
                :show-header="true"
                :show-search="true"
                :show-refresh="true"
                :items="availablePacklists"
                :on-item-click="handlePacklistSelect"
                :on-refresh="handleRefresh"
                :is-loading="isLoading"
                :is-analyzing="isAnalyzing"
                :loading-progress="loadingProgress"
                :loading-message="analysisMessage"
                empty-message="No packlists available"
            >
                <template #header-area>
                    <saved-search-select
                        :container-path="containerPath"
                        :include-years="true"
                        :start-year="2023"
                        :default-search="selectedYear ? selectedYear.toString() : new Date().getFullYear().toString()"
                        @search-selected="handleYearSelected"
                    />
                </template>
            </cards-grid>
            
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