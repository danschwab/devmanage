import { html, getReactiveStore, Requests, authState, NavigationRegistry, buildTextFilterParameters, parsedateFilterParameter, parseTextFilterParameters, LoadingBarComponent, builddateFilterParameter, createAnalysisConfig } from '../../index.js';

// Advanced Search Component for Schedule - Filter Creation UI Only
export const AdvancedSearchComponent = {
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
            
            // Flag to prevent watchers from clearing during programmatic updates
            isApplyingFilters: false,
            
            // Reactive store for saved searches
            savedSearchesStore: null,
            
            // Reactive store for production schedule data (for dropdowns)
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
        // Computed shows from store data
        allShows() {
            if (!this.scheduleData || this.scheduleData.length === 0) {
                return [];
            }
            
            // Extract shows with identifiers and display info from store
            const shows = this.scheduleData
                .filter(show => show.Identifier) // Only shows with computed identifiers
                .map(show => ({
                    identifier: show.Identifier,
                    display: `${show.Show} - ${show.Client} (${show.Year})`,
                    year: show.Year
                }))
                .sort((a, b) => {
                    // Sort by year desc, then by display name
                    if (a.year !== b.year) {
                        return parseInt(b.year) - parseInt(a.year);
                    }
                    return a.display.localeCompare(b.display);
                });
            
            return shows;
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
        // Loading states from store
        isLoadingShows() {
            return this.scheduleStore?.isLoading || this.scheduleStore?.isAnalyzing || false;
        },
        isLoadingColumns() {
            return this.scheduleStore?.isLoading || false;
        },
        availableYears() {
            const currentYear = new Date().getFullYear();
            const years = [];
            for (let y = currentYear + 2; y >= 2023; y--) {
                years.push(y);
            }
            return years;
        },
        isOnDashboard() {
            return this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
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
        // Initialize schedule store with analysis config
        await this.initializeScheduleStore();
        
        // Initialize saved searches store
        await this.initializeSavedSearchesStore();
        
        // Sync filters with URL parameters
        this.syncWithURL();
    },
    watch: {
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
            // Create analysis config to compute identifiers
            const analysisConfig = [
                createAnalysisConfig(
                    (show) => Requests.computeIdentifier(show.Show, show.Client, show.Year),
                    'Identifier',
                    'Computing show identifiers...',
                    null, // Pass full item
                    [],
                    'Identifier', // Store in Identifier column
                    true // passFullItem
                )
            ];
            
            // Initialize reactive store for production schedule
            this.scheduleStore = getReactiveStore(
                Requests.getProductionScheduleData,
                null, // No save function
                [], // No arguments - load all shows
                analysisConfig
            );
            
            // Load the data
            await this.scheduleStore.load('Loading production schedule...');
        },
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
            
            // Set flag to prevent watchers from clearing during URL load
            this.isApplyingFilters = true;
            
            const filter = {
                dateFilter: params.dateFilter || null,
                textFilters: params.textFilters || [],
                byShowDate: params.byShowDate || false,
                view: params.view || null
            };
            
            // Try to match URL to a saved search (just sets selectedSavedSearchIndex)
            this.matchUrlToSavedSearch(filter);
            
            // Load URL parameters into filter fields
            // Parse dateFilter to extract dates and offsets
            if (filter.dateFilter) {
                const dateFilter = parsedateFilterParameter(filter.dateFilter);
                
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
                    // Extract year from identifier format: "ClientMatch Year ShowMatch"
                    // Split by spaces and find the year (4-digit number)
                    const parts = dateFilter.overlapShowIdentifier.split(' ');
                    const yearMatch = parts.find(part => /^\d{4}$/.test(part));
                    
                    // Set year filter first so filteredShows will include the target show
                    if (yearMatch) {
                        this.overlapShowYearFilter = yearMatch;
                    }
                    
                    // Then set the show identifier
                    this.overlapShowIdentifier = dateFilter.overlapShowIdentifier;
                    this.dateFilterMode = 'overlap';
                } else if (dateFilter.startDate || dateFilter.endDate || dateFilter.startDateOffset !== undefined || dateFilter.endDateOffset !== undefined) {
                    this.dateFilterMode = 'dateRange';
                }
            }
            
            // Load text filters
            if (filter.textFilters && filter.textFilters.length > 0) {
                // Add IDs for Vue reactivity
                this.textFilters = filter.textFilters.map((filter, index) => ({
                    id: index + 1,
                    column: filter.column,
                    value: filter.value
                }));
                this.nextFilterId = filter.textFilters.length + 1;
            }
            
            // Reset flag after loading completes
            this.isApplyingFilters = false;
        },
        saveFiltersToURL() {
            // Build dateFilter value (without mode prefix)
            let dateFilterValue = null;
            
            const startOffset = this.getStartDateOffset();
            const endOffset = this.getEndDateOffset();
            
            if (this.dateFilterMode === 'overlap' && this.overlapShowIdentifier) {
                dateFilterValue = this.overlapShowIdentifier;
            } else if (startOffset !== null) {
                dateFilterValue = `${startOffset},${endOffset !== null ? endOffset : ''}`;
            } else if (this.startDate || this.endDate) {
                dateFilterValue = `${this.startDate || ''},${this.endDate || ''}`;
            }
            
            // Build parameters object directly
            const params = {};
            
            if (dateFilterValue) {
                params.dateFilter = dateFilterValue;
            }
            
            // Add text filters (strip id property)
            const validTextFilters = this.textFilters
                .filter(f => f.column && f.value)
                .map(f => ({ column: f.column, value: f.value }));
            
            if (validTextFilters.length > 0) {
                params.textFilters = validTextFilters;
            }
            
            // ScheduleAdvancedSearch always uses overlap mode
            params.byShowDate = false;
            
            // Use containerPath prop instead of hardcoded path
            const targetPath = this.containerPath || 'schedule/advanced-search';
            
            if (this.navigateToPath) {
                const path = NavigationRegistry.buildPath(targetPath, params);
                
                if (this.isOnDashboard) {
                    // Update dashboard registry with new path including params
                    NavigationRegistry.dashboardRegistry.updatePath(
                        targetPath.split('?')[0],
                        path
                    );
                } else {
                    this.navigateToPath(path);
                }
            }
            
            // Emit search-selected event with filter data for table display
            this.emitSearchSelected();
        },
        clearAllFilters() {
            this.isApplyingFilters = true;
            
            // Clear date filters
            this.startDate = '';
            this.endDate = '';
            this.startDatePreset = '';
            this.endDatePreset = '';
            this.overlapShowIdentifier = '';
            this.dateFilterMode = 'dateRange';
            
            // Clear text filters
            this.textFilters = [{ id: 1, column: '', value: '' }];
            this.nextFilterId = 2;
            
            this.isApplyingFilters = false;
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
        matchUrlToSavedSearch(urlSearchData) {
            const savedSearches = this.savedSearchesStore?.data || [];
            
            if (!savedSearches || savedSearches.length === 0) {
                return false;
            }
            
            const matchedSearchIndex = savedSearches.findIndex(search => {
                // Compare dateFilter (without mode prefix)
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
            
            // If URL matches a saved search, just select it (don't trigger handleSavedSearchSelection during URL sync)
            if (matchedSearchIndex >= 0) {
                this.selectedSavedSearchIndex = matchedSearchIndex;
                return true;
            }
            
            return false;
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
            if (search.dateFilter) {
                const dateFilter = parsedateFilterParameter(search.dateFilter);
                
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
            
            // Reset flag
            this.isApplyingFilters = false;
            
            // Note: Don't call saveFiltersToURL here - let user click Apply Filters to update URL
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
                    dateFilter: null,
                    textFilters: [],
                    byShowDate: false
                };
                
                // Build dateFilter value (without mode prefix)
                const startOffset = this.getStartDateOffset();
                const endOffset = this.getEndDateOffset();
                
                if (this.dateFilterMode === 'overlap' && this.overlapShowIdentifier) {
                    searchData.dateFilter = this.overlapShowIdentifier;
                } else if (startOffset !== null) {
                    searchData.dateFilter = `${startOffset},${endOffset !== null ? endOffset : ''}`;
                } else if (this.startDate || this.endDate) {
                    searchData.dateFilter = `${this.startDate || ''},${this.endDate || ''}`;
                }
                
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
            
            // Check if user is authenticated
            if (!authState.isAuthenticated || !authState.user?.email) {
                this.$modal.alert('You must be logged in to delete filters.', 'Error');
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
                            this.$modal.alert('Please enter a name.', 'Warning');
                            return;
                        }
                        
                        // Check if user is authenticated
                        if (!authState.isAuthenticated || !authState.user?.email) {
                            this.$modal.alert('You must be logged in to save filters.', 'Error');
                            return;
                        }
                        
                        try {
                            this.isSaving = true;
                            
                            // Get current search parameters
                            const searchData = {
                                name: this.searchName.trim(),
                                dateFilter: null,
                                textFilters: [],
                                byShowDate: false
                            };
                            
                            // Build dateFilter value (without mode prefix)
                            if (this.overlapShowIdentifier) {
                                searchData.dateFilter = this.overlapShowIdentifier;
                            } else if (this.startDateOffset !== null) {
                                searchData.dateFilter = `${this.startDateOffset},${this.endDateOffset !== null ? this.endDateOffset : ''}`;
                            } else if (this.startDate || this.endDate) {
                                searchData.dateFilter = `${this.startDate || ''},${this.endDate || ''}`;
                            }
                            
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
                                
                                this.$modal.alert('Filter saved successfully!', 'Success');
                                this.$emit('close-modal');
                            } else {
                                throw new Error('Saved filterss store not initialized');
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
                startDate: this.startDate,
                endDate: this.endDate,
                startDateOffset: this.getStartDateOffset(),
                endDateOffset: this.getEndDateOffset(),
                overlapShowIdentifier: this.overlapShowIdentifier,
                textFilters: this.textFilters,
                savedSearchesStore: this.savedSearchesStore,
                advancedSearchComponent: this
            }, 'Save Filter');
        },
        emitSearchSelected() {
            // Build dateFilter value (without mode prefix)
            let dateFilterValue = null;
            
            const startOffset = this.getStartDateOffset();
            const endOffset = this.getEndDateOffset();
            
            if (this.dateFilterMode === 'overlap' && this.overlapShowIdentifier) {
                dateFilterValue = this.overlapShowIdentifier;
            } else if (startOffset !== null) {
                dateFilterValue = `${startOffset},${endOffset !== null ? endOffset : ''}`;
            } else if (this.startDate || this.endDate) {
                dateFilterValue = `${this.startDate || ''},${this.endDate || ''}`;
            }
            
            // Build search data in the same format as SavedSearchSelect
            const searchData = {
                dateFilter: dateFilterValue,
                textFilters: this.textFilters
                    .filter(filter => filter.column && filter.value)
                    .map(filter => ({
                        column: filter.column,
                        value: filter.value
                    })),
                byShowDate: false
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
                            <!--small v-else style="display: block; color: var(--color-text-light);">
                                Click to activate
                            </small-->
                        </div>
                        <div :class="dateFilterMode === 'dateRange' ? 'content' : 'content hide-when-narrow'">
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
                            <small v-else-if="dateFilterMode === 'overlap'" style="display: block; color: var(--color-green);">
                                Active filter
                            </small>
                            <!--small v-else style="display: block; color: var(--color-text-light);">
                                Click to activate 
                            </small-->
                        </div>
                        <LoadingBarComponent
                            key="date-range"
                            :is-loading="isLoadingShows"
                        />
                        <div :class="dateFilterMode === 'overlap' ? 'content' : 'content hide-when-narrow'">
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
                                <span>Overlaps with Show: ({{ filteredShows.length }} available)</span>
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
                    
                        <span :class="{ 'hide-when-narrow': !filter.column }">Search Text:</span>
                        <input 
                            type="text" 
                            v-model="filter.value" 
                            :placeholder="filter.column ? 'Search in ' + filter.column : 'Select a column first'"
                            :disabled="!filter.column"
                            :class="{ 'hide-when-narrow': !filter.column }"
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
                    <!-- Saved Search Dropdown -->
                    <select 
                        v-model="selectedSavedSearchIndex"
                        @change="handleSavedSearchSelection"
                        style="flex: auto;"
                    >
                        <option :value="null">{{ selectedSavedSearchIndex === null ? 'New Filter' : 'Unsaved Filter' }}</option>
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
                        Save This Filter
                    </button>
                    <button 
                        v-else
                        @click="updateSavedSearch" 
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
                    <button @click="saveFiltersToURL" class="green">Apply Filters</button>
                    <button @click="clearAllFilters" class="white">Clear Filters</button>
                </div>
            </div>
        </div>
    `
};

/**
 * Reusable component for saved search selection with optional year options
 * Handles saved searches, URL parameters, and emits search data to parent
 */
export const SavedSearchSelect = {
    inject: ['appContext', '$modal'],
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
        },
        
        openAdvancedSearchModal() {
            // Open the advanced search component in a modal
            this.$modal.custom(AdvancedSearchComponent, {
                containerPath: this.containerPath,
                navigateToPath: this.navigateToPath,
                onSearchSelected: (searchData) => {
                    this.$emit('search-selected', searchData);
                }
            }, 'Advanced Schedule Filtering', { size: 'large' });
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
        <button 
            v-if="showAdvancedButton" 
            class="button-symbol"
            @click="openAdvancedSearchModal"
        >
            ☰
        </button>
    `
};
