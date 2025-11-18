import { html, getReactiveStore, Requests, authState, NavigationRegistry, buildDateSearchParameter, buildTextFilterParameters, parseDateSearchParameter, parseTextFilterParameters } from '../../index.js';

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
            isUsingUrlParams: false,
            isLoadingOptions: false,
            availableOptions: [],
            pendingUrlParams: null // Store URL params if they couldn't be matched yet
        };
    },
    computed: {
        savedSearches() {
            return this.savedSearchesStore?.data || [];
        },
        
        displayValue() {
            if (this.isUsingUrlParams) {
                return 'url-params';
            }
            return this.selectedValue;
        },
        
        isLoading() {
            return this.savedSearchesStore?.isLoading || this.isLoadingOptions;
        },
        
        isOnDashboard() {
            return this.appContext?.currentPage === 'dashboard';
        },
        
        // Computed property to reactively track navigation parameters
        navigationParameters() {
            return NavigationRegistry.getNavigationParameters(this.containerPath);
        }
    },
    watch: {
        savedSearches: {
            handler(newSavedSearches) {
                // Rebuild options when saved searches change
                this.buildOptions();
                
                // If we have pending URL params, try to match them again now that saved searches are loaded
                if (this.pendingUrlParams && newSavedSearches && newSavedSearches.length > 0) {
                    this.matchUrlToSavedSearch(this.pendingUrlParams);
                }
                // If no selection yet, check URL params before applying default
                else if (!this.selectedValue && newSavedSearches && newSavedSearches.length > 0) {
                    // Try to load from URL first
                    if (!this.loadFromURL()) {
                        // Only apply default if no URL params exist
                        if (this.defaultSearch) {
                            this.applyDefaultSearch();
                        }
                    }
                }
            },
            deep: true
        },
        // Watch for navigation parameter changes (reactive to URL changes)
        navigationParameters: {
            handler(newParams, oldParams) {
                // Skip if this is the first load (handled by mounted)
                if (!oldParams) return;
                
                // Skip if parameters haven't actually changed
                if (JSON.stringify(newParams) === JSON.stringify(oldParams)) return;
                
                console.log('[SavedSearchSelect] Navigation parameters changed:', oldParams, '->', newParams);
                
                // If we have no selection and parameters exist, try to load from URL
                if (Object.keys(newParams).length > 0 && !this.selectedValue && !this.isUsingUrlParams) {
                    console.log('[SavedSearchSelect] Loading from URL due to parameter change');
                    this.loadFromURL();
                }
            },
            deep: true
        }
    },
    async mounted() {
        await this.initializeSavedSearchesStore();
        await this.buildOptions();
        
        // Try to load from URL parameters first (highest priority)
        if (!this.loadFromURL()) {
            // No URL params, try to apply default search if provided
            if (this.defaultSearch) {
                this.applyDefaultSearch();
            } else {
                // No URL params and no default, emit ready event
                this.$emit('ready');
            }
        }
    },
    methods: {
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
                
                // Add URL params option (always disabled)
                options.push({ 
                    value: 'url-params', 
                    label: 'URL Params', 
                    type: 'urlparams', 
                    disabled: true 
                });
                
                this.availableOptions = options;
            } catch (error) {
                console.error('[SavedSearchSelect] Failed to build options:', error);
            } finally {
                this.isLoadingOptions = false;
            }
        },
        
        handleChange(event) {
            const value = event.target.value;
            
            // Clear URL params flag when user manually selects
            this.isUsingUrlParams = false;
            this.selectedValue = value;
            
            // Handle "Select..." (empty value) - emit null to clear search
            if (value === '' || !value) {
                this.emitSearchData(null);
                
                // Clear URL parameters
                NavigationRegistry.setNavigationParameters(this.containerPath, {});
                
                // Only navigate to update URL if NOT on dashboard
                if (!this.isOnDashboard && this.navigateToPath) {
                    const path = NavigationRegistry.buildPath(this.containerPath, {});
                    this.navigateToPath(path);
                }
                
                return;
            }
            
            // Find the selected option
            const option = this.availableOptions.find(opt => opt.value === value);
            
            if (!option || option.disabled) {
                return;
            }
            
            if (option.type === 'show-all') {
                // Emit "show all" signal
                const searchData = {
                    type: 'show-all'
                };
                
                // Clear URL parameters for "show all"
                NavigationRegistry.setNavigationParameters(this.containerPath, {});
                
                // Only navigate to update URL if NOT on dashboard
                if (!this.isOnDashboard && this.navigateToPath) {
                    const path = NavigationRegistry.buildPath(this.containerPath, {});
                    this.navigateToPath(path);
                }
                
                this.emitSearchData(searchData);
            } else if (option.type === 'year') {
                // Emit year selection
                const year = parseInt(value);
                const searchData = {
                    type: 'year',
                    year: year,
                    startDate: `${year}-01-01`,
                    endDate: `${year}-12-31`,
                    byShowDate: true // Flag to indicate searching by precise show date
                };
                
                // Save year selection to URL with ByShowDate parameter
                this.saveYearToURL(year);
                this.emitSearchData(searchData);
            } else if (option.type === 'search') {
                // Emit saved search data
                const searchData = {
                    type: 'search',
                    ...option.searchData
                };
                
                this.saveToURL(option.searchData);
                this.emitSearchData(searchData);
            }
        },
        
        emitSearchData(searchData) {
            this.$emit('search-selected', searchData);
        },
        
        saveYearToURL(year) {
            const params = {
                DateSearch: `${year}-01-01,${year}-12-31`,
                ByShowDate: 'true'
            };
            
            // Update navigation parameters
            NavigationRegistry.setNavigationParameters(this.containerPath, params);
            
            // Only navigate to update URL if NOT on dashboard
            if (!this.isOnDashboard && this.navigateToPath) {
                const path = NavigationRegistry.buildPath(this.containerPath, params);
                this.navigateToPath(path);
            }
        },
        
        saveToURL(searchData) {
            if (!searchData) return;
            
            const params = {};
            
            // Build DateSearch parameter
            if (searchData.dateSearch) {
                params.DateSearch = searchData.dateSearch;
            }
            
            // Add ByShowDate parameter if present
            if (searchData.byShowDate) {
                params.ByShowDate = 'true';
            }
            
            // Build text filter parameters
            if (searchData.textFilters && searchData.textFilters.length > 0) {
                const textFilterParams = buildTextFilterParameters(searchData.textFilters);
                Object.assign(params, textFilterParams);
            }
            
            // Update navigation parameters
            NavigationRegistry.setNavigationParameters(this.containerPath, params);
            
            // Only navigate to update URL if NOT on dashboard
            if (!this.isOnDashboard && this.navigateToPath) {
                const path = NavigationRegistry.buildPath(this.containerPath, params);
                this.navigateToPath(path);
            }
        },
        
        applyDefaultSearch() {
            if (!this.defaultSearch) return;
            
            console.log('[SavedSearchSelect] Attempting to apply default search:', this.defaultSearch);
            
            // Check if default is a year (for year-based searches)
            if (this.includeYears && /^\d{4}$/.test(this.defaultSearch)) {
                const yearOption = this.availableOptions.find(
                    opt => opt.value === this.defaultSearch && opt.type === 'year'
                );
                
                if (yearOption) {
                    console.log('[SavedSearchSelect] Found matching year option:', this.defaultSearch);
                    this.selectedValue = this.defaultSearch;
                    
                    const year = parseInt(this.defaultSearch);
                    const searchData = {
                        type: 'year',
                        year: year,
                        startDate: `${year}-01-01`,
                        endDate: `${year}-12-31`,
                        byShowDate: true
                    };
                    
                    // Save to URL using the same method as manual selection
                    this.saveYearToURL(year);
                    this.emitSearchData(searchData);
                    return;
                }
            }
            
            // Check if default matches a saved search by name
            const savedSearches = this.savedSearchesStore?.data || [];
            const matchedSearchIndex = savedSearches.findIndex(
                search => search.name === this.defaultSearch
            );
            
            if (matchedSearchIndex >= 0) {
                console.log('[SavedSearchSelect] Found matching saved search:', this.defaultSearch);
                this.selectedValue = `search-${matchedSearchIndex}`;
                
                const matchedSearch = savedSearches[matchedSearchIndex];
                const searchData = {
                    type: 'search',
                    name: matchedSearch.name,
                    dateSearch: matchedSearch.dateSearch,
                    textFilters: matchedSearch.textFilters || [],
                    byShowDate: matchedSearch.byShowDate || false
                };
                
                // Save to URL using the same method as manual selection
                this.saveToURL(matchedSearch);
                this.emitSearchData(searchData);
                return;
            }
            
            // Default not found, remain in unselected state
            console.log('[SavedSearchSelect] Default search not found in options:', this.defaultSearch);
            this.$emit('ready');
        },
        
        matchUrlToSavedSearch(urlSearchData) {
            // Check if URL parameters match any saved search
            const savedSearches = this.savedSearchesStore?.data || [];
            
            if (!savedSearches || savedSearches.length === 0) {
                // No saved searches available yet, store for later
                this.pendingUrlParams = urlSearchData;
                return false;
            }
            
            const matchedSearchIndex = savedSearches.findIndex(search => {
                // Compare dateSearch
                if (search.dateSearch !== urlSearchData.dateSearch) {
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
            
            // If URL matches a saved search, select it instead of using "URL Params"
            if (matchedSearchIndex >= 0) {
                this.selectedValue = `search-${matchedSearchIndex}`;
                this.isUsingUrlParams = false;
                this.pendingUrlParams = null; // Clear pending params
                
                const matchedSearch = savedSearches[matchedSearchIndex];
                const searchData = {
                    type: 'search',
                    name: matchedSearch.name,
                    dateSearch: matchedSearch.dateSearch,
                    textFilters: matchedSearch.textFilters || [],
                    byShowDate: matchedSearch.byShowDate || false
                };
                
                this.emitSearchData(searchData);
                return true;
            }
            
            return false;
        },
        
        loadFromURL() {
            // Get URL parameters
            const params = NavigationRegistry.getNavigationParameters(this.containerPath);

            if (Object.keys(params).length === 0) return false;
            
            // Check if there are search parameters
            const hasDateSearch = !!params.DateSearch;
            const hasTextFilters = Object.keys(params).some(key => key.startsWith('Col') || key.startsWith('Val'));

            if (!hasDateSearch && !hasTextFilters) return false;
            
            // Check if this is a year-based date search (if includeYears is true)
            // Note: ByShowDate can be either boolean true or string 'true'
            const isByShowDate = params.ByShowDate === true || params.ByShowDate === 'true';
            
            if (this.includeYears && hasDateSearch && !hasTextFilters && isByShowDate) {

                // Try to extract year from DateSearch parameter
                // Format: "YYYY-01-01,YYYY-12-31" for year searches
                const dateSearchMatch = params.DateSearch.match(/^(\d{4})-01-01,(\d{4})-12-31$/);
                
                if (dateSearchMatch && dateSearchMatch[1] === dateSearchMatch[2]) {
                    const year = dateSearchMatch[1];

                    // Check if this year is in our available options
                    const yearOption = this.availableOptions.find(opt => opt.value === year && opt.type === 'year');

                    if (yearOption) {
                        // Set the dropdown to this year
                        this.selectedValue = year;
                        this.isUsingUrlParams = false;

                        // Emit year selection
                        const searchData = {
                            type: 'year',
                            year: parseInt(year),
                            startDate: `${year}-01-01`,
                            endDate: `${year}-12-31`,
                            byShowDate: true
                        };
                        
                        this.emitSearchData(searchData);
                        return true;
                    } else {
                        console.warn('[SavedSearchSelect] Year option not found in availableOptions');
                    }
                }
            }
            
            // Parse the parameters to create searchData for comparison
            const urlSearchData = {
                dateSearch: params.DateSearch || null,
                textFilters: hasTextFilters ? parseTextFilterParameters(params) : [],
                byShowDate: params.ByShowDate === true || params.ByShowDate === 'true'
            };
            
            // Try to match URL to a saved search
            if (this.matchUrlToSavedSearch(urlSearchData)) {
                return true;
            }
            
            // Otherwise, use URL Params as a custom search
            const searchData = {
                type: 'url',
                name: 'URL Params',
                dateSearch: urlSearchData.dateSearch,
                textFilters: urlSearchData.textFilters,
                byShowDate: urlSearchData.byShowDate
            };
            
            // Set flag to show "URL Params" in dropdown
            this.isUsingUrlParams = true;
            
            // Emit the search data
            this.emitSearchData(searchData);
            
            return true;
        }
    },
    template: html`
        <select 
            :value="displayValue"
            @change="handleChange"
            :disabled="isLoading"
        >
            <option value="" v-if="isLoading">Loading...</option>
            <option value="" v-else-if="availableOptions.length === 0">No options available</option>
            <option value="" v-else>Select...</option>
            <option 
                v-for="option in availableOptions" 
                :key="option.value" 
                :value="option.value"
                :disabled="option.disabled"
            >
                {{ option.label }}
            </option>
        </select>
    `
};
