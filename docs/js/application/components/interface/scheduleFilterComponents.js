import { html, getReactiveStore, Requests, authState, NavigationRegistry, buildTextFilterParameters, parseTextFilterParameters, LoadingBarComponent, createAnalysisConfig, parseDateFilterParameters, buildDateFilterParameters, toISODateString, parseDate, toUSDateString, offsetToISO, Priority } from '../../index.js';

// Shared utility: Match URL search data to a saved search
function matchUrlToSavedSearch(savedSearches, urlSearchData) {
    if (!savedSearches || savedSearches.length === 0) return -1;
    
    return savedSearches.findIndex(search => {
        // Compare date filters arrays
        const searchDateFilters = search.dateFilters || [];
        const urlDateFilters = urlSearchData.dateFilters || [];
        if (searchDateFilters.length !== urlDateFilters.length) return false;
        
        // Check if all date filters match
        const dateFiltersMatch = searchDateFilters.every(sf => 
            urlDateFilters.some(uf => 
                uf.column === sf.column && 
                uf.value === sf.value &&
                (uf.type || 'after') === (sf.type || 'after')
            )
        ) && urlDateFilters.every(uf => 
            searchDateFilters.some(sf => 
                sf.column === uf.column && 
                sf.value === uf.value &&
                (sf.type || 'after') === (uf.type || 'after')
            )
        );
        
        if (!dateFiltersMatch) return false;
        
        // Compare text filters arrays
        const searchFilters = search.textFilters || [];
        const urlFilters = urlSearchData.textFilters || [];
        if (searchFilters.length !== urlFilters.length) return false;
        
        return searchFilters.every(sf => 
            urlFilters.some(uf => {
                const sfValues = normalizeValues(sf);
                const ufValues = normalizeValues(uf);
                return uf.column === sf.column && 
                    JSON.stringify(sfValues.sort()) === JSON.stringify(ufValues.sort()) &&
                    (uf.type || 'contains') === (sf.type || 'contains');
            })
        ) && urlFilters.every(uf => 
            searchFilters.some(sf => {
                const sfValues = normalizeValues(sf);
                const ufValues = normalizeValues(uf);
                return sf.column === uf.column && 
                    JSON.stringify(sfValues.sort()) === JSON.stringify(ufValues.sort()) &&
                    (sf.type || 'contains') === (uf.type || 'contains');
            })
        );
    });
}

// Shared utility: Normalize filter values for backward compatibility
function normalizeValues(filter) {
    return filter.values || (filter.value ? [filter.value] : []);
}

// Shared utility: Validate and clean text filters
function getValidTextFilters(textFilters) {
    return textFilters
        .filter(f => f.column && f.values && f.values.some(v => v.trim()))
        .map(f => ({ 
            column: f.column, 
            values: f.values.filter(v => v.trim()),
            type: f.type || 'contains' 
        }));
}

// Shared utility: Clean filter objects by removing AppData and other metadata
function cleanFilters(filters) {
    if (!filters || !Array.isArray(filters)) return filters;
    
    return filters.map(filter => {
        const { AppData, ...cleanFilter } = filter;
        return cleanFilter;
    });
}

// Shared utility: Resolve a window start/end from a dateFilters array.
// Looks for column 'Show Date' after/before entries and extracts their values as ISO strings.
// Returns { startDate, endDate } — either may be null if not present or not resolvable.
function resolveWindowDates(dateFilters) {
    if (!dateFilters?.length) return { startDate: null, endDate: null };
    const afterFilter  = dateFilters.find(f => f.type === 'after'  && f.column === 'Show Date');
    const beforeFilter = dateFilters.find(f => f.type === 'before' && f.column === 'Show Date');
    // Values can be ISO strings or numeric offsets; only include real date strings
    const toDateStr = (v) => (v != null && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;
    return {
        startDate: toDateStr(afterFilter?.value)  ?? null,
        endDate:   toDateStr(beforeFilter?.value) ?? null
    };
}

// Shared utility: Initialize saved searches store
function initializeSavedSearchesStore() {
    if (!authState.isAuthenticated || !authState.user?.email) {
        return null;
    }
    return getReactiveStore(
        Requests.getUserData,
        Requests.storeUserData,
        [authState.user.email, 'saved_searches'],
        null,
        true
    );
}

// Advanced Search Component for Schedule - Filter Creation UI Only
export const ScheduleAdvancedFilter = {
    components: {
        LoadingBarComponent
    },
    inject: ['$modal', 'appContext'],
    props: {
        containerPath: String,
        navigateToPath: Function,
        onSearchSelected: Function // Callback for when used in modal
    },
    data() {
        return {
            // Date filter: After
            afterColumn: 'Show Date', // Selected column (defaults to Show Date)
            afterMode: 'date', // 'date' or 'offset'
            afterValue: '', // ISO date string or offset number
            
            // Date filter: Before
            beforeColumn: 'Show Date', // Selected column (defaults to Show Date)
            beforeMode: 'date', // 'date' or 'offset'
            beforeValue: '', // ISO date string or offset number
            
            // Dynamic text search filters - start empty
            textFilters: [],
            nextFilterId: 1,
            
            // Reactive store for saved searches
            savedSearchesStore: null,
            
            // Reactive store for production schedule data (for column loading)
            scheduleStore: null,
            
            // Selected saved search for update/delete
            selectedSavedSearchIndex: null // null = "New Search"
        };
    },
    computed: {
        // Get saved searches from store
        savedSearches() {
            return this.savedSearchesStore?.data || [];
        },
        // Get currently selected saved search
        selectedSavedSearch() {
            if (this.selectedSavedSearchIndex === null || !this.savedSearches.length) {
                return null;
            }
            return this.savedSearches[this.selectedSavedSearchIndex];
        },
        // Get schedule data from store
        scheduleData() {
            return this.scheduleStore?.data || [];
        },
        // Computed columns from store data
        availableColumns() {
            if (!this.scheduleData || this.scheduleData.length === 0) {
                return [];
            }
            
            // Extract column headers from first row
            const firstRow = this.scheduleData[0];
            return Object.keys(firstRow)
                .filter(key => key !== 'AppData')
                .sort();
        },
        // Date-formatted columns only
        dateColumns() {
            if (!this.scheduleData || this.scheduleData.length === 0) {
                return ['Show Date']; // Default
            }
            
            // Find columns that are date-related based on column name keywords
            // Uses same logic as ScheduleTable.js isDateColumn method
            const dateKeywords = ['date', 'start', 'end', 'ship', 'due', 'deadline', 'created', 'updated', 'modified', 's.', 'time'];
            const firstRow = this.scheduleData[0];
            
            const dateColumns = Object.keys(firstRow)
                .filter(key => {
                    if (key === 'AppData') return false;
                    // Check if column name contains date-related keywords (case-insensitive)
                    const keyLower = key.toLowerCase();
                    return dateKeywords.some(keyword => keyLower.includes(keyword));
                })
                .sort();
            
            // Always ensure 'Show Date' is included
            if (!dateColumns.includes('Show Date')) {
                dateColumns.unshift('Show Date');
            }
            
            return dateColumns;
        },
        // Loading states from store
        isLoadingColumns() {
            return this.scheduleStore?.isLoading || this.scheduleStore?.isAnalyzing || false;
        },
        // Calculated date for After filter
        afterCalculatedDate() {
            if (this.afterMode === 'date') {
                return 'No Offset';
            } else if (this.afterMode === 'offset' && this.afterValue !== '' && !isNaN(Number(this.afterValue))) {
                const offset = Number(this.afterValue);
                const date = new Date();
                date.setDate(date.getDate() + offset);
                return toUSDateString(date) || toISODateString(date);
            }
            return null;
        },
        // Calculated date for Before filter
        beforeCalculatedDate() {
            if (this.beforeMode === 'date') {
                return 'No Offset';
            } else if (this.beforeMode === 'offset' && this.beforeValue !== '' && !isNaN(Number(this.beforeValue))) {
                const offset = Number(this.beforeValue);
                const date = new Date();
                date.setDate(date.getDate() + offset);
                return toUSDateString(date) || toISODateString(date);
            }
            return null;
        },
        // Check if date range is valid
        hasValidDateRange() {
            // Valid if both dates are set OR both are empty
            const hasAfter = !!(this.afterValue !== '' && this.afterColumn);
            const hasBefore = !!(this.beforeValue !== '' && this.beforeColumn);
            return (hasAfter && hasBefore) || (!hasAfter && !hasBefore);
        },
        // Check if all filters are valid
        isFormValid() {
            return this.hasValidDateRange;
        },
        authIsAuthenticated() {
            return authState.isAuthenticated;
        }
    },
    async mounted() {
        // Initialize schedule store for column loading
        await this.initializeScheduleStore();
        
        // Initialize saved searches store
        this.savedSearchesStore = initializeSavedSearchesStore();
        
        // Sync filters with URL parameters
        this.syncWithURL();
    },
    watch: {
        // Reinitialize stores when auth is restored after logout or reauth
        authIsAuthenticated(isAuth, wasAuth) {
            if (isAuth && !wasAuth) {
                this.savedSearchesStore = initializeSavedSearchesStore();
                this.initializeScheduleStore();
            }
        },
        // Watch for URL parameter changes
        'appContext.currentPath': {
            handler(newPath, oldPath) {
                // Skip initial load (handled by mounted)
                if (!oldPath) return;
                
                // Get params for both paths
                const newParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath || 'schedule/advanced-search',
                    newPath
                );
                const oldParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath || 'schedule/advanced-search',
                    oldPath
                );
                
                // Skip if params haven't actually changed
                if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;
                
                console.log('[AdvancedSearch] URL parameters changed, syncing filters');
                this.syncWithURL();
            }
        }
    },
    methods: {
        async initializeScheduleStore() {
            // Initialize reactive store for production schedule (for column loading only)
            this.scheduleStore = getReactiveStore(
                Requests.getProductionScheduleData,
                null, // No save function
                [], // No arguments - load all shows
                null // No analysis needed
            );
            
            // Load the data
            await this.scheduleStore.load('Loading schedule columns...');
        },
        syncWithURL() {
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath || 'schedule/advanced-search',
                this.appContext?.currentPath
            );
            
            // No URL parameters - clear filters
            if (Object.keys(params).length === 0) {
                this.clearAllFilters();
                return;
            }
            
            const filter = {
                dateFilters: params.dateFilters || [],
                textFilters: params.textFilters || [],
                view: params.view || null
            };
            
            // Try to match URL to a saved search
            const matchedSearchIndex = matchUrlToSavedSearch(this.savedSearchesStore?.data || [], filter);
            if (matchedSearchIndex >= 0) {
                this.selectedSavedSearchIndex = matchedSearchIndex;
            }
            
            // Load URL parameters into filter fields
            // Parse dateFilters array
            if (filter.dateFilters && filter.dateFilters.length > 0) {
                // Look for "after" and "before" filters
                const afterFilter = filter.dateFilters.find(f => f.type === 'after');
                const beforeFilter = filter.dateFilters.find(f => f.type === 'before');
                
                // Handle "after" filter
                if (afterFilter) {
                    this.afterColumn = afterFilter.column || 'Show Date';
                    const value = afterFilter.value;
                    if (typeof value === 'number') {
                        // It's an offset
                        this.afterMode = 'offset';
                        this.afterValue = value;
                    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        // It's an explicit date
                        this.afterMode = 'date';
                        this.afterValue = value;
                    }
                }
                
                // Handle "before" filter
                if (beforeFilter) {
                    this.beforeColumn = beforeFilter.column || 'Show Date';
                    const value = beforeFilter.value;
                    if (typeof value === 'number') {
                        // It's an offset
                        this.beforeMode = 'offset';
                        this.beforeValue = value;
                    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        // It's an explicit date
                        this.beforeMode = 'date';
                        this.beforeValue = value;
                    }
                }
            }
            
            // Load text filters
            if (filter.textFilters && filter.textFilters.length > 0) {
                // Add IDs for Vue reactivity
                this.textFilters = filter.textFilters.map((filter, index) => ({
                    id: index + 1,
                    column: filter.column,
                    values: normalizeValues(filter),
                    type: filter.type || 'contains'
                }));
                this.nextFilterId = filter.textFilters.length + 1;
            } else {
                // Start with no text filters
                this.textFilters = [];
                this.nextFilterId = 1;
            }
        },
        updateURL(params) {
            const targetPath = this.containerPath || 'schedule/advanced-search';
            const cleanPath = targetPath.split('?')[0];
            const isOnDashboard = this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';

            const newPath = NavigationRegistry.buildPathWithCurrentParams(
                cleanPath,
                this.appContext?.currentPath,
                params
            );

            if (isOnDashboard) {
                NavigationRegistry.dashboardRegistry.updatePath(
                    cleanPath,
                    newPath
                );
            } else if (this.navigateToPath) {
                this.navigateToPath(newPath);
            }
        },
        saveFiltersToURL() {
            // Build dateFilters array from UI state
            const dateFilters = [];
            
            // Add "after" filter
            if (this.afterValue !== '' && this.afterColumn) {
                let value = this.afterValue;
                // Convert to number if in offset mode
                if (this.afterMode === 'offset') {
                    value = Number(value);
                }
                dateFilters.push({
                    column: this.afterColumn,
                    value: value,
                    type: 'after'
                });
            }
            
            // Add "before" filter
            if (this.beforeValue !== '' && this.beforeColumn) {
                let value = this.beforeValue;
                // Convert to number if in offset mode
                if (this.beforeMode === 'offset') {
                    value = Number(value);
                }
                dateFilters.push({
                    column: this.beforeColumn,
                    value: value,
                    type: 'before'
                });
            }
            
            // Build parameters object directly
            const params = {};
            
            if (dateFilters.length > 0) {
                params.dateFilters = dateFilters;
            }
            
            // Add text filters (strip id property)
            const validTextFilters = getValidTextFilters(this.textFilters);
            
            if (validTextFilters.length > 0) {
                params.textFilters = validTextFilters;
            } else {
                // Explicitly clear text filters from URL if none are valid
                params.textFilters = undefined;
            }

            // Use the same URL update path for all filter modes.
            this.updateURL(params);
            
            // Emit search-selected event with filter data for table display
            this.emitSearchSelected();
        },
        clearAllFilters() {
            // Clear date filters
            this.afterColumn = 'Show Date';
            this.afterMode = 'date';
            this.afterValue = '';
            this.beforeColumn = 'Show Date';
            this.beforeMode = 'date';
            this.beforeValue = '';
            
            // Clear text filters
            this.textFilters = [];
            this.nextFilterId = 1;
        },
        addTextFilter() {
            this.textFilters.push({
                id: this.nextFilterId++,
                column: '',
                values: [''],
                type: 'contains'
            });
        },
        handleValueInput(filter, valueIndex, event) {
            const value = event.target.value;
            
            // Check if comma was typed
            if (value.includes(',')) {
                // Split by comma and trim
                const parts = value.split(',').map(v => v.trim()).filter(v => v);
                
                // Replace current value with parts and add an empty field for next input
                filter.values.splice(valueIndex, 1, ...parts, '');
                
                // Focus the new empty field after DOM updates
                this.$nextTick(() => {
                    // Find all inputs for this filter and focus the last one (newly created)
                    const filterElement = event.target.closest('.card');
                    if (filterElement) {
                        const inputs = filterElement.querySelectorAll('input[type="text"]');
                        if (inputs.length > 0) {
                            inputs[inputs.length - 1].focus();
                        }
                    }
                });
            } else {
                // Just update the current value, don't add new fields
                filter.values[valueIndex] = value;
            }
        },
        removeValue(filter, valueIndex) {
            if (filter.values.length > 1) {
                filter.values.splice(valueIndex, 1);
            } else {
                filter.values[0] = '';
            }
        },
        removeTextFilter(filterId) {
            // Remove the filter (no minimum required)
            this.textFilters = this.textFilters.filter(f => f.id !== filterId);
        },
        toggleAfterMode() {
            const oldMode = this.afterMode;
            const oldValue = this.afterValue;
            
            // Toggle mode
            this.afterMode = oldMode === 'date' ? 'offset' : 'date';
            
            // Convert value to new mode
            if (oldValue !== '' && oldValue != null) {
                if (oldMode === 'offset' && !isNaN(Number(oldValue))) {
                    // Converting from offset to date
                    const offset = Number(oldValue);
                    const date = new Date();
                    date.setDate(date.getDate() + offset);
                    this.afterValue = toISODateString(date);
                } else if (oldMode === 'date' && typeof oldValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(oldValue)) {
                    // Converting from date to offset
                    const targetDate = parseDate(oldValue);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    targetDate.setHours(0, 0, 0, 0);
                    const diffMs = targetDate.getTime() - today.getTime();
                    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                    this.afterValue = diffDays;
                } else {
                    // Invalid value, clear it
                    this.afterValue = '';
                }
            } else {
                // No value to convert
                this.afterValue = '';
            }
        },
        toggleBeforeMode() {
            const oldMode = this.beforeMode;
            const oldValue = this.beforeValue;
            
            // Toggle mode
            this.beforeMode = oldMode === 'date' ? 'offset' : 'date';
            
            // Convert value to new mode
            if (oldValue !== '' && oldValue != null) {
                if (oldMode === 'offset' && !isNaN(Number(oldValue))) {
                    // Converting from offset to date
                    const offset = Number(oldValue);
                    const date = new Date();
                    date.setDate(date.getDate() + offset);
                    this.beforeValue = toISODateString(date);
                } else if (oldMode === 'date' && typeof oldValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(oldValue)) {
                    // Converting from date to offset
                    const targetDate = parseDate(oldValue);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    targetDate.setHours(0, 0, 0, 0);
                    const diffMs = targetDate.getTime() - today.getTime();
                    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                    this.beforeValue = diffDays;
                } else {
                    // Invalid value, clear it
                    this.beforeValue = '';
                }
            } else {
                // No value to convert
                this.beforeValue = '';
            }
        },

        handleScheduleFilterSelection() {
            // When a saved search is selected, load it
            if (this.selectedSavedSearchIndex === null) {
                // "New Search" selected - don't load anything
                return;
            }
            
            const search = this.selectedSavedSearch;
            if (!search) return;
            
            // Parse and load the saved search dateFilters
            if (search.dateFilters && search.dateFilters.length > 0) {
                // Look for "after" and "before" filters
                const afterFilter = search.dateFilters.find(f => f.type === 'after');
                const beforeFilter = search.dateFilters.find(f => f.type === 'before');
                
                // Handle "after" filter
                if (afterFilter) {
                    this.afterColumn = afterFilter.column || 'Show Date';
                    const value = afterFilter.value;
                    if (typeof value === 'number') {
                        // It's an offset
                        this.afterMode = 'offset';
                        this.afterValue = value;
                    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        // It's an explicit date
                        this.afterMode = 'date';
                        this.afterValue = value;
                    }
                }
                
                // Handle "before" filter
                if (beforeFilter) {
                    this.beforeColumn = beforeFilter.column || 'Show Date';
                    const value = beforeFilter.value;
                    if (typeof value === 'number') {
                        // It's an offset
                        this.beforeMode = 'offset';
                        this.beforeValue = value;
                    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        // It's an explicit date
                        this.beforeMode = 'date';
                        this.beforeValue = value;
                    }
                }
            }
            
            // Load text filters
            if (search.textFilters && search.textFilters.length > 0) {
                this.textFilters = search.textFilters.map((filter, index) => ({
                    id: index + 1,
                    column: filter.column,
                    values: normalizeValues(filter),
                    type: filter.type || 'contains'
                }));
                this.nextFilterId = search.textFilters.length + 1;
            } else {
                this.textFilters = [];
                this.nextFilterId = 1;
            }
            
            // Note: Don't call saveFiltersToURL here - let user click Apply Filters to update URL
        },
        async updateSavedSearch() {
            if (this.selectedSavedSearchIndex === null || !this.selectedSavedSearch) {
                return;
            }
            
            if (!authState.isAuthenticated || !authState.user?.email) {
                this.$modal.error('You must be logged in to update searches.', 'Error');
                return;
            }
            
            try {
                // Build dateFilters array from UI state
                const dateFilters = [];
                
                // Add "after" filter
                if (this.afterValue !== '' && this.afterColumn) {
                    let value = this.afterValue;
                    if (this.afterMode === 'offset') {
                        value = Number(value);
                    }
                    dateFilters.push({
                        column: this.afterColumn,
                        value: value,
                        type: 'after'
                    });
                }
                
                // Add "before" filter
                if (this.beforeValue !== '' && this.beforeColumn) {
                    let value = this.beforeValue;
                    if (this.beforeMode === 'offset') {
                        value = Number(value);
                    }
                    dateFilters.push({
                        column: this.beforeColumn,
                        value: value,
                        type: 'before'
                    });
                }
                
                const searchData = {
                    name: this.selectedSavedSearch.name,
                    dateFilters: dateFilters,
                    textFilters: []
                };
                
                // Add text filters
                if (this.textFilters && this.textFilters.length > 0) {
                    searchData.textFilters = getValidTextFilters(this.textFilters);
                }
                
                // Update in store
                if (this.savedSearchesStore && this.savedSearchesStore.data) {
                    this.savedSearchesStore.data[this.selectedSavedSearchIndex] = searchData;
                    await this.savedSearchesStore.save();
                    
                    this.$modal.alert('Filter updated successfully!', 'Success');
                } else {
                    throw new Error('Saved filters store not initialized');
                }
            } catch (error) {
                console.error('Failed to update filter:', error);
                this.$modal.error('Failed to update the saved filter. Please try again or contact support if the problem persists.', 'Update Filter Error');
            }
        },
        deleteSavedSearch() {
            if (this.selectedSavedSearchIndex === null || !this.selectedSavedSearch) {
                return;
            }
            
            if (!authState.isAuthenticated || !authState.user?.email) {
                this.$modal.error('You must be logged in to delete filters.', 'Error');
                return;
            }
            
            const searchName = this.selectedSavedSearch.name;
            
            // Confirm deletion - correct API: confirm(message, onConfirm, onCancel, title)
            this.$modal.confirm(
                `Are you sure you want to delete "${searchName}"?`,
                async () => {
                    // onConfirm callback
                    try {
                        // Remove from store
                        if (this.savedSearchesStore && this.savedSearchesStore.data) {
                            this.savedSearchesStore.data.splice(this.selectedSavedSearchIndex, 1);
                            await this.savedSearchesStore.save();
                            
                            // Reset to "New Search"
                            this.selectedSavedSearchIndex = null;
                            
                            this.$modal.alert('Filter deleted successfully!', 'Success');
                        } else {
                            throw new Error('Saved filters store not initialized');
                        }
                    } catch (error) {
                        console.error('Failed to delete search:', error);
                        this.$modal.error('Failed to delete the saved filter. Please try again or contact support if the problem persists.', 'Delete Filter Error');
                    }
                },
                null, // onCancel callback (optional)
                'Confirm Deletion' // title
            );
        },
        async saveSearch() {
            // Create a modal component for saving the search
            const SaveSearchComponent = {
                props: {
                    afterColumn: String,
                    afterMode: String,
                    afterValue: [String, Number],
                    beforeColumn: String,
                    beforeMode: String,
                    beforeValue: [String, Number],
                    textFilters: Array,
                    savedSearchesStore: Object,
                    ScheduleAdvancedFilter: Object
                },
                data() {
                    return {
                        searchName: '',
                        isSaving: false
                    };
                },
                inject: ['$modal'],
                methods: {
                    async handleSave() {
                        if (!this.searchName.trim()) {
                            this.$modal.alert('Please enter a name.', 'Warning');
                            return;
                        }
                        
                        if (!authState.isAuthenticated || !authState.user?.email) {
                            this.$modal.error('You must be logged in to save filters.', 'Error');
                            return;
                        }
                        
                        try {
                            this.isSaving = true;
                            
                            // Build dateFilters array
                            const dateFilters = [];
                            
                            // Add "after" filter
                            if (this.afterValue !== '' && this.afterColumn) {
                                let value = this.afterValue;
                                if (this.afterMode === 'offset') {
                                    value = Number(value);
                                }
                                dateFilters.push({
                                    column: this.afterColumn,
                                    value: value,
                                    type: 'after'
                                });
                            }
                            
                            // Add "before" filter
                            if (this.beforeValue !== '' && this.beforeColumn) {
                                let value = this.beforeValue;
                                if (this.beforeMode === 'offset') {
                                    value = Number(value);
                                }
                                dateFilters.push({
                                    column: this.beforeColumn,
                                    value: value,
                                    type: 'before'
                                });
                            }
                            
                            const searchData = {
                                name: this.searchName.trim(),
                                dateFilters: dateFilters,
                                textFilters: []
                            };
                            
                            // Add text filters (strip IDs)
                            if (this.textFilters && this.textFilters.length > 0) {
                                searchData.textFilters = getValidTextFilters(this.textFilters);
                            }
                            
                            // Save using reactive store (passed as prop)
                            if (this.savedSearchesStore && this.savedSearchesStore.data) {
                                this.savedSearchesStore.data.push(searchData);
                                await this.savedSearchesStore.save();
                                
                                // Select the newly saved search in the parent component
                                if (this.ScheduleAdvancedFilter) {
                                    this.ScheduleAdvancedFilter.selectedSavedSearchIndex = this.savedSearchesStore.data.length - 1;
                                }
                                
                                this.$emit('close-modal');
                            } else {
                                throw new Error('Saved filters store not initialized');
                            }
                        } catch (error) {
                            console.error('Failed to save filter:', error);
                            this.$modal.error('Failed to save the filter. Please try again or contact support if the problem persists.', 'Save Filter Error');
                        } finally {
                            this.isSaving = false;
                        }
                    },
                    handleCancel() {
                        this.$emit('close-modal');
                    }
                },
                template: html`
                    <div>
                        <label style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
                            <span style="font-weight: 500;">Search Name:</span>
                            <input 
                                type="text" 
                                v-model="searchName"
                                placeholder="Enter text"
                                style="padding: 0.5rem; font-size: 1rem;"
                                :disabled="isSaving"
                                @keyup.enter="handleSave"
                            />
                        </label>
                        <div class="button-bar">
                            <button @click="handleSave" class="green" :disabled="isSaving">{{ isSaving ? 'Saving...' : 'Save' }}</button>
                            <button @click="handleCancel" class="white">Cancel</button>
                        </div>
                    </div>
                `
            };
            
            // Open the modal
            this.$modal.custom(SaveSearchComponent, {
                // Pass current filter state as props
                afterColumn: this.afterColumn,
                afterMode: this.afterMode,
                afterValue: this.afterValue,
                beforeColumn: this.beforeColumn,
                beforeMode: this.beforeMode,
                beforeValue: this.beforeValue,
                textFilters: this.textFilters,
                savedSearchesStore: this.savedSearchesStore,
                ScheduleAdvancedFilter: this
            }, 'Save Filter');
        },
        async emitSearchSelected() {
            // Build dateFilters array from UI state
            const dateFilters = [];
            let startDate = null;
            let endDate = null;
            
            // Add "after" filter
            if (this.afterValue !== '' && this.afterColumn) {
                let value = this.afterValue;
                if (this.afterMode === 'offset') {
                    value = Number(value);
                }
                dateFilters.push({
                    column: this.afterColumn,
                    value: value,
                    type: 'after'
                });
            }
            
            // Add "before" filter
            if (this.beforeValue !== '' && this.beforeColumn) {
                let value = this.beforeValue;
                if (this.beforeMode === 'offset') {
                    value = Number(value);
                }
                dateFilters.push({
                    column: this.beforeColumn,
                    value: value,
                    type: 'before'
                });
            }
            
            // Build search data in the same format as ScheduleFilterSelect
            const windowDates = resolveWindowDates(dateFilters);
            const searchData = {
                dateFilters: dateFilters,
                textFilters: getValidTextFilters(this.textFilters),
                startDate: startDate ?? windowDates.startDate,
                endDate:   endDate   ?? windowDates.endDate
            };
            
            // Call callback if in modal mode, otherwise emit to parent
            if (this.onSearchSelected) {
                this.onSearchSelected(searchData);
                // Close the modal after applying filters
                this.$emit('close-modal');
            } else {
                this.$emit('search-selected', searchData);
            }
        }
    },
    template: html`
        <!-- Loading state while columns are loading -->
        <div v-if="isLoadingColumns" class="loading-message">
            <img src="assets/loading.gif" alt="..."/>
            <p>Loading schedule data...</p>
        </div>
        
        <template v-else>
        <!-- Date Filter: After -->
        <div 
            :class="'card' + (afterValue !== '' ? ' green' : ' white')"
            style="display: flex; flex-direction: column; gap: var(--padding-md);"
        >
            <div style="display: flex; flex-wrap: wrap; gap: var(--padding-md); align-items: center;">
                <span style="width: 80px;">Start Date:</span>
                <select 
                    v-model="afterColumn"
                    :disabled="isLoadingColumns"
                >
                    <!-- <option value="">Select column...</option> -->
                    <option 
                        v-for="col in dateColumns" 
                        :key="col" 
                        :value="col"
                    >
                        {{ col }}
                    </option>
                </select>
                <span>is after {{afterMode === 'offset' ? 'days from today:' : 'a specific date:'}}</span>
                <div class="button-bar" style="flex-grow: 1;">
                    <!-- <div v-if="afterMode === 'offset'" class="card gray" style="white-space: nowrap;">days from today:</div> -->
                    <input 
                        v-if="afterMode === 'offset'"
                        type="number" 
                        v-model.number="afterValue" 
                        placeholder="Days offset (e.g., -30, 0, 365)"
                        style="flex-grow: 1;"
                    />
                    <button 
                        @click="toggleAfterMode"
                        class="white"
                        style="flex-grow: 1; text-align: center; white-space: nowrap;"
                    >
                        {{ afterCalculatedDate ? afterCalculatedDate : 'enter offset' }}
                    </button>
                    <input 
                        v-if="afterMode === 'date'"
                        type="date" 
                        v-model="afterValue" 
                        placeholder="YYYY-MM-DD"
                        style="flex-grow: 1;"
                    />
                </div>
            </div>
        </div>
        
        <!-- Date Filter: Before -->
        <div 
            :class="'card' + (beforeValue !== '' ? ' green' : ' white')"
            style="display: flex; flex-direction: column; gap: var(--padding-md);"
        >
            <div style="display: flex; flex-wrap: wrap; gap: var(--padding-md); align-items: center;">
                <span style="width: 80px;">End Date:</span>
                <select 
                    v-model="beforeColumn"
                    :disabled="isLoadingColumns"
                >
                    <!-- <option value="">Select column...</option> -->
                    <option 
                        v-for="col in dateColumns" 
                        :key="col" 
                        :value="col"
                    >
                        {{ col }}
                    </option>
                </select>
                <span>is before {{beforeMode === 'offset' ? 'days from today:' : 'a specific date:'}}</span>
                <div class="button-bar" style="flex-grow: 1;">
                    <!-- <div v-if="beforeMode === 'offset'" class="card gray" style="white-space: nowrap;">days from today:</div> -->
                    <input 
                        v-if="beforeMode === 'offset'"
                        type="number" 
                        v-model.number="beforeValue" 
                        placeholder="Days offset (e.g., -30, 0, 365)"
                        style="flex-grow: 1;"
                    />
                    <button
                        @click="toggleBeforeMode"
                        class="white"
                        style="flex-grow: 1; text-align: center; white-space: nowrap;"
                    >
                        {{ beforeCalculatedDate ? beforeCalculatedDate : 'enter offset' }}
                    </button>
                    <input 
                        v-if="beforeMode === 'date'"
                        type="date" 
                        v-model="beforeValue" 
                        placeholder="YYYY-MM-DD"
                        style="flex-grow: 1;"
                    />
                </div>
            </div>
        </div>

        <!-- Text Search Filters -->
        <div v-if="isLoadingColumns" class="card white">
            Loading columns...
        </div>
        
        <slot v-else>
            <div 
                v-for="filter in textFilters" 
                :key="filter.id"
                :class="'card' + (filter.values.some(v => v.trim()) ? ' green' : ' white')"
                style="display: flex; flex-direction: column; gap: var(--padding-md);"
            >
                <div style="display: flex; flex-wrap: wrap; gap: var(--padding-md); align-items: center;">
                    <span style="width: 80px;">Text Filter:</span>
                    <select 
                        v-model="filter.column"
                    >
                        <option value="">Select column...</option>
                        <option 
                            v-for="col in availableColumns" 
                            :key="col" 
                            :value="col"
                        >
                            {{ col }}
                        </option>
                    </select>
                
                    <select 
                        v-model="filter.type"
                        :disabled="!filter.column"
                        :class="{ 'hide-when-narrow': !filter.column }"
                        style="min-width: 120px; width: unset;"
                    >
                        <option value="contains">Contains</option>
                        <option value="excludes">Excludes</option>
                    </select>
                    <!-- Multiple value inputs -->
                    <div 
                        v-for="(value, valueIndex) in filter.values" 
                        :key="valueIndex"
                        class="input-container"
                        style="min-width: 120px;"
                    >
                        <input 
                            type="text" 
                            :value="value"
                            @input="handleValueInput(filter, valueIndex, $event)"
                            :placeholder="filter.column ? (valueIndex === 0 ? 'Search text...' : 'Additional value...') : 'Select column first'"
                            :disabled="!filter.column"
                        />
                        <button 
                            v-if="filter.values.length > 1 && value.trim()"
                            @click="removeValue(filter, valueIndex)"
                            class="column-button"
                            title="Remove this value"
                        >
                            ✕
                        </button>
                    </div>
                    <div class="spacer"></div>
                    <button 
                        @click="removeTextFilter(filter.id)"
                        class="button-symbol red"
                        title="Remove this filter"
                    >
                        🗙
                    </button>
                </div>
            </div>
            
            <button 
                v-if="textFilters.length === 0 || textFilters.every(filter => filter.column && filter.values.some(v => v.trim()))"
                @click="addTextFilter" 
                class="card white"
                style="width: 100%; flex-grow: 0;"
                :disabled="isLoadingColumns"
            >
                {{ textFilters.length === 0 ? 'Add a Text Filter' : 'Add Another Text Filter' }}
            </button>
        </slot>

        <!-- Action Buttons -->
        <div class="button-bar">
            <!-- Saved Search Dropdown -->
            <select 
                v-model="selectedSavedSearchIndex"
                @change="handleScheduleFilterSelection"
                style="flex: auto;"
            >
                <option :value="null">{{ selectedSavedSearchIndex === null ? 'Unsaved Filter' : 'New Filter' }}</option>
                <option 
                    v-for="(search, index) in savedSearches" 
                    :key="index" 
                    :value="index"
                >
                    {{ search.name }}
                </option>
            </select>
            
            <!-- Conditional buttons based on whether a saved search is selected -->
            <button 
                v-if="selectedSavedSearchIndex === null"
                @click="saveSearch"
                :disabled="!isFormValid"
            >
                Save This Filter
            </button>
            <button 
                v-else
                @click="updateSavedSearch"
                :disabled="!isFormValid"
            >
                Update Saved Filter
            </button>
            <button 
                :disabled="selectedSavedSearchIndex == null"
                @click="deleteSavedSearch"
            >
                Delete Saved Filter
            </button>
            
        </div>
        <div class="button-bar">
            <button @click="saveFiltersToURL" class="green" :disabled="!isFormValid">Apply Filters</button>
            <button @click="clearAllFilters" class="white">Clear Filters</button>
        </div>
        </template>
    `
};

// Resolves ISO strings and numeric day-offsets from dateFilters to displayable dates synchronously.
function computeDisplayDates(dateFilters) {
    if (!dateFilters?.length) return { startDate: null, endDate: null };
    const afterFilter  = dateFilters.find(f => f.type === 'after'  && f.column === 'Show Date');
    const beforeFilter = dateFilters.find(f => f.type === 'before' && f.column === 'Show Date');
    return {
        startDate: offsetToISO(afterFilter?.value) ?? null,
        endDate:   offsetToISO(beforeFilter?.value) ?? null
    };
}

// Async-resolves overlap-mode saved searches (Return/Ship column with identifier value).
async function resolveOverlapDisplayDates(dateFilters) {
    const returnFilter = dateFilters?.find(f => f.column === 'Return' && f.type === 'after');
    if (!returnFilter) return { startDate: null, endDate: null };
    const val = returnFilter.value;
    if (!val || typeof val !== 'string' || /^\d{4}-\d{2}-\d{2}$/.test(val) || !isNaN(Number(val))) {
        return { startDate: null, endDate: null };
    }
    try {
        const [startDate, endDate] = await Promise.all([
            Requests.getProjectShipDate(val),
            Requests.getProjectReturnDate(val)
        ]);
        return { startDate: startDate || null, endDate: endDate || null };
    } catch (_) {
        return { startDate: null, endDate: null };
    }
}

/**
 * Displays the active date range derived directly from URL path params for a given containerPath.
 * Only renders when a date range can be resolved.
 */
export const ScheduleDateRangeCard = {
    inject: ['appContext', '$modal'],
    props: {
        containerPath: {
            type: String,
            required: true
        }
    },
    data() {
        return {
            displayStart: null,
            displayEnd: null
        };
    },
    computed: {
        dateRangeDisplay() {
            if (!this.displayStart && !this.displayEnd) return null;
            const fmt = (iso) => toUSDateString(parseDate(iso)) ?? '?';
            return `${fmt(this.displayStart)} → ${fmt(this.displayEnd)}`;
        }
    },
    watch: {
        'appContext.currentPath': {
            handler(newPath, oldPath) {
                const newParams = NavigationRegistry.getParametersForContainer(this.containerPath, newPath);
                const oldParams = NavigationRegistry.getParametersForContainer(this.containerPath, oldPath || '');
                if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;
                this.resolveFromParams();
            }
        }
    },
    mounted() {
        this.resolveFromParams();
    },
    methods: {
        resolveFromParams() {
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath,
                this.appContext?.currentPath
            );
            const dateFilters = params.dateFilters || [];
            const { startDate, endDate } = computeDisplayDates(dateFilters);
            this.displayStart = startDate ?? params.startDate ?? null;
            this.displayEnd   = endDate   ?? params.endDate   ?? null;
            // Async-resolve overlap identifier dates if sync returned nothing
            if (!this.displayStart && !this.displayEnd && dateFilters.length) {
                resolveOverlapDisplayDates(dateFilters).then(({ startDate: s, endDate: e }) => {
                    if (s || e) { this.displayStart = s; this.displayEnd = e; }
                });
            }
        },
        showDateRangeModal() {
            this.$modal.alert(this.dateRangeDisplay, 'Date Range');
        }
    },
    template: html`
        <template v-if="dateRangeDisplay">
            <div class="card gray hide-when-narrow" style="white-space: nowrap; padding: var(--padding-sm) var(--padding-md);">{{ dateRangeDisplay }}</div>
            <div class="card clickable gray show-when-narrow" @click="showDateRangeModal">⋯</div>
        </template>
    `
};

/**
 * Reusable component for saved search selection with optional year options
 * Handles saved searches, URL parameters, and emits search data to parent
 */
export const ScheduleFilterSelect = {
    components: { ScheduleDateRangeCard },
    inject: ['appContext', '$modal'],
    props: {
        containerPath: {
            type: String,
            default: null
        },
        includeYears: {
            type: Boolean,
            default: false
        },
        startYear: {
            type: Number,
            default: 2023
        },
        navigateToPath: {
            type: Function,
            default: null
        },
        defaultSearch: {
            type: String,
            default: null
        },
        allowShowAll: {
            type: Boolean,
            default: false
        },
        showAdvancedButton: {
            type: Boolean,
            default: false
        }
    },
    data() {
        return {
            savedSearchesStore: null,
            selectedValue: '',
            lastNonCustomValue: '',
            isLoadingOptions: false,
            availableOptions: [],
            hasPerformedInitialSync: false
        };
    },
    computed: {
        savedSearches() {
            return this.savedSearchesStore?.data || [];
        },
        
        isLoading() {
            return this.savedSearchesStore?.isLoading || this.isLoadingOptions;
        },
        authIsAuthenticated() {
            return authState.isAuthenticated;
        }
    },
    watch: {
        // Reinitialize saved searches store when auth is restored after logout or reauth
        async authIsAuthenticated(isAuth, wasAuth) {
            if (isAuth && !wasAuth) {
                this.savedSearchesStore = initializeSavedSearchesStore();
                await this.buildOptions();
                if (this.containerPath) {
                    this.syncWithURL();
                }
            }
        },
        savedSearches: {
            async handler() {
                // Rebuild options when saved searches change
                await this.buildOptions();
            },
            deep: true
        },
        // Watch for URL parameter changes
        'appContext.currentPath': {
            handler(newPath, oldPath) {
                // Skip if no containerPath (standalone mode in modal)
                if (!this.containerPath) return;
                // Skip initial load (handled by mounted)
                if (!oldPath) return;
                
                // Get params for both paths
                const newParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath,
                    newPath
                );
                const oldParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath,
                    oldPath
                );
                
                // Skip if params haven't actually changed
                if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;

                // Skip if only non-filter params changed (e.g. layout toggle)
                const filterKeys = ['dateFilters', 'textFilters', 'view'];
                const newFilter = JSON.stringify(filterKeys.map(k => newParams[k]));
                const oldFilter = JSON.stringify(filterKeys.map(k => oldParams[k]));
                if (newFilter === oldFilter) return;
                
                console.log('[ScheduleFilterSelect] URL parameters changed, syncing dropdown');
                this.syncWithURL();
            },
            deep: true
        }
    },
    async mounted() {
        this.savedSearchesStore = initializeSavedSearchesStore();
        
        // If store exists, wait for it to finish loading before building options
        if (this.savedSearchesStore && this.savedSearchesStore.isLoading) {
            await new Promise(resolve => {
                const unwatch = this.$watch('savedSearchesStore.isLoading', (newValue) => {
                    if (!newValue) {
                        unwatch();
                        resolve();
                    }
                });
            });
        }
        
        // Now build options with fully loaded saved searches
        await this.buildOptions();
        
        // Perform initial sync after reactive data is fully initialized (only if containerPath exists)
        this.hasPerformedInitialSync = true;
        if (this.containerPath) {
            this.syncWithURL();
        } else if (this.defaultSearch) {
            // In standalone mode, apply default search if provided
            this.applyDefaultSearch();
        }
    },
    methods: {
        async buildOptions() {
            this.isLoadingOptions = true;
            try {
                const options = [];
                
                // Add "Show All" option if allowed
                if (this.allowShowAll) {
                    options.push({
                        value: 'show-all',
                        label: 'Show All',
                        type: 'show-all'
                    });
                }
                
                // Add years if requested
                if (this.includeYears) {
                    const currentYear = new Date().getFullYear();
                    const yearCount = currentYear + 1 - this.startYear + 1;
                    const years = Array.from({ length: yearCount }, (_, i) => currentYear + 1 - i);
                    years.forEach(year => {
                        options.push({ 
                            value: year.toString(), 
                            label: year.toString(), 
                            type: 'year' 
                        });
                    });
                }
                
                // Add saved searches
                if (this.savedSearches && this.savedSearches.length > 0) {
                    this.savedSearches.forEach((search, index) => {
                        options.push({
                            value: `search-${index}`,
                            label: search.name,
                            type: 'search',
                            searchData: search
                        });
                    });
                }
                
                this.availableOptions = options;
            } catch (error) {
                console.error('[ScheduleFilterSelect] Failed to build options:', error);
            } finally {
                this.isLoadingOptions = false;
            }
        },
        
        handleChange(event) {
            const value = event.target.value;
            if (value === 'custom') {
                const revertTo = this.lastNonCustomValue || '';
                this.selectedValue = revertTo;
                // Force DOM to revert even when selectedValue didn't change reactively
                this.$nextTick(() => { event.target.value = revertTo; });
                if (this.showAdvancedButton) {
                    this.openAdvancedSearchModal();
                }
                return;
            }

            this.selectedValue = value;
            this.lastNonCustomValue = value;
            
            if (!value) {
                this.$emit('search-selected', null);
                // Clear all schedule filter parameters by setting them to undefined
                this.updateURL({ 
                    dateFilters: undefined, 
                    textFilters: undefined, 
                    view: undefined 
                });
                return;
            }
            
            const option = this.availableOptions.find(opt => opt.value === value);
            if (!option || option.disabled) return;
            
            this.applyOption(option);
        },
        
        applyOption(option) {
            this.lastNonCustomValue = option.value;

            if (option.type === 'show-all') {
                this.$emit('search-selected', { type: 'show-all', startDate: null, endDate: null });
                this.updateURL({ 
                    view: 'all',
                    dateFilters: undefined, // Clear date filters for show-all
                    textFilters: undefined  // Clear text filters for show-all
                });
            } else if (option.type === 'year') {
                const year = parseInt(option.value);
                const searchData = {
                    type: 'year',
                    year: year,
                    startDate: `${year}-01-01`,
                    endDate: `${year}-12-31`,
                    dateFilters: [
                        { column: 'Show Date', value: `${year}-01-01`, type: 'after' },
                        { column: 'Show Date', value: `${year}-12-31`, type: 'before' }
                    ]
                };
                this.$emit('search-selected', searchData);
                this.updateURL({
                    view: undefined, // Clear show-all view parameter
                    dateFilters: searchData.dateFilters,
                    textFilters: undefined // Explicitly clear text filters for year selection
                });
            } else if (option.type === 'search') {
                const cleanDateFilters = cleanFilters(option.searchData.dateFilters) || [];
                const { startDate, endDate } = computeDisplayDates(cleanDateFilters);
                const searchData = {
                    type: 'search',
                    name: option.searchData.name,
                    dateFilters: cleanDateFilters,
                    textFilters: cleanFilters(option.searchData.textFilters) || [],
                    startDate,
                    endDate
                };
                this.$emit('search-selected', searchData);
                this.updateURLFromSearch(option.searchData);
            }
        },
        
        updateURL(params) {
            // Skip URL updates if no containerPath (standalone mode in modal)
            if (!this.containerPath) return;
            
            const cleanPath = this.containerPath.split('?')[0];
            const isOnDashboard = this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
            
            // Merge with current parameters to preserve other URL params
            const newPath = NavigationRegistry.buildPathWithCurrentParams(
                cleanPath,
                this.appContext?.currentPath,
                params
            );
            
            if (isOnDashboard) {
                // Update dashboard registry with new path including params
                NavigationRegistry.dashboardRegistry.updatePath(
                    cleanPath,
                    newPath
                );
            } else if (this.navigateToPath) {
                this.navigateToPath(newPath);
            }
        },
        
        updateURLFromSearch(searchData) {
            if (!searchData) return;
            
            const params = {
                view: undefined // Clear show-all view parameter
            };
            // Clean filters to remove AppData before passing to URL
            if (searchData.dateFilters?.length) params.dateFilters = cleanFilters(searchData.dateFilters);
            // Always set textFilters - either with values or undefined to clear from URL
            if (searchData.textFilters?.length) {
                params.textFilters = cleanFilters(searchData.textFilters);
            } else {
                params.textFilters = undefined; // Explicitly clear text filters if search has none
            }
            
            this.updateURL(params);
        },
        
        applyDefaultSearch() {
            if (!this.defaultSearch) return;
            
            // Convert defaultSearch to string for comparison since year values are stored as strings
            const defaultStr = String(this.defaultSearch);
            const option = this.availableOptions.find(
                opt => opt.value === defaultStr || opt.label === defaultStr
            );
            
            if (!option) {
                console.warn('[ScheduleFilterSelect] Default search not found:', this.defaultSearch, 'in', this.availableOptions.map(o => o.value));
                return;
            }
            
            this.selectedValue = option.value;
            this.applyOption(option);
        },
        
        syncWithURL() {
            // Skip URL sync if no containerPath (standalone mode in modal)
            if (!this.containerPath) {
                this.defaultSearch && this.applyDefaultSearch();
                return;
            }
            
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath,
                this.appContext?.currentPath
            );
            
            if (Object.keys(params).length === 0) {
                this.defaultSearch && this.applyDefaultSearch();
                return;
            }
            
            const filter = {
                dateFilters: params.dateFilters || [],
                textFilters: params.textFilters || [],
                view: params.view || null
            };

            // Only non-filter params present (e.g. just layout) — don't change filter state
            if (!filter.dateFilters.length && !filter.textFilters.length && !filter.view) {
                this.defaultSearch && this.applyDefaultSearch();
                return;
            }
            
            // Check for view=all (show-all)
            if (filter.view === 'all' && this.allowShowAll) {
                this.selectedValue = 'show-all';
                this.lastNonCustomValue = 'show-all';
                this.$emit('search-selected', { type: 'show-all' });
                return;
            }
            
            // Try to match year selection (2 date filters on Show Date column with year start/end)
            if (this.includeYears && filter.dateFilters.length === 2 && !filter.textFilters.length) {
                const afterFilter = filter.dateFilters.find(f => f.type === 'after' && f.column === 'Show Date');
                const beforeFilter = filter.dateFilters.find(f => f.type === 'before' && f.column === 'Show Date');
                
                if (afterFilter && beforeFilter) {
                    const afterMatch = String(afterFilter.value).match(/^(\d{4})-01-01$/);
                    const beforeMatch = String(beforeFilter.value).match(/^(\d{4})-12-31$/);
                    
                    if (afterMatch && beforeMatch && afterMatch[1] === beforeMatch[1]) {
                        const year = afterMatch[1];
                        const yearOption = this.availableOptions.find(opt => opt.value === year && opt.type === 'year');
                        
                        if (yearOption) {
                            this.selectedValue = year;
                            this.lastNonCustomValue = year;
                            this.$emit('search-selected', {
                                type: 'year',
                                year: parseInt(year),
                                startDate: `${year}-01-01`,
                                endDate: `${year}-12-31`,
                                dateFilters: filter.dateFilters
                            });
                            return;
                        }
                    }
                }
            }
            
            // Try to match URL to a saved search
            const savedSearches = this.savedSearchesStore?.data || [];
            const matchedSearchIndex = matchUrlToSavedSearch(savedSearches, filter);
            
            if (matchedSearchIndex >= 0) {
                this.selectedValue = `search-${matchedSearchIndex}`;
                this.lastNonCustomValue = `search-${matchedSearchIndex}`;
                const matchedSearch = savedSearches[matchedSearchIndex];
                const cleanDateFilters = cleanFilters(matchedSearch.dateFilters) || [];
                const { startDate, endDate } = computeDisplayDates(cleanDateFilters);
                this.$emit('search-selected', {
                    type: 'search',
                    name: matchedSearch.name,
                    dateFilters: cleanDateFilters,
                    textFilters: cleanFilters(matchedSearch.textFilters) || [],
                    startDate,
                    endDate
                });
                return;
            }
            
            // URL params don't match any saved search - show as custom search
            const { startDate: customStart, endDate: customEnd } = computeDisplayDates(filter.dateFilters);
            this.selectedValue = 'custom';
            this.$emit('search-selected', {
                type: 'url',
                name: 'Custom',
                dateFilters: filter.dateFilters,
                textFilters: filter.textFilters,
                startDate: customStart ?? params.startDate ?? null,
                endDate:   customEnd   ?? params.endDate   ?? null
            });
        },
        
        openAdvancedSearchModal() {
            // Open the advanced search component in a modal
            this.$modal.custom(ScheduleAdvancedFilter, {
                containerPath: this.containerPath,
                modalClass: 'page-menu',
                navigateToPath: this.navigateToPath,
                onSearchSelected: (searchData) => {
                    this.$emit('search-selected', searchData);
                }
            }, 'Advanced Schedule Filtering', { size: 'large'});
        }
    },
    template: html`
        <button 
            v-if="showAdvancedButton" 
            class="button-symbol"
            title="Schedule filtering options"
            @click="openAdvancedSearchModal"
        >
            <span class="material-symbols-outlined">settings</span>
        </button>
        <select 
            :value="selectedValue"
            @change="handleChange"
            :disabled="isLoading"
            :title="isLoading ? 'Loading schedule filters...' : 'Select a schedule filter'"
        >
            <option value="" v-if="isLoading">Loading...</option>
            <option value="" v-else-if="availableOptions.length === 0">No options available</option>
            <option value="" v-else-if="!defaultSearch">Select...</option>
            <option 
                v-for="option in availableOptions" 
                :key="option.value" 
                :value="option.value"
                :disabled="option.disabled"
            >
                {{ option.label }}
            </option>
            <option value="custom" :disabled="!showAdvancedButton">Custom</option>
        </select>
        <ScheduleDateRangeCard v-if="containerPath" :container-path="containerPath" />
    `
};

/**
 * Reusable component for inventory category filtering
 * Handles category selection with URL parameter synchronization
 */
export const InventoryCategoryFilter = {
    inject: ['appContext'],
    props: {
        containerPath: {
            type: String,
            required: true
        },
        navigateToPath: {
            type: Function,
            default: null
        }
    },
    data() {
        return {
            categoriesStore: null,
            selectedCategory: '',
            hasPerformedInitialSync: false
        };
    },
    computed: {
        categories() {
            return this.categoriesStore?.data || [];
        },
        
        isLoading() {
            return this.categoriesStore?.isLoading || false;
        },
        
        // Filter out INDEX category
        visibleCategories() {
            return this.categories.filter(cat => cat.title !== 'INDEX');
        },
        authIsAuthenticated() {
            return authState.isAuthenticated;
        }
    },
    watch: {
        // Reinitialize categories store when auth is restored after logout or reauth
        authIsAuthenticated(isAuth, wasAuth) {
            if (isAuth && !wasAuth && !this.categories.length) {
                this.hasPerformedInitialSync = false;
                this.categoriesStore = getReactiveStore(
                    Requests.getAvailableTabs,
                    null,
                    ['INVENTORY'],
                    null
                );
            }
        },
        // Watch for URL parameter changes
        'appContext.currentPath': {
            handler(newPath, oldPath) {
                // Skip initial load (handled by mounted)
                if (!oldPath) return;
                
                // Get params for both paths
                const newParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath,
                    newPath
                );
                const oldParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath,
                    oldPath
                );
                
                // Skip if params haven't actually changed
                if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;
                
                console.log('[InventoryCategoryFilter] URL parameters changed, syncing dropdown');
                this.syncWithURL();
            },
            deep: true
        },
        
        // Watch for categories data loading completion
        'categoriesStore.isLoading': {
            handler(isLoading, wasLoading) {
                // When loading completes, perform initial sync if needed
                if (wasLoading && !isLoading && this.categories.length > 0 && !this.hasPerformedInitialSync) {
                    this.hasPerformedInitialSync = true;
                    this.syncWithURL();
                }
            }
        }
    },
    async mounted() {
        console.log('[InventoryCategoryFilter] Mounting component', {
            containerPath: this.containerPath,
            currentPath: this.appContext?.currentPath
        });
        
        // Initialize categories store
        this.categoriesStore = getReactiveStore(
            Requests.getAvailableTabs,
            null, // No save function
            ['INVENTORY'], // Arguments
            null // No analysis config
        );
        
        console.log('[InventoryCategoryFilter] Categories store initialized, isLoading:', this.categoriesStore.isLoading);
        
        // Wait for initial load to complete
        if (this.categoriesStore.isLoading) {
            console.log('[InventoryCategoryFilter] Waiting for categories to load...');
            await new Promise(resolve => {
                const unwatch = this.$watch('categoriesStore.isLoading', (newValue) => {
                    if (!newValue) {
                        console.log('[InventoryCategoryFilter] Categories loaded, count:', this.categories.length);
                        unwatch();
                        resolve();
                    }
                });
            });
        }
        
        // Perform initial sync after data is loaded
        console.log('[InventoryCategoryFilter] Performing initial sync with URL');
        this.hasPerformedInitialSync = true;
        this.syncWithURL();
    },
    methods: {
        handleChange(event) {
            const value = event.target.value;
            console.log('[InventoryCategoryFilter] User changed category selection:', value);
            this.selectedCategory = value;
            
            // Emit event with category name or null for "All Items"
            const categoryName = value || null;
            
            console.log('[InventoryCategoryFilter] Emitting category-selected and updating URL with:', categoryName);
            this.$emit('category-selected', categoryName);
            this.updateURL(categoryName);
        },
        
        updateURL(categoryName) {
            console.log('[InventoryCategoryFilter] updateURL called with:', categoryName);
            const cleanPath = this.containerPath.split('?')[0];
            const isOnDashboard = this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
            
            console.log('[InventoryCategoryFilter] Update context:', {
                cleanPath,
                isOnDashboard,
                currentPath: this.appContext?.currentPath
            });
            
            // Build new path with itemCategoryFilter parameter
            const newPath = NavigationRegistry.buildPathWithCurrentParams(
                cleanPath,
                this.appContext?.currentPath,
                {
                    itemCategoryFilter: categoryName || undefined // undefined removes the parameter
                }
            );
            
            console.log('[InventoryCategoryFilter] Built new path:', newPath);
            
            if (isOnDashboard) {
                // Update dashboard registry with new path
                console.log('[InventoryCategoryFilter] Updating dashboard registry');
                NavigationRegistry.dashboardRegistry.updatePath(
                    cleanPath,
                    newPath
                );
            } else if (this.navigateToPath) {
                console.log('[InventoryCategoryFilter] Calling navigateToPath with:', newPath);
                this.navigateToPath(newPath);
            } else {
                console.log('[InventoryCategoryFilter] No navigation method available');
            }
        },
        
        syncWithURL() {
            console.log('[InventoryCategoryFilter] syncWithURL called');
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath,
                this.appContext?.currentPath
            );
            
            console.log('[InventoryCategoryFilter] URL parameters:', params);
            
            // Get itemCategoryFilter from URL params
            const categoryFromUrl = params?.itemCategoryFilter || '';
            
            console.log('[InventoryCategoryFilter] Category from URL:', categoryFromUrl, 'hasPerformedInitialSync:', this.hasPerformedInitialSync);
            
            // Update selected category
            this.selectedCategory = categoryFromUrl;
            
            // Emit the category if component is being used
            if (this.hasPerformedInitialSync) {
                console.log('[InventoryCategoryFilter] Emitting category-selected event:', categoryFromUrl || null);
                this.$emit('category-selected', categoryFromUrl || null);
            } else {
                console.log('[InventoryCategoryFilter] Skipping event emit - not initialized yet');
            }
        }
    },
    template: html`
        <select 
            :value="selectedCategory"
            :title="isLoading ? 'Loading inventory filters...' : 'Select an inventory filter'"
            @change="handleChange"
            :disabled="isLoading"
        >
            <option value="">
                {{ isLoading ? 'Loading...' : 'All Items' }}
            </option>
            <option 
                v-for="category in visibleCategories" 
                :key="category.title"
                :value="category.title"
            >
                {{ category.title }}
            </option>
        </select>
    `
};
