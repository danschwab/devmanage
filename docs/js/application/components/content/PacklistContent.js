import { Requests, html, hamburgerMenuRegistry, PacklistTable, CardsComponent, NavigationRegistry, DashboardToggleComponent, getReactiveStore, findMatchingStores, createAnalysisConfig, generateStoreKey, authState, ScheduleFilterSelect, parsedateFilterParameter, invalidateCache } from '../../index.js';
import { PacklistItemsSummary } from './PacklistItemsSummary.js';

export const PacklistMenuComponent = {
    props: {
        containerPath: String,
        containerType: String,
        currentView: String,
        title: String,
        refreshCallback: Function,
        getLockInfo: Function
    },
    inject: ['$modal'],
    data() {
        return {
            lockInfo: null,
            isLoadingLockInfo: true
        };
    },
    async mounted() {
        await this.fetchLockInfo();
    },
    computed: {
        lockOwnerUsername() {
            if (!this.lockInfo || !this.lockInfo.User) return null;
            const email = this.lockInfo.User;
            return email.includes('@') ? email.split('@')[0] : email;
        },
        menuItems() {
            const items = [];
            
            // Add lock removal option if lock exists and fully loaded
            if (!this.isLoadingLockInfo && this.lockInfo) {
                items.push({ 
                    label: `Remove lock: ${this.lockOwnerUsername}`, 
                    action: 'removeLock',
                    class: 'warning'
                });
            }
            
            switch (this.currentView) {
                default:
                    items.push(
                        { label: 'Refresh', action: 'refresh' },
                        { label: 'Help', action: 'help' }
                    );
                    return items;
            }
        }
    },
    methods: {
        async fetchLockInfo() {
            this.isLoadingLockInfo = true;
            try {
                if (this.getLockInfo) {
                    this.lockInfo = await this.getLockInfo();
                    console.log('[PacklistMenu] Fetched lock info:', this.lockInfo);
                }
            } catch (error) {
                console.error('[PacklistMenu] Error fetching lock info:', error);
            } finally {
                this.isLoadingLockInfo = false;
            }
        },
        async handleAction(action) {
            switch (action) {
                case 'refresh':
                    if (this.refreshCallback) {
                        this.refreshCallback();
                    } else {
                        this.$modal.alert('Refreshing packlist data...', 'Info');
                    }
                    break;
                case 'removeLock':
                    await this.handleRemoveLock();
                    break;
                case 'help':
                    this.$modal.alert('Packlist help functionality coming soon!', 'Info');
                    break;
                default:
                    this.$modal.alert(`Action ${action} not implemented yet.`, 'Info');
            }
        },
        async handleRemoveLock() {
            if (!this.lockInfo) {
                this.$modal.alert('No lock to remove.', 'Info');
                return;
            }
            
            const username = this.lockOwnerUsername;
            const tabName = this.lockInfo.Tab; // Use the actual tab name from lock info
            
            this.$modal.confirm(
                `Are you sure you want to force unlock ${tabName}?\n${username} may have unsaved changes.`,
                async () => {
                    try {
                        const result = await Requests.forceUnlockSheet('PACK_LISTS', tabName, 'User requested via hamburger menu');
                        
                        if (result.success) {
                            // Invalidate lock cache to ensure fresh lock status
                            invalidateCache([
                                { namespace: 'app_utils', methodName: 'getSheetLock', args: ['PACK_LISTS', tabName] },
                                { namespace: 'api', methodName: 'getPacklistLock', args: [tabName] }
                            ]);
                            
                            this.$modal.alert(
                                `Lock removed successfully.\n\nPreviously locked by: ${username}\nAutosave entries backed up: ${result.backupCount}\nAutosave entries deleted: ${result.deletedCount}`,
                                'Success'
                            );
                            
                            // Refresh lock info in the menu
                            await this.fetchLockInfo();
                            
                            // Refresh page data and lock state via callback
                            if (this.refreshCallback) {
                                await this.refreshCallback();
                            }
                        } else {
                            this.$modal.alert(`Failed to remove lock: ${result.message}`, 'Error');
                        }
                    } catch (error) {
                        console.error('[PacklistMenu] Error removing lock:', error);
                        this.$modal.alert(`Error removing lock: ${error.message}`, 'Error');
                    }
                },
                () => {},
                'Confirm Force Unlock',
                'Force Unlock'
            );
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
                refreshCallback: this.handleRefresh,
                getLockInfo: async () => {
                    // Get lock info from the current packlist if we're viewing one
                    const packlistName = this.currentPacklist;
                    console.log('[PacklistContent] getLockInfo called:', { 
                        packlistName, 
                        hasStore: !!this.packlistsStore,
                        storeData: this.packlistsStore?.data?.length
                    });
                    
                    if (!packlistName) return null;
                    
                    // Always fetch directly from API to ensure fresh lock status
                    // (bypasses store which may have stale analysis data)
                    console.log('[PacklistContent] Fetching lock info directly for:', packlistName);
                    const lockInfo = await Requests.getPacklistLock(packlistName);
                    console.log('[PacklistContent] Lock info from API:', lockInfo);
                    return lockInfo;
                }
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
                // Check lock status first - this determines card color
                createAnalysisConfig(
                    Requests.getPacklistLock,
                    'lockInfo',
                    'Checking lock status...',
                    ['title'], // Extract tab name from 'title' column
                    [authState.user?.email], // Pass current user to filter out their own locks
                    'lockInfo' // Store lock info in 'lockInfo' column
                ),
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
            console.log(`[PacklistContent.formatPacklistCard] Formatting card for "${tab.title}", lockInfo:`, tab.lockInfo);
            // Find any reactive stores for this packlist (regardless of analysis config)
            const matchingStores = findMatchingStores(
                Requests.getPackList,
                [tab.title]
            );
            
            // If a reactive store exists, use its state. Otherwise check userData for auto-save
            const hasUnsavedChanges = matchingStores.length > 0
                ? matchingStores.some(match => match.isModified)
                : this.autoSavedPacklists.has(tab.title);
            
            // Check if the packlist is locked
            const isLocked = tab.lockInfo && tab.lockInfo !== null;
            console.log(`[PacklistContent.formatPacklistCard] "${tab.title}" - isLocked: ${isLocked}, hasUnsavedChanges: ${hasUnsavedChanges}`);
            
            // Determine card styling based on lock state and unsaved changes
            // Priority: locked (white) > unsaved changes (red) > normal (gray)
            const cardClass = isLocked ? 'white' : (hasUnsavedChanges ? 'red' : 'gray');
            console.log(`[PacklistContent.formatPacklistCard] "${tab.title}" - cardClass: ${cardClass}`);
            
            // Build content footer
            let contentFooter = undefined;
            if (isLocked) {
                const lockOwner = tab.lockInfo.User || 'Unknown';
                const username = lockOwner.includes('@') ? lockOwner.split('@')[0] : lockOwner;
                contentFooter = `Locked for edit by: ${username}`;
            } else if (hasUnsavedChanges) {
                contentFooter = 'Unsaved changes';
            }
            
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
            
            // If viewing a packlist table, refresh its lock status
            if (this.$refs.packlistTable) {
                await this.$refs.packlistTable.checkLockStatus();
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
                ref="packlistTable"
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