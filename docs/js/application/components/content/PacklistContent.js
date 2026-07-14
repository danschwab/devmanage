import { Requests, html, hamburgerMenuRegistry, PacklistTable, CardsComponent, NavigationRegistry, DashboardToggleComponent, getReactiveStore, findMatchingStores, createAnalysisConfig, generateStoreKey, authState, ScheduleFilterSelect, invalidateCache, Priority } from '../../index.js';
import { normalizeFilterValues } from '../../../data_management/utils/helpers.js';
import { PacklistItemsSummary } from './PacklistItemsSummary.js';
import { ScheduleTableComponent } from './ScheduleTable.js';
import { PacklistTableMenuComponent } from './PacklistTable.js';

export const PacklistMenuComponent = {
    props: {
        containerPath: String,
        containerType: String,
        currentView: String,
        title: String,
        refreshCallback: Function,
        navigateToPath: Function
    },
    inject: ['$modal'],
    emits: ['close-modal'],
    computed: {
        currentPacklistName() {
            // Extract packlist name from containerPath
            // Format: packlist/{name} or packlist/{name}/details or packlist/{name}/edit
            if (!this.containerPath) return null;
            const cleanPath = this.containerPath.split('?')[0];
            const segments = cleanPath.split('/').filter(segment => segment.length > 0);
            // segments[0] = 'packlist', segments[1] = packlist name
            return segments[1] || null;
        },
        isViewingSpecificPacklist() {
            return !!this.currentPacklistName;
        },
        menuItems() {
            const items = [];
            
            switch (this.currentView) {
                default:
                    // Show duplicate option only when viewing a specific packlist (not on reserved pages like pins)
                    if (this.isViewingSpecificPacklist && this.currentPacklistName !== 'pins') {
                        items.push({ label: 'Duplicate This Packlist', action: 'duplicatePacklist' });
                    }
                    
                    items.push(
                        { label: 'Create Show Packlist', action: 'createNewPacklist' },
                        { label: 'Create Custom Packlist', action: 'createCustomPacklist' }
                        // { label: 'Help', action: 'help' } // Placeholder - not yet implemented
                    );
                    return items;
            }
        }
    },
    methods: {
        async handleAction(action) {
            switch (action) {
                case 'createNewPacklist':
                    this.openCreatePacklistModal();
                    break;
                case 'createCustomPacklist':
                    this.openCreateCustomPacklistModal();
                    break;
                case 'duplicatePacklist':
                    this.openDuplicatePacklistModal();
                    break;
                // case 'help': // Placeholder - not yet implemented
                //     this.$modal.alert('Packlist help functionality coming soon!', 'Info');
                //     break;
                default:
                    this.$modal.alert(`Action ${action} not implemented yet.`, 'Info');
            }
        },
        openCreatePacklistModal(templateName = '_TEMPLATE') {
            // Close the hamburger menu modal first
            this.$emit('close-modal');
            
            const parentNavigateToPath = this.navigateToPath;
            
            const CreatePacklistModalContent = {
                components: {
                    'schedule-table': ScheduleTableComponent,
                    'ScheduleFilterSelect': ScheduleFilterSelect
                },
                props: {
                    navigateToPath: Function,
                    templateName: {
                        type: String,
                        default: '_TEMPLATE'
                    }
                },
                emits: ['close-modal'],
                data() {
                    return {
                        filter: null
                    };
                },
                computed: {
                    // Split filter into dateFilters and searchParams for table
                    dateFilter() {
                        if (!this.filter) return null;
                        const { searchParams, ...dateFilter } = this.filter;
                        return Object.keys(dateFilter).length > 0 ? dateFilter : null;
                    },
                    tableSearchParams() {
                        return this.filter?.searchParams || null;
                    }
                },
                methods: {
                    handleSearchSelected(searchData) {
                        // Handle empty/null search - clear the filter
                        if (!searchData) {
                            this.filter = null;
                            return;
                        }
                        
                        if (searchData.type === 'year') {
                            // Handle year selection - use dateFilters array
                            this.filter = { 
                                dateFilters: searchData.dateFilters || [
                                    { column: 'Date', value: searchData.startDate, type: 'after' },
                                    { column: 'Date', value: searchData.endDate, type: 'before' }
                                ]
                            };
                        } else {
                            // Handle saved search or URL params
                            this.applySavedSearch(searchData);
                        }
                    },
                    
                    applySavedSearch(searchData) {
                        const filter = {
                            searchParams: {}
                        };
                        
                        // Use dateFilters array from saved search
                        if (searchData.dateFilters && searchData.dateFilters.length > 0) {
                            filter.dateFilters = searchData.dateFilters;
                        }
                        
                        // Apply text filters
                        if (searchData.textFilters && searchData.textFilters.length > 0) {
                            searchData.textFilters.forEach(textFilter => {
                                if (textFilter.column && (textFilter.values || textFilter.value)) {
                                    filter.searchParams[textFilter.column] = {
                                        values: normalizeFilterValues(textFilter),
                                        type: textFilter.type || 'contains'
                                    };
                                }
                            });
                        }
                        
                        this.filter = filter;
                    },
                    
                    handleNavigateToPath(path) {
                        // Close modal first
                        this.$emit('close-modal');
                        // Then navigate
                        if (this.navigateToPath) {
                            this.navigateToPath(path);
                        }
                    },
                    
                    handlePacklistCreated() {
                        // Close modal after packlist is created
                        this.$emit('close-modal');
                    }
                },
                template: html`
                    <div>
                        <p style="margin-bottom: 1rem;">
                            Search for a show and click "Create Packlist" to create a new pack list.
                        </p>
                        <schedule-table
                            :filter="dateFilter"
                            :search-params="tableSearchParams"
                            :hide-rows-on-search="true"
                            :template-name="templateName"
                            @navigate-to-path="handleNavigateToPath"
                            @packlist-created="handlePacklistCreated"
                        >
                            <template #header-area>
                                <div class="button-bar">
                                    <ScheduleFilterSelect
                                        :include-years="true"
                                        :start-year="2023"
                                        :show-advanced-button="false"
                                        @search-selected="handleSearchSelected"
                                    />
                                </div>
                            </template>
                        </schedule-table>
                    </div>
                `
            };
            
            this.$modal.custom(
                CreatePacklistModalContent,
                { modalClass: 'page-menu', navigateToPath: parentNavigateToPath, templateName: templateName },
                templateName === '_TEMPLATE' ? 'Create Show Packlist' : 'Duplicate Packlist Attached to Show'
            );
        },
        openCreateCustomPacklistModal(templateName = '_TEMPLATE') {
            // Close the hamburger menu modal first
            this.$emit('close-modal');
            
            const parentNavigateToPath = this.navigateToPath;
            
            const CustomPacklistModalContent = {
                inject: ['$modal'],
                props: {
                    navigateToPath: Function,
                    templateName: {
                        type: String,
                        default: '_TEMPLATE'
                    }
                },
                emits: ['close-modal'],
                data() {
                    return {
                        packlistName: '',
                        isCreating: false
                    };
                },
                methods: {
                    async handleCreate() {
                        const name = this.packlistName.trim();
                        
                        if (!name) {
                            this.$modal.alert('Please enter a packlist name.', 'Validation Error');
                            return;
                        }
                        
                        this.isCreating = true;
                        try {
                            // Create the tab from template
                            await Requests.createNewTab('PACK_LISTS', this.templateName, name);
                            
                            // Close modal
                            this.$emit('close-modal');
                            
                            // Navigate to the new packlist
                            if (this.navigateToPath) {
                                this.navigateToPath(`packlist/${name}`);
                            }
                        } catch (error) {
                            console.error('Error creating custom packlist:', error);
                            this.$modal.error(`Failed to create packlist: ${error.message}`, 'Error');
                        } finally {
                            this.isCreating = false;
                        }
                    },
                    handleCancel() {
                        this.$emit('close-modal');
                    }
                },
                template: html`
                    <slot>
                        <div v-if="templateName === '_TEMPLATE'" class="card yellow">
                            <p><strong>Note:</strong> To attach a new packlist to a show, cancel and use "Create Show Packlist". <br> <em>This packlist will not be visible when packlists are filtered by the production schedule.</em></p>
                        </div>
                        <div v-else class="card">
                            <p><strong>Duplicating:</strong> {{ templateName }}</p>
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <label for="packlistNameInput" style="display: block; margin-bottom: 0.5rem; font-weight: bold;">
                                {{ templateName === '_TEMPLATE' ? 'Packlist Name:' : 'New Packlist Name:' }}
                            </label>
                            <input 
                                id="packlistNameInput"
                                v-model="packlistName" 
                                type="text" 
                                placeholder="Enter packlist name" 
                                style="width: 100%; padding: 0.5rem; font-size: 1rem;"
                                :disabled="isCreating"
                                @keyup.enter="handleCreate"
                            />
                        </div>
                        <div class="button-bar">
                            <button @click="handleCreate" :disabled="isCreating || !packlistName.trim()">
                                {{ isCreating ? 'Creating...' : 'Create' }}
                            </button>
                            <button @click="handleCancel" class="gray" :disabled="isCreating">
                                Cancel
                            </button>
                        </div>
                    </slot>
                `
            };
            
            this.$modal.custom(
                CustomPacklistModalContent,
                { modalClass: 'reading-menu', navigateToPath: parentNavigateToPath, templateName: templateName },
                templateName === '_TEMPLATE' ? 'Create Custom Packlist' : 'Duplicate As Custom Packlist'
            );
        },
        openDuplicatePacklistModal() {
            // Close the hamburger menu modal first
            this.$emit('close-modal');
            
            const currentPacklist = this.currentPacklistName;
            if (!currentPacklist) {
                this.$modal.alert('No packlist selected to duplicate.', 'Error');
                return;
            }
            
            const DuplicateChoiceModalContent = {
                inject: ['$modal'],
                props: {
                    currentPacklist: String,
                    openShowPacklistModal: Function,
                    openCustomPacklistModal: Function
                },
                emits: ['close-modal'],
                methods: {
                    handleDuplicateAttachedToShow() {
                        this.$emit('close-modal');
                        if (this.openShowPacklistModal) {
                            this.openShowPacklistModal(this.currentPacklist);
                        }
                    },
                    handleDuplicateAsCustom() {
                        this.$emit('close-modal');
                        if (this.openCustomPacklistModal) {
                            this.openCustomPacklistModal(this.currentPacklist);
                        }
                    },
                    handleCancel() {
                        this.$emit('close-modal');
                    }
                },
                template: html`
                    <div>
                        <p style="margin-bottom: 1.5rem;">Choose how to duplicate "{{ currentPacklist }}":</p>
                        <div class="button-bar" style="flex-direction: column; gap: 0.5rem;">
                            <button @click="handleDuplicateAttachedToShow" style="width: 100%;">
                                Duplicate Attached to Show
                            </button>
                            <button @click="handleDuplicateAsCustom" style="width: 100%;">
                                Duplicate As Custom
                            </button>
                            <button @click="handleCancel" class="gray" style="width: 100%;">
                                Cancel
                            </button>
                        </div>
                    </div>
                `
            };
            
            this.$modal.custom(
                DuplicateChoiceModalContent,
                { 
                    modalClass: 'reading-menu',
                    currentPacklist: currentPacklist,
                    openShowPacklistModal: this.openCreatePacklistModal.bind(this),
                    openCustomPacklistModal: this.openCreateCustomPacklistModal.bind(this)
                },
                'Duplicate Packlist'
            );
        }
    },
    template: html`
        <ul>
            <li v-for="item in menuItems" :key="item.action">
                <button 
                    @click="handleAction(item.action)"
                    :disabled="item.disabled"
                    :class="item.class">
                    {{ item.label }}
                </button>
            </li>
        </ul>
    `
};





const PacklistPinToggleComponent = {
    props: {
        containerPath: String
    },
    computed: {
        currentPacklistName() {
            if (!this.containerPath) return null;
            const segments = this.containerPath.split('?')[0].split('/').filter(Boolean);
            return (segments[0] === 'packlist' && segments[1] && segments[1] !== 'pins')
                ? segments[1]
                : null;
        },
        pinnedStore() {
            if (!authState.user?.email) return null;
            return getReactiveStore(Requests.getUserData, Requests.storeUserData, [authState.user.email, 'pinned_packlists']);
        },
        isPinned() {
            return this.currentPacklistName ? this.pinnedStore?.data?.includes(this.currentPacklistName) : false;
        }
    },
    methods: {
        async handleToggle() {
            const store = this.pinnedStore;
            if (!store || !this.currentPacklistName) return;
            const idx = store.data.indexOf(this.currentPacklistName);
            if (idx !== -1) store.data.splice(idx, 1);
            else store.data.push(this.currentPacklistName);
            await store.save();
        }
    },
    template: html`
        <button
            v-if="currentPacklistName"
            @click="handleToggle"
            :class="{ 'red': isPinned, 'green': !isPinned }">
            {{ isPinned ? 'Unpin Packlist' : 'Pin Packlist' }}
        </button>
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
            filter: null, // Filter for schedule overlaps (date range or identifier)
            resolvedTabName: null, // Verified actual tab name after resolution
            packlistNotFound: false, // True when route segment doesn't match any packlist
            isResolving: false // True while resolving identifier
        };
    },
    computed: {
        pinnedPacklistsStore() {
            if (!authState.user?.email) return null;
            return getReactiveStore(Requests.getUserData, Requests.storeUserData, [authState.user.email, 'pinned_packlists']);
        },
        pinnedPacklists() {
            return new Set(this.pinnedPacklistsStore?.data || []);
        },
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
            return !!this.currentPacklist && this.currentPacklist !== 'packlist' && this.currentPacklist !== 'pins';
        },
        // Check if we're viewing pinned cards based on URL
        showPinnedOnly() {
            return this.pathSegments[1] === 'pins';
        },
        // Computed properties for cards grid
        availablePacklists() {
            if (!this.packlistsStore) return [];
            
            const tabs = this.packlistsStore.data || [];
            
            // Add explicit dependency on analysis state to trigger reactivity
            // when analysis completes (including lock info analysis)
            const isAnalyzing = this.packlistsStore.isAnalyzing;
            const analysisProgress = this.packlistsStore.analysisProgress;
            
            // Filter for pinned cards if showPinnedOnly is true
            const filteredTabs = this.showPinnedOnly
                ? tabs.filter(tab => {
                    // Always include explicitly pinned packlists.
                    if (this.pinnedPacklists.has(tab.title)) {
                        return true;
                    }

                    // Also include packlists with unsaved/auto-saved changes.
                    const matchingStores = findMatchingStores(
                        Requests.getPackList,
                        [tab.title]
                    );
                    const hasUnsavedChanges = matchingStores.length > 0
                        ? matchingStores.some(match => match.isModified)
                        : this.autoSavedPacklists.has(tab.title);

                    if (hasUnsavedChanges) return true;

                    // Also include packlists that are unattached to any schedule row
                    // (title has CLIENT YEAR SHOW structure but no matching schedule row).
                    const attachment = tab.scheduleAttachment;
                    if (attachment && !attachment.attached && attachment.hasIdentifierParts) {
                        return true;
                    }

                    return false;
                })
                : tabs;
            
            // Format tabs for CardsComponent
            return filteredTabs.map(tab => this.formatPacklistCard(tab));
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
        // Watch for route changes to resolve packlist identifier
        currentPacklist: {
            handler(newVal, oldVal) {
                if (newVal && newVal !== 'packlist' && newVal !== 'pins' && newVal !== oldVal) {
                    this.resolvePacklistIdentifier(newVal);
                }
            },
            immediate: true
        },
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
        },
        // Watch for showPinnedOnly changes to apply "Show All" filter
        showPinnedOnly: {
            handler(isPinnedView) {
                if (isPinnedView) {
                    // Apply "Show All" filter when viewing pinned cards
                    this.filter = { type: 'show-all' };
                    this.recreateStore();
                }
            },
            immediate: true
        }
    },
    async mounted() {
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
            components: [PacklistMenuComponent, PacklistTableMenuComponent, PacklistPinToggleComponent, DashboardToggleComponent],
            props: {
                refreshCallback: this.handleRefresh,
                navigateToPath: this.navigateToPath,
                getTableRef: () => this.$refs.packlistTable,
                getLockInfo: async () => {
                    // Get lock info from the current packlist if we're viewing one
                    const packlistName = this.currentPacklist;
                    // console.log('[PacklistContent] getLockInfo called:', { 
                    //     packlistName, 
                    //     hasStore: !!this.packlistsStore,
                    //     storeData: this.packlistsStore?.data?.length
                    // });
                    
                    if (!packlistName) return null;
                    
                    // Always fetch directly from API to ensure fresh lock status
                    // (bypasses store which may have stale analysis data)
                    // console.log('[PacklistContent] Fetching lock info directly for:', packlistName);
                    const lockInfo = await Requests.getPacklistLock(packlistName);
                    // console.log('[PacklistContent] Lock info from API:', lockInfo);
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
                // Handle year selection - use dateFilters array
                filter.dateFilters = searchData.dateFilters || [
                    { column: 'Date', value: searchData.startDate, type: 'after' },
                    { column: 'Date', value: searchData.endDate, type: 'before' }
                ];
            } else {
                // Handle saved search - use dateFilters array
                if (searchData.dateFilters) {
                    filter.dateFilters = searchData.dateFilters;
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
                    'description', // Store result in 'description' column
                    false,
                    Priority.ANALYSIS,
                    false,
                    false // nonessential
                ),
                createAnalysisConfig(
                    Requests.getShowDetails,
                    'showDetails',
                    'Loading show details...',
                    ['title'], // Use title as the source (project identifier)
                    [],
                    'showDetails' // Store entire show row in 'showDetails' column
                ),
                createAnalysisConfig(
                    Requests.getPacklistScheduleAttachment,
                    'scheduleAttachment',
                    'Checking schedule...',
                    ['title'], // Use title as the source (project identifier)
                    [],
                    'scheduleAttachment' // Store attachment diagnosis in 'scheduleAttachment' column
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
            //console.log(`[PacklistContent.formatPacklistCard] Formatting card for "${tab.title}", lockInfo:`, tab.lockInfo);
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
            //console.log(`[PacklistContent.formatPacklistCard] "${tab.title}" - isLocked: ${isLocked}, hasUnsavedChanges: ${hasUnsavedChanges}`);

            // Check schedule attachment state
            const attachment = tab.scheduleAttachment;
            const isUnattached = attachment && !attachment.attached && attachment.hasIdentifierParts;

            // Determine card styling based on lock state, unsaved changes, and schedule attachment.
            // Priority: locked (yellow) > unsaved changes (red) > unattached (orange) > normal (gray).
            const cardClass = isUnattached ? 'red' : 'gray';
            //console.log(`[PacklistContent.formatPacklistCard] "${tab.title}" - cardClass: ${cardClass}`);
            
            // Build content footer
            let contentFooter = undefined;
            if (isLocked) {
                const lockOwner = tab.lockInfo.user || 'Unknown';
                const username = lockOwner.includes('@') ? lockOwner.split('@')[0] : lockOwner;
                contentFooter = `Locked for edit by: ${username}`;
            } else if (hasUnsavedChanges) {
                contentFooter = 'Unsaved changes';
            }

            // Build footer action buttons
            let footerActions = [];
            
            // Add green Save button for unsaved packlists
            if (hasUnsavedChanges) {
                footerActions.push({
                    label: 'Save',
                    class: 'green',
                    onClick: () => this.savePacklist(tab.title)
                });
            }

            // Add red buttons for unattached schedule packlists with missing client/show
            if (isUnattached) {
                const clientIssue = attachment.clientIssue;
                const showIssue = attachment.showIssue;
                if (clientIssue || showIssue) {
                    if (clientIssue) {
                        footerActions.push({
                            label: '⚠ Client missing',
                            class: 'red',
                            onClick: () => this.openPacklistIndexResolutionModal(tab.title, 'client', clientIssue.rawValue)
                        });
                    }
                    if (showIssue) {
                        footerActions.push({
                            label: '⚠ Show missing',
                            class: 'red',
                            onClick: () => this.openPacklistIndexResolutionModal(tab.title, 'show', showIssue.rawValue)
                        });
                    }
                } else {
                    contentFooter = 'Packlist not found on schedule';
                }
            }

            // Only set footerActions if there are any actions; otherwise undefined
            if (footerActions.length === 0) {
                footerActions = undefined;
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
            const description = tab.description || (this.packlistsStore ? (this.packlistsStore.isAnalyzing ? 'Loading...' : '') : '');
            if (content) {
                content += `<br>${description}`;
            } else {
                content = description;
            }

            const shipDate = tab.showDetails?.Ship || null;

            return {
                id: tab.sheetId,
                title: tab.title,
                shipDate,
                content: content,
                cardClass: cardClass,
                contentFooter: contentFooter,
                footerActions: footerActions
            };
        },
        async resolvePacklistIdentifier(identifier) {
            // Reset state
            this.packlistNotFound = false;
            this.resolvedTabName = null;
            this.isResolving = true;
            
            try {
                // Resolve the identifier to actual tab name
                const resolvedName = await Requests.resolvePacklistIdentifier(identifier);
                
                if (!resolvedName) {
                    // No matching packlist found
                    this.packlistNotFound = true;
                    console.warn(`[PacklistContent] Packlist not found: ${identifier}`);
                    return;
                }
                
                if (resolvedName !== identifier) {
                    // Route uses non-canonical name, redirect to actual tab name
                    //console.log(`[PacklistContent] Redirecting from "${identifier}" to canonical "${resolvedName}"`);
                    
                    // Build new path with resolved name
                    const segments = this.containerPath.split('/');
                    segments[1] = resolvedName;
                    const newPath = segments.join('/');
                    
                    // Call navigateToPath directly (not emit) with replaceHistory to avoid back-button confusion
                    this.navigateToPath({ targetPath: newPath, replaceHistory: true });
                    return;
                }
                
                // Identifier matches actual tab name, proceed
                this.resolvedTabName = resolvedName;
                //console.log(`[PacklistContent] Verified packlist: ${resolvedName}`);
                
            } catch (error) {
                console.error('[PacklistContent] Error resolving packlist identifier:', error);
                this.packlistNotFound = true;
            } finally {
                this.isResolving = false;
            }
        },
        async checkAutoSavedPacklists() {
            if (!authState.isAuthenticated || !authState.user?.email || !this.packlistsStore?.data) return;
            
            //console.log('[PacklistContent] Checking auto-saved packlists...');
            
            try {
                // Clear the set before checking to avoid stale entries
                this.autoSavedPacklists.clear();
                
                // Check each individual packlist for auto-saved data
                for (const tab of this.packlistsStore.data) {
                    if (tab.title === '_TEMPLATE') continue;
                    
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
                        //console.log(`[PacklistContent] Found auto-save for: ${tab.title}`);
                        this.autoSavedPacklists.add(tab.title);
                    }
                }
                
                //console.log('[PacklistContent] Auto-saved packlists:', Array.from(this.autoSavedPacklists));
            } catch (error) {
                console.error('[PacklistContent] Error checking auto-saved packlists:', error);
            }
        },
        async handleRefresh() {
            //console.log('PacklistContent: Refresh requested');
            // Invalidate the getTabs cache to force reload
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['PROD_SCHED', 'Production Schedule'] }, // Ensure schedule data is fresh, but don't refresh client and show ref data
                { namespace: 'database', methodName: 'getTabs', args: ['PACK_LISTS'] },
                { namespace: 'database', methodName: 'getData', args: ['PACK_LISTS'] }
            ], true);
            
            // If viewing a packlist table, refresh its lock status
            if (this.$refs.packlistTable) {
                await this.$refs.packlistTable.checkLockStatus();
            }
        },
        handlePacklistSelect(packlistName) {
            this.navigateToPath('packlist/' + packlistName);
        },
        async togglePin(packlistName) {
            const store = this.pinnedPacklistsStore;
            if (!store) return;
            const idx = store.data.indexOf(packlistName);
            if (idx !== -1) store.data.splice(idx, 1);
            else store.data.push(packlistName);
            await store.save();
        },
        togglePinnedView() {
            // Navigate between packlist and packlist/pins
            if (this.showPinnedOnly) {
                this.navigateToPath('packlist');
            } else {
                this.navigateToPath('packlist/pins');
            }
        },
        async savePacklist(packlistName) {
            try {
                // Find the reactive store for this packlist
                const matchingStores = findMatchingStores(
                    Requests.getPackList,
                    [packlistName]
                );
                if (matchingStores.length === 0) {
                    this.$modal.alert('Packlist not found or no changes to save.', 'Save');
                    return;
                }
                const storeMatch = matchingStores[0];
                if (!storeMatch.isModified) {
                    this.$modal.alert('No unsaved changes to save.', 'Save');
                    return;
                }
                await storeMatch.store.save();
                this.$modal.alert('Packlist saved successfully.', 'Success');
            } catch (error) {
                console.error('[PacklistContent] Failed to save packlist:', error);
                this.$modal.error(`Failed to save packlist: ${error.message}`, 'Save Error');
            }
        },
        async openPacklistIndexResolutionModal(packlistTitle, referenceType, rawValue, includeAllCandidates = false) {
            try {
                const resolutionData = await Requests.getScheduleReferenceResolutionOptions(
                    referenceType,
                    rawValue,
                    includeAllCandidates
                );

                const options = resolutionData?.options || [];
                if (options.length === 0) {
                    this.$modal.alert('No resolution options available for this value.', 'Missing');
                    return;
                }

                const modalTitle = includeAllCandidates
                    ? `Select ${referenceType}`
                    : `${referenceType === 'show' ? 'Show' : 'Client'} Missing`;

                const issue = { referenceType, rawValue };
                const self = this;

                const IndexResolutionComponent = {
                    inject: ['$modal'],
                    props: {
                        issue: Object,
                        options: Array,
                        includeAllCandidates: Boolean,
                        onSelectOption: Function
                    },
                    data() {
                        return {
                            filterText: '',
                            isSubmitting: false
                        };
                    },
                    computed: {
                        filteredOptions() {
                            if (!this.includeAllCandidates || !this.filterText.trim()) {
                                return this.options;
                            }
                            const search = this.filterText.trim().toLowerCase();
                            return this.options.filter(option => {
                                const searchableText = option.canonicalName || option.label;
                                return searchableText.toLowerCase().includes(search);
                            });
                        }
                    },
                    methods: {
                        async selectOption(option) {
                            if (this.isSubmitting) return;
                            this.isSubmitting = true;
                            try {
                                let result;
                                if (this.onSelectOption) {
                                    result = await this.onSelectOption(option);
                                }
                                if (!result || result.applied || result.browsedAll) {
                                    this.$emit('close-modal');
                                } else {
                                    this.isSubmitting = false;
                                }
                            } catch (error) {
                                this.isSubmitting = false;
                            }
                        },
                        async openCustomEntryModal() {
                            if (this.isSubmitting) return;
                            const CustomEntryComponent = {
                                props: { issue: Object, onSubmit: Function },
                                data() { return { customName: '', isSubmitting: false, errorMessage: '' }; },
                                methods: {
                                    async submitCustomName() {
                                        if (this.isSubmitting) return;
                                        const nextName = this.customName.trim();
                                        if (!nextName) { this.errorMessage = 'Enter a name before submitting.'; return; }
                                        this.isSubmitting = true;
                                        this.errorMessage = '';
                                        try {
                                            const result = await this.onSubmit?.(nextName);
                                            if (result?.applied) { this.$emit('close-modal'); return; }
                                            this.errorMessage = result?.message || 'That value already exists in the index or abbreviations.';
                                        } catch (error) {
                                            this.errorMessage = error?.message || 'Unable to add the custom entry.';
                                        } finally { this.isSubmitting = false; }
                                    }
                                },
                                template: html`
                                    <div :style="isSubmitting ? 'opacity: 0.7;' : ''">
                                        <p>Enter a custom new {{ issue.referenceType }}.</p>
                                        <p>The new name must not already exist in the index or abbreviations.</p>
                                        <div class="input-container" style="margin: 0.75rem 0;">
                                            <input type="text" v-model="customName" :disabled="isSubmitting" :placeholder="'Enter custom new ' + issue.referenceType" class="search-input" style="width: 100%;" @keydown.enter.prevent="submitCustomName" />
                                        </div>
                                        <p v-if="errorMessage" style="color: var(--color-red, #b00020); margin-bottom: 0.75rem;">{{ errorMessage }}</p>
                                        <div class="button-bar">
                                            <button @click="submitCustomName" :disabled="isSubmitting || !customName.trim()" class="blue">Submit</button>
                                            <button @click="$emit('close-modal')" :disabled="isSubmitting" class="gray">Cancel</button>
                                        </div>
                                    </div>
                                `
                            };
                            this.$modal.custom(CustomEntryComponent, {
                                issue: this.issue,
                                onSubmit: async (customName) => {
                                    if (this.onSelectOption) {
                                        const result = await this.onSelectOption({
                                            actionType: 'add-custom',
                                            canonicalName: customName,
                                            abbreviation: this.issue.rawValue
                                        });
                                        if (result?.applied) { this.$emit('close-modal'); }
                                        return result;
                                    }
                                    return { applied: false, message: 'Unable to submit the custom entry.' };
                                },
                                modalClass: 'hamburger-menu'
                            }, `Enter custom new ${this.issue.referenceType}`);
                        }
                    },
                    template: html`
                        <div :style="isSubmitting ? 'opacity: 0.7;' : ''">
                            <div v-if="includeAllCandidates" class="input-container" style="margin-bottom: 0.5rem;">
                                <input type="text" v-model="filterText" :disabled="isSubmitting" placeholder="Filter options..." class="search-input" style="width: 100%;" />
                            </div>
                            <div v-else style="margin-bottom: 1rem;">
                                <p>A production schedule index entry was missing.</p>
                                <p v-if="isSubmitting">Applying update...</p>
                                <p v-else>Resolve below to prevent analytics issues:</p>
                            </div>
                            <ul>
                                <li v-for="option in filteredOptions" :key="option.actionType + '-' + option.label">
                                    <button @click="selectOption(option)" :disabled="isSubmitting" :class="option.buttonClass || 'white'" style="text-align: left;">{{ option.label }}</button>
                                </li>
                                <li v-if="!includeAllCandidates" style="margin-top: 0.5rem;">
                                    <button @click="openCustomEntryModal" :disabled="isSubmitting" class="blue" style="text-align: left; width: 100%;">Enter custom new {{ issue.referenceType }}</button>
                                </li>
                            </ul>
                        </div>
                    `
                };

                this.$modal.custom(IndexResolutionComponent, {
                    issue,
                    options,
                    includeAllCandidates,
                    onSelectOption: async (option) => {
                        return await this.applyPacklistIndexResolution(option, issue, packlistTitle, referenceType, rawValue, includeAllCandidates);
                    },
                    modalClass: 'hamburger-menu'
                }, modalTitle);
            } catch (error) {
                console.error('[PacklistContent] Failed to open index resolution modal:', error);
                this.$modal.error(`Failed to load resolution options: ${error.message}`, 'Index Resolution Error');
            }
        },
        async applyPacklistIndexResolution(option, issue, packlistTitle, referenceType, rawValue, includeAllCandidates) {
            try {
                if (!option) return { applied: false };

                if (option.actionType === 'browse-all') {
                    await this.openPacklistIndexResolutionModal(packlistTitle, referenceType, rawValue, true);
                    return { applied: false, browsedAll: true };
                }

                if (option.actionType === 'add-new') {
                    await Requests.addScheduleReferenceName(referenceType, option.canonicalName);
                } else if (option.actionType === 'add-abbreviation') {
                    await Requests.appendScheduleReferenceAbbreviation(referenceType, option.canonicalName, option.abbreviation);
                } else if (option.actionType === 'add-custom') {
                    const result = await Requests.addCustomScheduleReferenceEntry(referenceType, option.canonicalName, option.abbreviation);
                    if (!result?.applied) {
                        const conflictName = result?.conflict?.existingName || '';
                        const conflictValue = result?.conflict?.value || option.canonicalName;
                        const fieldLabel = result?.conflict?.field === 'abbreviation' ? 'abbreviation' : 'name';
                        return {
                            applied: false,
                            message: `The ${fieldLabel} "${conflictValue}" already exists${conflictName ? ` on ${conflictName}` : ''}.`
                        };
                    }
                    return { applied: true };
                } else {
                    return { applied: false };
                }

                // Invalidate schedule and reference index caches so the store re-analyzes
                invalidateCache([
                    { namespace: 'database', methodName: 'getData', args: ['PROD_SCHED', 'Production Schedule'] },
                    { namespace: 'database', methodName: 'getData', args: ['CACHE', 'Clients'] },
                    { namespace: 'database', methodName: 'getData', args: ['CACHE', 'Shows'] }
                ], true);

                return { applied: true };
            } catch (error) {
                console.error('[PacklistContent] Failed to apply index resolution:', error);
                this.$modal.error(`Failed to apply resolution: ${error.message}`, 'Index Resolution Error');
                return { applied: false, message: error.message };
            }
        }
    },
    template: html `
        <slot>
            <cards-grid
                v-if="!isViewingPacklist"
                :show-header="true"
                :show-search="true"
                :show-sort="true"
                :sync-search-with-url="true"
                :container-path="containerPath"
                :navigate-to-path="navigateToPath"
                :show-refresh="true"
                :items="availablePacklists"
                :sort-columns="[
                    { key: 'title', label: 'Title', type: 'string', sortable: true },
                    { key: 'shipDate', label: 'Ship Date', type: 'date', sortable: true }
                ]"
                default-sort-column="title"
                :on-item-click="handlePacklistSelect"
                :is-loading="isLoading"
                :is-analyzing="isAnalyzing"
                :loading-progress="loadingProgress"
                :loading-message="analysisMessage"
                :empty-message="packlistsStore ? (showPinnedOnly ? 'No pinned packlists' : 'No packlists available') : ''"
                :show-pin-buttons="true"
                :pinned-items="pinnedPacklists"
                :show-pinned-only="showPinnedOnly"
                @refresh="handleRefresh"
                @toggle-pin="togglePin"
            >
                <template #header-area>
                    <div class="button-bar">
                        <ScheduleFilterSelect
                            v-if="!showPinnedOnly"
                            :domain="'production_schedule'"
                            :include-years="true"
                            :start-year="2023"
                            :allow-show-all="true"
                            :container-path="containerPath"
                            :navigate-to-path="navigateToPath"
                            :show-advanced-button="true"
                            @search-selected="handleSearchSelected"
                        />
                        <button v-if="!showPinnedOnly" @click="togglePinnedView" class="button-symbol" title="show pinned and unsaved packlists"><span class="material-symbols-outlined">keep</span></button>
                        <div v-if="showPinnedOnly" class='card' style="white-space: nowrap; padding: var(--padding-sm) var(--padding-md);">showing pinned or unsaved packlists</div>
                        <button v-if="showPinnedOnly" @click="togglePinnedView" class="small">Back</button>
                    </div>
                </template>
            </cards-grid>
            
            <!-- Loading state while resolving identifier -->
            <div v-else-if="isResolving" class="loading-message">
                <img src="assets/loading.gif" alt="..."/>
                <p>Finding packlist...</p>
            </div>
            
            <!-- 404 state when packlist not found -->
            <div v-else-if="packlistNotFound">
                <div class="card red">
                    <h3>Packlist Not Found</h3>
                    <p>"{{ currentPacklist }}" could not be found.</p>
                </div>
            </div>
            
            <!-- Individual Packlist View (Read-only or Edit mode) - only render after verification -->
            <packlist-table 
                ref="packlistTable"
                v-else-if="!isDetailsView && resolvedTabName"
                :tab-name="resolvedTabName"
                :container-path="containerPath"
                @navigate-to-path="navigateToPath"
            />
            
            <!-- Packlist Details View (Summary Table Only) - only after verification -->
            <PacklistItemsSummary 
                v-else-if="isDetailsView && resolvedTabName"
                :project-identifier="resolvedTabName"
                :container-path="containerPath"
                @navigate-to-path="navigateToPath"
            />
        </slot>
    `
};