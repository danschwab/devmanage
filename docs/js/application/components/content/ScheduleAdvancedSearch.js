import { html, ScheduleTableComponent, Requests, NavigationRegistry, LoadingBarComponent, authState, parseDateSearchParameter, buildDateSearchParameter, parseTextFilterParameters, buildTextFilterParameters, getReactiveStore } from '../../index.js';

// Advanced Search Component for Schedule
export const AdvancedSearchComponent = {
    components: {
        ScheduleTableComponent,
        LoadingBarComponent
    },
    inject: ['$modal'],
    props: {
        containerPath: String,
        navigateToPath: Function
    },
    data() {
        return {
            // Date range filters
            startDate: '',
            endDate: '',
            startDatePreset: '', // Selected preset for start date (e.g., 'today', 'monthAgo')
            endDatePreset: '', // Selected preset for end date (e.g., 'today', 'inMonth')
            overlapShowIdentifier: '', // Identifier of the show to find overlaps with
            overlapShowYearFilter: new Date().getFullYear().toString(), // 'upcoming' or specific year (defaults to current year)
            dateFilterMode: 'dateRange', // 'dateRange' or 'overlap' - tracks which filter is active
            
            // Dynamic text search filters
            textFilters: [
                { id: 1, column: '', value: '' }
            ],
            nextFilterId: 2,
            
            // Available columns for text search
            availableColumns: [],
            isLoadingColumns: false,
            
            // Available shows for overlap dropdown (all shows from API)
            allShows: [],
            isLoadingShows: false,
            
            // Computed filter for table
            activeFilter: null,
            activeSearchParams: null,
            
            // Flag to prevent watchers from clearing during programmatic updates
            isApplyingFilters: false,
            
            // Reactive store for saved searches
            savedSearchesStore: null,
            
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
        hasDateRangeFilter() {
            return this.startDate || this.endDate || this.overlapShowIdentifier;
        },
        hasTextSearchFilter() {
            return this.textFilters.some(f => f.column && f.value);
        },
        availableYears() {
            const currentYear = new Date().getFullYear();
            const years = [];
            for (let y = currentYear + 2; y >= 2023; y--) {
                years.push(y);
            }
            return years;
        },
        filteredShows() {
            if (!this.allShows || this.allShows.length === 0) {
                return [];
            }

            if (this.overlapShowYearFilter === 'upcoming') {
                // Filter for upcoming shows (current year and future)
                const currentYear = new Date().getFullYear();
                return this.allShows.filter(show => {
                    const year = parseInt(show.year);
                    return year >= currentYear;
                });
            } else {
                // Filter by specific year
                const selectedYear = parseInt(this.overlapShowYearFilter);
                return this.allShows.filter(show => {
                    return parseInt(show.year) === selectedYear;
                });
            }
        }
    },
    async mounted() {
        // Initialize saved searches store
        this.initializeSavedSearchesStore();
        
        // Load filters from URL parameters if present
        this.loadFiltersFromURL();

        await Promise.all([
            this.loadAvailableShows(),
            this.loadAvailableColumns()
        ]);
    },
    watch: {
        // Watch for changes to any filter input and clear active filters
        startDate() {
            if (!this.isApplyingFilters) this.clearActiveFilters();
        },
        endDate() {
            if (!this.isApplyingFilters) this.clearActiveFilters();
        },
        startDatePreset() {
            if (!this.isApplyingFilters) this.clearActiveFilters();
        },
        endDatePreset() {
            if (!this.isApplyingFilters) this.clearActiveFilters();
        },
        overlapShowIdentifier() {
            if (!this.isApplyingFilters) this.clearActiveFilters();
        },
        dateFilterMode() {
            if (!this.isApplyingFilters) this.clearActiveFilters();
        },
        textFilters: {
            handler() {
                if (!this.isApplyingFilters) this.clearActiveFilters();
            },
            deep: true
        }
    },
    methods: {
        async initializeSavedSearchesStore() {
            // Only initialize store if user is authenticated
            if (!authState.isAuthenticated || !authState.user?.email) {
                console.log('[AdvancedSearch] User not authenticated, skipping saved searches initialization');
                return;
            }
            
            // Initialize reactive store - defaults are handled by ApplicationUtils layer
            this.savedSearchesStore = getReactiveStore(
                Requests.getUserData,
                Requests.storeUserData,
                [authState.user.email, 'saved_searches'],
                null, // No analysis config
                true // Auto-load
            );
        },
        loadFiltersFromURL() {
            // Get URL parameters from NavigationRegistry
            const params = NavigationRegistry.getNavigationParameters('schedule/advanced-search');
            
            if (Object.keys(params).length === 0) return;
            
            // Set flag to prevent watchers from clearing during URL load
            this.isApplyingFilters = true;
            
            // Parse URL parameters to searchData format for comparison
            const urlSearchData = {
                dateSearch: params.DateSearch || null,
                textFilters: parseTextFilterParameters(params)
            };
            
            // Check if URL parameters match any saved search
            let matchedSearchIndex = null;
            if (this.savedSearches && this.savedSearches.length > 0) {
                matchedSearchIndex = this.savedSearches.findIndex(search => {
                    // Compare dateSearch
                    if (search.dateSearch !== urlSearchData.dateSearch) {
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
            }
            
            // If URL matches a saved search, select it and use handleSavedSearchSelection
            if (matchedSearchIndex !== null && matchedSearchIndex >= 0) {
                this.selectedSavedSearchIndex = matchedSearchIndex;
                this.handleSavedSearchSelection();
                this.isApplyingFilters = false;
                return;
            }
            
            // Otherwise, load URL parameters as custom search
            // Parse DateSearch parameter using utility
            if (params.DateSearch) {
                const dateFilter = parseDateSearchParameter(params.DateSearch);
                
                // Handle offsets - map back to presets if they match known values
                if (dateFilter.startDateOffset !== undefined) {
                    const startOffset = dateFilter.startDateOffset;
                    if (startOffset === 0) this.startDatePreset = 'today';
                    else if (startOffset === -30) this.startDatePreset = 'monthAgo';
                    else if (startOffset === -365) this.startDatePreset = 'yearAgo';
                    
                    if (this.startDatePreset) {
                        this.setStartDatePreset(this.startDatePreset);
                    }
                }
                
                if (dateFilter.endDateOffset !== undefined) {
                    const endOffset = dateFilter.endDateOffset;
                    if (endOffset === 0) this.endDatePreset = 'today';
                    else if (endOffset === 30) this.endDatePreset = 'inMonth';
                    else if (endOffset === 365) this.endDatePreset = 'inYear';
                    
                    if (this.endDatePreset) {
                        this.setEndDatePreset(this.endDatePreset);
                    }
                }
                
                // Handle explicit dates
                if (dateFilter.startDate) {
                    this.startDate = dateFilter.startDate;
                }
                if (dateFilter.endDate) {
                    this.endDate = dateFilter.endDate;
                }
                
                // Handle show identifier for overlap
                if (dateFilter.overlapShowIdentifier) {
                    this.overlapShowIdentifier = dateFilter.overlapShowIdentifier;
                    this.dateFilterMode = 'overlap';
                } else if (dateFilter.startDate || dateFilter.endDate || dateFilter.startDateOffset !== undefined || dateFilter.endDateOffset !== undefined) {
                    this.dateFilterMode = 'dateRange';
                }
            }
            
            // Parse text filters using utility
            const textFilters = parseTextFilterParameters(params);
            if (textFilters.length > 0) {
                // Add IDs for Vue reactivity
                this.textFilters = textFilters.map((filter, index) => ({
                    id: index + 1,
                    column: filter.column,
                    value: filter.value
                }));
                this.nextFilterId = textFilters.length + 1;
            }
            
            // Auto-apply filters if URL parameters were loaded
            if (params.DateSearch || textFilters.length > 0) {
                this.applyFilters();
            }
            
            // Reset flag after loading completes
            this.isApplyingFilters = false;
        },
        saveFiltersToURL() {
            const params = {};
            
            // Build DateSearch parameter using utility
            const dateSearch = buildDateSearchParameter({
                startDateOffset: this.getStartDateOffset(),
                endDateOffset: this.getEndDateOffset(),
                startDate: this.startDate,
                endDate: this.endDate,
                overlapShowIdentifier: this.dateFilterMode === 'overlap' ? this.overlapShowIdentifier : null
            });
            
            if (dateSearch) {
                params.DateSearch = dateSearch;
            }
            
            // Build text filter parameters using utility
            const textFilterParams = buildTextFilterParameters(this.textFilters);
            Object.assign(params, textFilterParams);
            
            // Update navigation parameters and URL
            NavigationRegistry.setNavigationParameters('schedule/advanced-search', params);
            
            // Navigate to update URL (this will trigger URL update)
            if (this.navigateToPath) {
                const path = NavigationRegistry.buildPath('schedule/advanced-search', params);
                this.navigateToPath(path);
            }
        },
        async loadAvailableShows() {
            this.isLoadingShows = true;
            try {
                // Get all shows from production schedule (no filters)
                const allShowsData = await Requests.getProductionScheduleData();
                
                // Create a unique list of show identifiers with display names and year
                // Use API to compute identifier from client, year, and show
                const showsWithIdentifiers = await Promise.all(
                    allShowsData.map(async (show) => {
                        const identifier = await Requests.computeIdentifier(show.Show, show.Client, show.Year);
                        return {
                            identifier: identifier,
                            display: `${show.Show} - ${show.Client} (${show.Year})`,
                            year: show.Year
                        };
                    })
                );
                
                this.allShows = showsWithIdentifiers.sort((a, b) => {
                    // Sort by year desc, then by display name
                    if (a.year !== b.year) {
                        return parseInt(b.year) - parseInt(a.year);
                    }
                    return a.display.localeCompare(b.display);
                });
                
            } catch (error) {
                console.error('Failed to load available shows:', error);
                this.allShows = [];
                this.$modal.error('Failed to load available shows. Please refresh the page and try again.', 'Shows Load Error');
            } finally {
                this.isLoadingShows = false;
            }
        },
        async loadAvailableColumns() {
            this.isLoadingColumns = true;
            try {
                // Get sample data to extract column headers
                const sampleData = await Requests.getProductionScheduleData();
                
                if (sampleData && sampleData.length > 0) {
                    // Extract all column headers from the first row, excluding AppData
                    const firstRow = sampleData[0];
                    this.availableColumns = Object.keys(firstRow)
                        .filter(key => key !== 'AppData')
                        .sort();
                } else {
                    this.availableColumns = [];
                }
                
            } catch (error) {
                console.error('Failed to load available columns:', error);
                this.availableColumns = [];
                this.$modal.error('Failed to load available search columns. Please refresh the page and try again.', 'Columns Load Error');
            } finally {
                this.isLoadingColumns = false;
            }
        },
        addTextFilter() {
            this.textFilters.push({
                id: this.nextFilterId++,
                column: '',
                value: ''
            });
        },
        removeTextFilter(filterId) {
            // Keep at least one filter
            if (this.textFilters.length > 1) {
                this.textFilters = this.textFilters.filter(f => f.id !== filterId);
            }
        },
        setStartDatePreset(preset) {
            this.startDatePreset = preset;
            
            if (preset === 'clear') {
                this.startDate = '';
                this.startDatePreset = '';
            } else {
                // Update date picker display to match preset
                this.updateDatePickerFromPreset('start');
            }
            
            this.dateFilterMode = 'dateRange';
        },
        setEndDatePreset(preset) {
            this.endDatePreset = preset;
            
            if (preset === 'clear') {
                this.endDate = '';
                this.endDatePreset = '';
            } else {
                // Update date picker display to match preset
                this.updateDatePickerFromPreset('end');
            }
            
            this.dateFilterMode = 'dateRange';
        },
        getStartDateOffset() {
            // Convert preset to day offset for API
            switch (this.startDatePreset) {
                case 'today': return 0;
                case 'monthAgo': return -30;
                case 'yearAgo': return -365;
                default: return null;
            }
        },
        getEndDateOffset() {
            // Convert preset to day offset for API
            switch (this.endDatePreset) {
                case 'today': return 0;
                case 'inMonth': return 30;
                case 'inYear': return 365;
                default: return null;
            }
        },
        calculateDateFromOffset(offsetDays) {
            // Helper function to calculate date string from offset in days
            if (offsetDays === null || offsetDays === undefined) return '';
            
            const date = new Date();
            date.setDate(date.getDate() + offsetDays);
            return date.toISOString().slice(0, 10);
        },
        updateDatePickerFromPreset(presetType) {
            // Helper function to set date picker display based on preset
            if (presetType === 'start') {
                const offset = this.getStartDateOffset();
                if (offset !== null) {
                    this.startDate = this.calculateDateFromOffset(offset);
                }
            } else if (presetType === 'end') {
                const offset = this.getEndDateOffset();
                if (offset !== null) {
                    this.endDate = this.calculateDateFromOffset(offset);
                }
            }
        },
        clearActiveFilters() {
            // Clear active filters when any input changes (user must click Apply Filters again)
            this.activeFilter = null;
            this.activeSearchParams = null;
        },
        getDatePickerCardClasses(cardDateFilterMode) {
            // Helper function to get CSS classes for date picker based on active mode
            // ['card', dateFilterMode === 'overlap' ? 'green' : 'white clickable']

            if (cardDateFilterMode === this.dateFilterMode) {
                if ((this.dateFilterMode === 'overlap' && this.overlapShowIdentifier) || (this.dateFilterMode === 'dateRange' && this.startDate && this.endDate)) {
                    return {
                        'card': true,
                        'green': true,
                        'clickable': false,
                        'analyzing' : this.isApplyingFilters
                    };
                } else {
                    return {
                        'card': true,
                        'white': true,
                        'clickable': false,
                        'analyzing' : this.isApplyingFilters
                    };
                }

            } else {
                return {
                    'card': true,
                    'white': true,
                    'clickable': true,
                    'analyzing' : this.isApplyingFilters
                };
            }
        },
        applyFilters() {
            // Set flag to prevent watchers from clearing during apply
            this.isApplyingFilters = true;
            
            // Build filter object for date range (parameters to getOverlappingShows)
            let filter = null;
            let searchParams = null;

            // Date range or overlap filtering based on active mode
            if (this.hasDateRangeFilter) {
                if (this.dateFilterMode === 'overlap' && this.overlapShowIdentifier) {
                    // Use identifier-based overlap detection
                    filter = { identifier: this.overlapShowIdentifier };
                } else if (this.dateFilterMode === 'dateRange' && (this.startDate || this.endDate)) {
                    // Use date range - prefer offsets if presets are selected
                    filter = {};
                    
                    const startOffset = this.getStartDateOffset();
                    const endOffset = this.getEndDateOffset();
                    
                    if (startOffset !== null) {
                        filter.startDateOffset = startOffset;
                    } else if (this.startDate) {
                        filter.startDate = this.startDate;
                    }
                    
                    if (endOffset !== null) {
                        filter.endDateOffset = endOffset;
                    } else if (this.endDate) {
                        filter.endDate = this.endDate;
                    }
                }
            }

            // Text search filtering (searchParams uses searchFilter)
            if (this.hasTextSearchFilter) {
                searchParams = {};
                // Build search params from dynamic text filters
                this.textFilters.forEach(f => {
                    if (f.column && f.value) {
                        searchParams[f.column] = f.value;
                    }
                });
            }

            // Set the filters
            this.activeFilter = filter;
            this.activeSearchParams = searchParams;
            
            // Save filters to URL
            this.saveFiltersToURL();
            
            // Reset flag after applying completes
            this.isApplyingFilters = false;
        },
        clearFilters() {
            this.startDate = '';
            this.endDate = '';
            this.startDatePreset = '';
            this.endDatePreset = '';
            this.overlapShowIdentifier = '';
            this.overlapShowYearFilter = new Date().getFullYear().toString();
            this.dateFilterMode = 'dateRange';
            this.textFilters = [{ id: 1, column: '', value: '' }];
            this.nextFilterId = 2;
            this.activeFilter = null;
            this.activeSearchParams = null;
            
            // Clear URL parameters
            NavigationRegistry.clearNavigationParameters('schedule/advanced-search');
            if (this.navigateToPath) {
                this.navigateToPath('schedule/advanced-search');
            }
        },
        handleSavedSearchSelection() {
            // When a saved search is selected, load it
            if (this.selectedSavedSearchIndex === null) {
                // "New Search" selected - don't load anything
                return;
            }
            
            const search = this.selectedSavedSearch;
            if (!search) return;
            
            // Set flag to prevent watchers from clearing
            this.isApplyingFilters = true;
            
            // Parse and load the saved search
            if (search.dateSearch) {
                const dateFilter = parseDateSearchParameter(search.dateSearch);
                
                // Handle offsets
                if (dateFilter.startDateOffset !== undefined) {
                    const startOffset = dateFilter.startDateOffset;
                    if (startOffset === 0) this.startDatePreset = 'today';
                    else if (startOffset === -30) this.startDatePreset = 'monthAgo';
                    else if (startOffset === -365) this.startDatePreset = 'yearAgo';
                    else this.startDatePreset = '';
                    
                    if (this.startDatePreset) {
                        this.setStartDatePreset(this.startDatePreset);
                    }
                }
                
                if (dateFilter.endDateOffset !== undefined) {
                    const endOffset = dateFilter.endDateOffset;
                    if (endOffset === 0) this.endDatePreset = 'today';
                    else if (endOffset === 30) this.endDatePreset = 'inMonth';
                    else if (endOffset === 365) this.endDatePreset = 'inYear';
                    else this.endDatePreset = '';
                    
                    if (this.endDatePreset) {
                        this.setEndDatePreset(this.endDatePreset);
                    }
                }
                
                // Handle explicit dates
                if (dateFilter.startDate) {
                    this.startDate = dateFilter.startDate;
                    this.startDatePreset = '';
                }
                if (dateFilter.endDate) {
                    this.endDate = dateFilter.endDate;
                    this.endDatePreset = '';
                }
                
                // Handle show identifier for overlap
                if (dateFilter.overlapShowIdentifier) {
                    this.overlapShowIdentifier = dateFilter.overlapShowIdentifier;
                    this.dateFilterMode = 'overlap';
                } else if (dateFilter.startDate || dateFilter.endDate || dateFilter.startDateOffset !== undefined || dateFilter.endDateOffset !== undefined) {
                    this.dateFilterMode = 'dateRange';
                }
            }
            
            // Load text filters
            if (search.textFilters && search.textFilters.length > 0) {
                this.textFilters = search.textFilters.map((filter, index) => ({
                    id: index + 1,
                    column: filter.column,
                    value: filter.value
                }));
                this.nextFilterId = search.textFilters.length + 1;
            } else {
                this.textFilters = [{ id: 1, column: '', value: '' }];
                this.nextFilterId = 2;
            }
            
            // Apply the loaded filters
            this.applyFilters();
            
            // Reset flag
            this.isApplyingFilters = false;
        },
        async updateSavedSearch() {
            if (this.selectedSavedSearchIndex === null || !this.selectedSavedSearch) {
                return;
            }
            
            // Check if user is authenticated
            if (!authState.isAuthenticated || !authState.user?.email) {
                this.$modal.alert('You must be logged in to update searches.', 'Error');
                return;
            }
            
            try {
                // Build updated search data
                const searchData = {
                    name: this.selectedSavedSearch.name, // Keep the same name
                    dateSearch: null,
                    textFilters: []
                };
                
                // Build DateSearch parameter
                searchData.dateSearch = buildDateSearchParameter({
                    startDateOffset: this.getStartDateOffset(),
                    endDateOffset: this.getEndDateOffset(),
                    startDate: this.startDate,
                    endDate: this.endDate,
                    overlapShowIdentifier: this.dateFilterMode === 'overlap' ? this.overlapShowIdentifier : null
                });
                
                // Add text filters
                if (this.textFilters && this.textFilters.length > 0) {
                    searchData.textFilters = this.textFilters
                        .filter(filter => filter.column && filter.value)
                        .map(filter => ({
                            column: filter.column,
                            value: filter.value
                        }));
                }
                
                // Update in store
                if (this.savedSearchesStore && this.savedSearchesStore.data) {
                    this.savedSearchesStore.data[this.selectedSavedSearchIndex] = searchData;
                    await this.savedSearchesStore.save();
                    
                    this.$modal.alert('Search updated successfully!', 'Success');
                } else {
                    throw new Error('Saved searches store not initialized');
                }
            } catch (error) {
                console.error('Failed to update search:', error);
                this.$modal.error('Failed to update the saved search. Please try again or contact support if the problem persists.', 'Update Search Error');
            }
        },
        deleteSavedSearch() {
            if (this.selectedSavedSearchIndex === null || !this.selectedSavedSearch) {
                return;
            }
            
            // Check if user is authenticated
            if (!authState.isAuthenticated || !authState.user?.email) {
                this.$modal.alert('You must be logged in to delete searches.', 'Error');
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
                            
                            this.$modal.alert('Search deleted successfully!', 'Success');
                        } else {
                            throw new Error('Saved searches store not initialized');
                        }
                    } catch (error) {
                        console.error('Failed to delete search:', error);
                        this.$modal.error('Failed to delete the saved search. Please try again or contact support if the problem persists.', 'Delete Search Error');
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
                    startDate: String,
                    endDate: String,
                    startDateOffset: Number,
                    endDateOffset: Number,
                    overlapShowIdentifier: String,
                    textFilters: Array,
                    savedSearchesStore: Object,
                    advancedSearchComponent: Object
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
                            this.$modal.alert('Please enter a search name.', 'Warning');
                            return;
                        }
                        
                        // Check if user is authenticated
                        if (!authState.isAuthenticated || !authState.user?.email) {
                            this.$modal.alert('You must be logged in to save searches.', 'Error');
                            return;
                        }
                        
                        try {
                            this.isSaving = true;
                            
                            // Get current search parameters
                            const searchData = {
                                name: this.searchName.trim(),
                                dateSearch: null,
                                textFilters: []
                            };
                            
                            // Build DateSearch parameter using utility (same as saveFiltersToURL)
                            searchData.dateSearch = buildDateSearchParameter({
                                startDateOffset: this.startDateOffset,
                                endDateOffset: this.endDateOffset,
                                startDate: this.startDate,
                                endDate: this.endDate,
                                overlapShowIdentifier: this.overlapShowIdentifier
                            });
                            
                            // Add text filters (strip IDs, just keep column/value)
                            if (this.textFilters && this.textFilters.length > 0) {
                                searchData.textFilters = this.textFilters.map(filter => ({
                                    column: filter.column,
                                    value: filter.value
                                }));
                            }
                            
                            // Save using reactive store (passed as prop)
                            if (this.savedSearchesStore && this.savedSearchesStore.data) {
                                this.savedSearchesStore.data.push(searchData);
                                await this.savedSearchesStore.save();
                                
                                // Select the newly saved search in the parent component
                                if (this.advancedSearchComponent) {
                                    this.advancedSearchComponent.selectedSavedSearchIndex = this.savedSearchesStore.data.length - 1;
                                }
                                
                                this.$modal.alert('Search saved successfully!', 'Success');
                                this.$emit('close-modal');
                            } else {
                                throw new Error('Saved searches store not initialized');
                            }
                        } catch (error) {
                            console.error('Failed to save search:', error);
                            this.$modal.error('Failed to save the search. Please try again or contact support if the problem persists.', 'Save Search Error');
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
                startDate: this.startDate,
                endDate: this.endDate,
                startDateOffset: this.getStartDateOffset(),
                endDateOffset: this.getEndDateOffset(),
                overlapShowIdentifier: this.overlapShowIdentifier,
                textFilters: this.textFilters,
                savedSearchesStore: this.savedSearchesStore,
                advancedSearchComponent: this
            }, 'Save Search');
        }
    },
    template: html`
        <div class="advanced-search-container">
            <div class="content search-form-section">
                <!-- Date Range Filters -->
                <div class="cards-grid two">
                    <!-- Date Range Card -->
                    <div 
                        :class="getDatePickerCardClasses('dateRange')"
                        @click="dateFilterMode = 'dateRange'"
                    >
                        <div class="content-header">
                            <h5>Filter By Date Range</h5>
                            <small v-if="dateFilterMode === 'dateRange'" style="display: block; color: var(--color-green);">
                                Active filter
                            </small>
                            <small v-else style="display: block; color: var(--color-text-light);">
                                Click to activate
                            </small>
                        </div>
                        <div class="content">
                            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span>Start Date:</span>
                                <div class="button-bar">
                                    <select 
                                        v-model="startDatePreset"
                                        @change="setStartDatePreset(startDatePreset)"
                                        @focus="dateFilterMode = 'dateRange'"
                                    >
                                        <option value="">Manual Entry</option>
                                        <option value="today">Today</option>
                                        <option value="monthAgo">A Month Ago</option>
                                        <option value="yearAgo">A Year Ago</option>
                                    </select>
                                    <input 
                                        type="date" 
                                        v-model="startDate" 
                                        placeholder="YYYY-MM-DD"
                                        @focus="dateFilterMode = 'dateRange'; startDatePreset = ''"
                                        :disabled="!!startDatePreset"
                                        style="flex: 1;"
                                    />
                                </div>
                            </label>
                            
                            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span>End Date:</span>
                                <div class="button-bar">
                                    <select 
                                        v-model="endDatePreset"
                                        @change="setEndDatePreset(endDatePreset)"
                                        @focus="dateFilterMode = 'dateRange'"
                                    >
                                        <option value="">Manual Entry</option>
                                        <option value="today">Today</option>
                                        <option value="inMonth">In a Month</option>
                                        <option value="inYear">In a Year</option>
                                    </select>
                                    <input 
                                        type="date" 
                                        v-model="endDate"
                                        placeholder="YYYY-MM-DD"
                                        @focus="dateFilterMode = 'dateRange'; endDatePreset = ''"
                                        :disabled="!!endDatePreset"
                                        style="flex: 1;"
                                    />
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Overlap Show Card -->
                    <div 
                        :class="getDatePickerCardClasses('overlap')"
                        @click="dateFilterMode = 'overlap'"
                    >
                        <div class="content-header">
                            <h5>Filter By Show Overlap</h5>
                            <small v-if="isLoadingShows" style="display: block; color: var(--color-text-light);">
                                Loading shows...
                            </small>
                            <small v-else-if="filteredShows.length === 0" style="display: block; color: var(--color-text-light);">
                                No shows available for selected year filter
                            </small>
                            <small v-else-if="dateFilterMode === 'overlap'" style="display: block; color: var(--color-green);">
                                Active filter - showing {{ filteredShows.length }} show(s)
                            </small>
                            <small v-else style="display: block; color: var(--color-text-light);">
                                Click to activate ({{ filteredShows.length }} show(s) available)
                            </small>
                        </div>
                        <LoadingBarComponent
                            key="date-range"
                            :is-loading="isLoadingShows"
                        />
                        <div class="content">
                            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span>Filter Shows by Year:</span>
                                <select 
                                    v-model="overlapShowYearFilter" 
                                    @focus="dateFilterMode = 'overlap'"
                                    @change="overlapShowIdentifier = ''"
                                >
                                    <option value="upcoming">Upcoming Shows</option>
                                    <option 
                                        v-for="year in availableYears" 
                                        :key="year" 
                                        :value="year"
                                    >
                                        {{ year }}
                                    </option>
                                </select>
                            </label>
                            
                            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span>Overlaps with Show:</span>
                                <select 
                                    v-model="overlapShowIdentifier" 
                                    :disabled="isLoadingShows || filteredShows.length === 0"
                                    @focus="dateFilterMode = 'overlap'"
                                >
                                    <option value="">
                                        {{ isLoadingShows ? 'Loading...' : (filteredShows.length === 0 ? 'No shows available' : 'Select a show...') }}
                                    </option>
                                    <option 
                                        v-for="show in filteredShows" 
                                        :key="show.identifier" 
                                        :value="show.identifier"
                                    >
                                        {{ show.display }}
                                    </option>
                                </select>
                            </label>
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
                        :class="'card' + (filter.value ? ' green' : ' white') + (isApplyingFilters ? ' analyzing' : '')"
                        style="display: flex; flex-wrap: wrap; gap: var(--padding-sm); align-items: center;"
                    >
                        <span>Column Filter:</span>
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
                    
                        <span>Search Text:</span>
                        <input 
                            type="text" 
                            v-model="filter.value" 
                            :placeholder="filter.column ? 'Search in ' + filter.column : 'Select a column first'"
                            :disabled="!filter.column"
                            style="flex: 1;"
                        />
                        
                        <button 
                            @click="removeTextFilter(filter.id)"
                            class="button-symbol red"
                            :disabled="textFilters.length === 1"
                            :title="textFilters.length === 1 ? 'At least one filter required' : 'Remove this filter'"
                        >
                            ✕
                        </button>
                    </div>
                    
                    <button 
                        v-if="textFilters.length > 0 && textFilters.every(filter => filter.column && filter.value)"
                        @click="addTextFilter" 
                        class="card white"
                        :disabled="isLoadingColumns"
                    >
                        Add Another Text Filter
                    </button>
                </slot>

                <!-- Action Buttons -->
                <div class="button-bar">
                    <button @click="applyFilters" class="green">View Search Results</button>
                    
                    <!-- Saved Search Dropdown -->
                    <select 
                        v-model="selectedSavedSearchIndex"
                        @change="handleSavedSearchSelection"
                        style="flex: auto;"
                    >
                        <option :value="null">New Search</option>
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
                    >
                        Save Search
                    </button>
                    <button 
                        v-else
                        @click="updateSavedSearch" 
                    >
                        Update Saved Search
                    </button>
                    <button 
                        v-if="selectedSavedSearchIndex !== null"
                        @click="deleteSavedSearch"
                    >
                        Delete Saved Search
                    </button>
                    
                    <button v-if="selectedSavedSearchIndex === null" @click="clearFilters" class="white">Clear All</button>
                </div>
            </div>

            <!-- Results Table -->
            <div class="search-results-section">
                <ScheduleTableComponent 
                    key="search-results"
                    v-if="activeFilter !== null || activeSearchParams !== null"
                    :filter="activeFilter"
                    :search-params="activeSearchParams"
                    :hideRowsOnSearch="false"
                >
                    <template #table-header-area>
                        <h3>Search Results:</h3>
                    </template>
                </ScheduleTableComponent>
                <div v-else class="content-header">
                    <p class="loading-message">Configure your search criteria above and click "View Search Results" to see results.</p>
                </div>
            </div>
        </div>
    `
};
