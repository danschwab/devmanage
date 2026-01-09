import { html, getReactiveStore, Requests, authState, NavigationRegistry, buildTextFilterParameters, parsedateFilterParameter, parseTextFilterParameters } from '../../index.js';

/**
 * Reusable component for saved search selection with optional year options
 * Handles saved searches, URL parameters, and emits search data to parent
 */
export const SavedSearchSelect = {
    inject: ['appContext'],
    props: {
        containerPath: {
            type: String,
            required: true
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
        }
    },
    data() {
        return {
            savedSearchesStore: null,
            selectedValue: '',
            isLoadingOptions: false,
            availableOptions: []
        };
    },
    computed: {
        savedSearches() {
            return this.savedSearchesStore?.data || [];
        },
        
        isLoading() {
            return this.savedSearchesStore?.isLoading || this.isLoadingOptions;
        },
        
        isOnDashboard() {
            return this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
        }
    },
    watch: {
        savedSearches() {
            // Rebuild options when saved searches change
            this.buildOptions();
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
                
                console.log('[SavedSearchSelect] URL parameters changed, syncing dropdown');
                this.syncWithURL();
            },
            deep: true
        }
    },
    async mounted() {
        await this.initializeSavedSearchesStore();
        await this.buildOptions();
        
        // Sync dropdown with URL or apply default
        this.syncWithURL();
    },
    methods: {
        /**
         * Check if this component is still active (user hasn't navigated away)
         * Prevents stale navigation from async operations
         */
        isComponentActive() {
            if (!this.appContext?.currentPath) return false;
            
            const currentCleanPath = this.appContext.currentPath.split('?')[0];
            const containerCleanPath = this.containerPath.split('?')[0];
            
            // On dashboard, we're always active if on dashboard page
            if (this.isOnDashboard) {
                return currentCleanPath.startsWith('dashboard');
            }
            
            // Not on dashboard, check if current path matches our container
            return currentCleanPath === containerCleanPath;
        },
        
        async initializeSavedSearchesStore() {
            if (!authState.isAuthenticated || !authState.user?.email) {
                console.log('[SavedSearchSelect] User not authenticated, skipping initialization');
                return;
            }
            
            this.savedSearchesStore = getReactiveStore(
                Requests.getUserData,
                Requests.storeUserData,
                [authState.user.email, 'saved_searches'],
                null,
                true
            );
            
            // Wait for store to load
            if (this.savedSearchesStore.isLoading) {
                await new Promise(resolve => {
                    const checkLoading = setInterval(() => {
                        if (!this.savedSearchesStore.isLoading) {
                            clearInterval(checkLoading);
                            resolve();
                        }
                    }, 50);
                });
            }
        },
        
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
                    // Include next year and current year, then go back to startYear
                    for (let year = currentYear + 1; year >= this.startYear; year--) {
                        options.push({ 
                            value: year.toString(), 
                            label: year.toString(), 
                            type: 'year' 
                        });
                    }
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
                console.error('[SavedSearchSelect] Failed to build options:', error);
            } finally {
                this.isLoadingOptions = false;
            }
        },
        
        handleChange(event) {
            const value = event.target.value;
            this.selectedValue = value;
            
            // Handle "Select..." (empty value) - emit null to clear search
            if (value === '' || !value) {
                this.emitSearchData(null);
                this.updateURL({});
                return;
            }
            
            // Find the selected option
            const option = this.availableOptions.find(opt => opt.value === value);
            
            if (!option || option.disabled) {
                return;
            }
            
            this.applyOption(option);
        },
        
        applyOption(option) {
            if (option.type === 'show-all') {
                this.emitSearchData({ type: 'show-all' });
                this.updateURL({ view: 'all' });
            } else if (option.type === 'year') {
                const year = parseInt(option.value);
                const searchData = {
                    type: 'year',
                    year: year,
                    startDate: `${year}-01-01`,
                    endDate: `${year}-12-31`,
                    byShowDate: true
                };
                this.emitSearchData(searchData);
                this.updateURL({
                    dateFilter: `${year}-01-01,${year}-12-31`,
                    byShowDate: true
                });
            } else if (option.type === 'search') {
                const searchData = {
                    type: 'search',
                    ...option.searchData
                };
                this.emitSearchData(searchData);
                this.updateURLFromSearch(option.searchData);
            }
        },
        
        emitSearchData(searchData) {
            this.$emit('search-selected', searchData);
        },
        
        updateURL(params) {
            // Guard: Don't navigate if component is no longer active
            // This prevents race conditions where user navigates away before async operations complete
            if (!this.isComponentActive()) {
                console.log('[SavedSearchSelect] Skipping navigation - component no longer active');
                return;
            }
            
            // Update URL or dashboard registry depending on context
            // Use clean container path (without query params) to avoid merging with old params
            const cleanPath = this.containerPath.split('?')[0];
            if (this.isOnDashboard) {
                // Update dashboard registry with new path including params
                const newPath = NavigationRegistry.buildPath(cleanPath, params);
                NavigationRegistry.dashboardRegistry.updatePath(
                    cleanPath,
                    newPath
                );
            } else if (this.navigateToPath) {
                const path = NavigationRegistry.buildPath(cleanPath, params);
                this.navigateToPath(path);
            }
        },
        
        updateURLFromSearch(searchData) {
            if (!searchData) return;
            
            const params = {};
            
            if (searchData.dateFilter) {
                params.dateFilter = searchData.dateFilter;
            }
            
            if (searchData.textFilters && searchData.textFilters.length > 0) {
                params.textFilters = searchData.textFilters;
            }
            
            if (searchData.byShowDate !== undefined) {
                params.byShowDate = searchData.byShowDate;
            }
            
            this.updateURL(params);
        },
        
        applyDefaultSearch() {
            if (!this.defaultSearch) return;
            
            console.log('[SavedSearchSelect] Applying default search:', this.defaultSearch);
            
            // Find the option matching the default
            const option = this.availableOptions.find(
                opt => opt.value === this.defaultSearch || opt.label === this.defaultSearch
            );
            
            if (!option) {
                console.warn('[SavedSearchSelect] Default search not found:', this.defaultSearch);
                return;
            }
            
            // Set selection and trigger the same logic as user selection
            this.selectedValue = option.value;
            this.applyOption(option);
        },
        
        matchUrlToSavedSearch(urlSearchData) {
            const savedSearches = this.savedSearchesStore?.data || [];
            
            if (!savedSearches || savedSearches.length === 0) {
                return false;
            }
            
            const matchedSearchIndex = savedSearches.findIndex(search => {
                // Compare dateFilter
                if (search.dateFilter !== urlSearchData.dateFilter) {
                    return false;
                }
                
                // Compare byShowDate flag
                if ((search.byShowDate || false) !== urlSearchData.byShowDate) {
                    return false;
                }
                
                // Compare text filters (order-independent)
                const searchFilters = search.textFilters || [];
                const urlFilters = urlSearchData.textFilters || [];
                
                if (searchFilters.length !== urlFilters.length) {
                    return false;
                }
                
                // Check if all filters match (ignoring order)
                return searchFilters.every(sf => 
                    urlFilters.some(uf => uf.column === sf.column && uf.value === sf.value)
                ) && urlFilters.every(uf => 
                    searchFilters.some(sf => sf.column === uf.column && sf.value === uf.value)
                );
            });
            
            // If URL matches a saved search, select it and emit
            if (matchedSearchIndex >= 0) {
                this.selectedValue = `search-${matchedSearchIndex}`;
                const matchedSearch = savedSearches[matchedSearchIndex];
                this.emitSearchData({
                    type: 'search',
                    name: matchedSearch.name,
                    dateFilter: matchedSearch.dateFilter,
                    textFilters: matchedSearch.textFilters || [],
                    byShowDate: matchedSearch.byShowDate || false
                });
                return true;
            }
            
            return false;
        },
        
        syncWithURL() {
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath,
                this.appContext?.currentPath
            );
            
            // No URL parameters - apply default if provided
            if (Object.keys(params).length === 0) {
                if (this.defaultSearch) {
                    this.applyDefaultSearch();
                }
                return;
            }
            
            const filter = {
                dateFilter: params.dateFilter || null,
                textFilters: params.textFilters || [],
                byShowDate: params.byShowDate || false,
                view: params.view || null
            };
            
            // Check for view=all (show-all)
            if (filter.view === 'all' && this.allowShowAll) {
                this.selectedValue = 'show-all';
                this.emitSearchData({ type: 'show-all' });
                return;
            }
            
            // Try to match year selection
            if (this.includeYears && filter.dateFilter && !filter.textFilters.length && filter.byShowDate) {
                const dateFilterMatch = filter.dateFilter.match(/^(\d{4})-01-01,(\d{4})-12-31$/);
                
                if (dateFilterMatch && dateFilterMatch[1] === dateFilterMatch[2]) {
                    const year = dateFilterMatch[1];
                    const yearOption = this.availableOptions.find(opt => opt.value === year && opt.type === 'year');
                    
                    if (yearOption) {
                        this.selectedValue = year;
                        this.emitSearchData({
                            type: 'year',
                            year: parseInt(year),
                            startDate: `${year}-01-01`,
                            endDate: `${year}-12-31`,
                            byShowDate: true
                        });
                        return;
                    }
                }
            }
            
            // Try to match URL to a saved search
            if (this.matchUrlToSavedSearch(filter)) {
                return;
            }
            
            // URL params don't match any saved search - show as custom search
            this.selectedValue = 'custom';
            this.emitSearchData({
                type: 'url',
                name: 'Custom',
                dateFilter: filter.dateFilter,
                textFilters: filter.textFilters,
                byShowDate: filter.byShowDate
            });
        }
    },
    template: html`
        <select 
            :value="selectedValue"
            @change="handleChange"
            :disabled="isLoading"
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
            <option value="custom" disabled>Custom</option>
        </select>
    `
};
