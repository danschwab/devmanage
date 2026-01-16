import { Requests, html, hamburgerMenuRegistry, PacklistTable, CardsComponent, NavigationRegistry, DashboardToggleComponent, getReactiveStore, findMatchingStores, createAnalysisConfig, generateStoreKey, authState, ScheduleFilterSelect, parsedateFilterParameter, invalidateCache } from '../../index.js';
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
        'ScheduleFilterSelect': ScheduleFilterSelect
    },
    props: {
        containerPath: String,
        navigateToPath: Function
    },
    inject: ['$modal', 'appContext'],
    data() {
        return {
            packlistsStore: null, // Reactive store for packlists
            autoSavedPacklists: new Set(), // Track which packlists have auto-saved data
            filter: null // Filter for schedule overlaps (date range or identifier)
        };
    },
    computed: {
        pathSegments() {
            // Strip query parameters before splitting
            const cleanPath = this.containerPath.split('?')[0];
            return cleanPath.split('/').filter(segment => segment.length > 0);
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
            
            // Format tabs for CardsComponent
            return tabs.map(tab => this.formatPacklistCard(tab));
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
        },
        // Also watch for loading state change to catch initial load completion
        'packlistsStore.isLoading': {
            handler(isLoading, wasLoading) {
                // When loading completes (isLoading goes from true to false)
                if (wasLoading && !isLoading && this.packlistsStore.data && this.packlistsStore.data.length > 0) {
                    this.checkAutoSavedPacklists();
                }
            }
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
    },
    methods: {
        async handleSearchSelected(searchData) {
            if (!searchData) {
                // Empty selection - clear filter and recreate store
                this.filter = null;
                this.packlistsStore = null;
                return;
            }

            // Handle "show all" - set special filter type
            if (searchData.type === 'show-all') {
                this.filter = { type: 'show-all' };
                this.recreateStore();
                return;
            }

            // Build filter from search data
            const filter = {};
            
            if (searchData.type === 'year') {
                // Handle year selection
                filter.startDate = searchData.startDate;
                filter.endDate = searchData.endDate;
                filter.byShowDate = true;
            } else {
                // Handle saved search - parse dateFilter parameter
                if (searchData.dateFilter) {
                    const dateFilter = parsedateFilterParameter(searchData.dateFilter);
                    Object.assign(filter, dateFilter);
                }
                
                // Add byShowDate flag if present
                if (searchData.byShowDate) {
                    filter.byShowDate = true;
                }
            }
            
            this.filter = filter;
            
            // Recreate the store with the new filter
            this.recreateStore();
        },
        recreateStore() {
            // Configure analysis for packlist descriptions
            const analysisConfig = [
                createAnalysisConfig(
                    Requests.getPacklistDescription,
                    'description',
                    'Loading packlist details...',
                    ['title'], // Use title as the source (project identifier)
                    [],
                    'description' // Store result in 'description' column
                ),
                createAnalysisConfig(
                    Requests.getShowDetails,
                    'showDetails',
                    'Loading show details...',
                    ['title'], // Use title as the source (project identifier)
                    [],
                    'showDetails' // Store entire show row in 'showDetails' column
                )
            ];
            
            // Create new reactive store with the current filter
            this.packlistsStore = getReactiveStore(
                Requests.getPacklists,
                null,
                [this.filter],
                analysisConfig
            );
        },
        formatPacklistCard(tab) {
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
            
            // Build content with ship date first, then description
            let content = '';
            
            // Add ship date first if available (use <br> to match description format)
            if (tab.showDetails && tab.showDetails.Ship) {
                content = `Ship Date: ${tab.showDetails.Ship}`;
            } else if (tab.description && !tab.showDetails) {
                // Show details analysis not complete yet
                content = 'Ship Date: ...';
            }
            
            // Add description after ship date
            const description = tab.description || '...';
            if (content) {
                content += `<br>${description}`;
            } else {
                content = description;
            }

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
        },
        async checkAutoSavedPacklists() {
            if (!authState.isAuthenticated || !authState.user?.email || !this.packlistsStore?.data) return;
            
            console.log('[PacklistContent] Checking auto-saved packlists...');
            
            try {
                // Clear the set before checking to avoid stale entries
                this.autoSavedPacklists.clear();
                
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
                        console.log(`[PacklistContent] Found auto-save for: ${tab.title}`);
                        this.autoSavedPacklists.add(tab.title);
                    }
                }
                
                console.log('[PacklistContent] Auto-saved packlists:', Array.from(this.autoSavedPacklists));
            } catch (error) {
                console.error('[PacklistContent] Error checking auto-saved packlists:', error);
            }
        },
        async handleRefresh() {
            console.log('PacklistContent: Refresh requested');
            // Invalidate the getTabs cache to force reload
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['PROD_SCHED', 'ProductionSchedule'] }, // Ensure schedule data is fresh, but don't refresh client and show ref data
                { namespace: 'database', methodName: 'getTabs', args: ['PACK_LISTS'] }
            ], true);
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
                :sync-search-with-url="true"
                :container-path="containerPath"
                :navigate-to-path="navigateToPath"
                :show-refresh="true"
                :items="availablePacklists"
                :on-item-click="handlePacklistSelect"
                :is-loading="isLoading"
                :is-analyzing="isAnalyzing"
                :loading-progress="loadingProgress"
                :loading-message="analysisMessage"
                :empty-message="packlistsStore ? 'No packlists available' : ''"
                @refresh="handleRefresh"
            >
                <template #header-area>
                    <div class="button-bar">
                        <ScheduleFilterSelect
                            :domain="'production_schedule'"
                            :include-years="true"
                            :start-year="2023"
                            :default-search="String(new Date().getFullYear())"
                            :allow-show-all="true"
                            :container-path="containerPath"
                            :navigate-to-path="navigateToPath"
                            :show-advanced-button="true"
                            @search-selected="handleSearchSelected"
                        />
                    </div>
                </template>
            </cards-grid>
            
            <!-- Individual Packlist View (Read-only or Edit mode) -->
            <packlist-table 
                v-else-if="!isDetailsView"
                :tab-name="currentPacklist"
                :container-path="containerPath"
                @navigate-to-path="navigateToPath"
            />
            
            <!-- Packlist Details View (Summary Table Only) -->
            <PacklistItemsSummary 
                v-else-if="isDetailsView"
                :project-identifier="currentPacklist"
                :container-path="containerPath"
                @navigate-to-path="navigateToPath"
            />
        </slot>
    `
};