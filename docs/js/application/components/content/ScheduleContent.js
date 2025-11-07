import { html, ScheduleTableComponent, hamburgerMenuRegistry, DashboardToggleComponent, NavigationRegistry, Requests, parseDateSearchParameter, parseSearchParameters, getReactiveStore, authState } from '../../index.js';
import { AdvancedSearchComponent } from './ScheduleAdvancedSearch.js';

// Schedule Hamburger Menu Component
export const ScheduleMenuComponent = {
    props: {
        containerPath: String,
        containerType: String,
        currentView: String,
        title: String,
        navigateToPath: Function
    },
    inject: ['$modal'],
    computed: {
        menuItems() {
            const items = [];
            
            // Only show Advanced Search if not already on advanced search page
            if (this.containerPath !== 'schedule/advanced-search') {
                items.push({ label: 'Advanced Search', action: 'advancedSearch' });
            }
            
            items.push(
                { label: 'Calendar View', action: 'showCalendarView', disabled: true },
                { label: 'Chart View', action: 'showChartView', disabled: true },
                { label: 'Set Current As Default', action: 'setAsDefault', disabled: true }
            );
            
            return items;
        }
    },
    methods: {
        handleAction(action) {
            // Close the menu before action
            this.$emit('close-modal');

            switch (action) {
                case 'advancedSearch':
                    if (this.navigateToPath) {
                        this.navigateToPath('schedule/advanced-search');
                    }
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
                    @click="handleAction(item.action)"
                    :disabled="item.disabled"
                    >
                    {{ item.label }}
                </button>
            </li>
        </ul>
    `
};

export const ScheduleContent = {
    components: {
        ScheduleTableComponent,
        AdvancedSearchComponent
    },
    props: {
        navigateToPath: Function,
        containerPath: {
            type: String,
            default: 'schedule'
        }
    },
    data() {
        return {
            availableOptions: [],
            selectedOption: new Date().getFullYear().toString(), // Default to current year
            isLoadingOptions: false,
            filter: null,
            isUsingUrlParams: false,
            savedSearchesStore: null // Will be initialized in mounted
        };
    },
    computed: {
        isAdvancedSearchView() {
            return this.containerPath === 'schedule/advanced-search';
        },
        // Split filter into dateFilter and searchParams for table
        dateFilter() {
            if (!this.filter) return null;
            const { searchParams, ...dateFilter } = this.filter;
            return Object.keys(dateFilter).length > 0 ? dateFilter : null;
        },
        tableSearchParams() {
            return this.filter?.searchParams || null;
        },
        // Computed display value for the dropdown
        dropdownDisplayValue() {
            if (this.isUsingUrlParams) {
                return 'url-params';
            }
            return this.selectedOption;
        },
        // Computed property to get saved searches from store
        savedSearches() {
            return this.savedSearchesStore?.data || [];
        },
        // Computed property to check authentication status
        isUserAuthenticated() {
            return authState.isAuthenticated;
        }
    },
    watch: {
        // Watch for authentication changes
        isUserAuthenticated(newVal) {
            if (newVal && !this.savedSearchesStore) {
                // User just logged in, initialize the store
                this.initializeSavedSearchesStore();
                this.loadAvailableOptions();
            }
        }
    },
    mounted() {
        // Register schedule navigation routes
        NavigationRegistry.registerNavigation('schedule', {
            routes: {
                'advanced-search': {
                    displayName: 'Advanced Search',
                    dashboardTitle: 'Schedule Advanced Search',
                    icon: 'search'
                }
            }
        });

        // Register hamburger menu for schedule
        hamburgerMenuRegistry.registerMenu('schedule', {
            components: [ScheduleMenuComponent, DashboardToggleComponent],
            props: {
                navigateToPath: this.navigateToPath
            }
        });
        
        // Initialize saved searches store
        this.initializeSavedSearchesStore();
        
        this.loadAvailableOptions();
        
        // Check for URL parameters and apply complex search if present
        if (!this.loadComplexSearchFromURL()) {
            // No complex search params, use default year selection
            this.handleSelection();
        }
    },
    methods: {
        async initializeSavedSearchesStore() {
            // Only initialize store if user is authenticated
            if (!authState.isAuthenticated || !authState.user?.email) {
                console.log('[ScheduleContent] User not authenticated, skipping saved searches initialization');
                return;
            }
            
            // Initialize reactive store using the same pattern as DashboardRegistry
            // This will automatically initialize with default searches if they don't exist
            this.savedSearchesStore = getReactiveStore(
                Requests.getUserData,
                Requests.storeUserData,
                [authState.user.email, 'saved_searches'],
                null, // No analysis config
                true // Auto-load
            );
            
            // Ensure default searches exist after store loads
            if (this.savedSearchesStore.isLoading) {
                // Wait for initial load to complete
                await new Promise(resolve => {
                    const checkLoading = setInterval(() => {
                        if (!this.savedSearchesStore.isLoading) {
                            clearInterval(checkLoading);
                            resolve();
                        }
                    }, 50);
                });
            }
            
            // Initialize defaults if no searches exist
            if (!this.savedSearchesStore.data || this.savedSearchesStore.data.length === 0) {
                const defaultSearches = [
                    {
                        name: 'Upcoming',
                        dateSearch: '0,30', // Today to 30 days in the future
                        textFilters: []
                    }
                ];
                this.savedSearchesStore.data = defaultSearches;
                await this.savedSearchesStore.save();
            }
        },
        async loadAvailableOptions() {
            this.isLoadingOptions = true;
            try {
                const options = [];
                
                // Add years from current year down to 2023
                const currentYear = new Date().getFullYear();
                const startYear = 2023;
                for (let year = currentYear; year >= startYear; year--) {
                    options.push({ value: year.toString(), label: year.toString(), type: 'year' });
                }
                
                // Add separator for saved searches
                const savedSearches = await this.loadSavedSearches();
                if (savedSearches.length > 0) {
                    //options.push({ value: 'separator-1', label: '──────────', type: 'separator', disabled: true });
                    
                    // Add saved searches
                    savedSearches.forEach((search, index) => {
                        options.push({ 
                            value: `search-${index}`, 
                            label: search.name, 
                            type: 'search',
                            searchData: search
                        });
                    });
                }
                
                // Add URL params option if there are URL parameters
                //options.push({ value: 'separator-2', label: '──────────', type: 'separator', disabled: true });
                options.push({ value: 'url-params', label: 'URL Params', type: 'urlparams', disabled: true });
                
                this.availableOptions = options;
            } catch (error) {
                console.error('Failed to load available options:', error);
            } finally {
                this.isLoadingOptions = false;
            }
        },
        async loadSavedSearches() {
            try {
                if (!authState.isAuthenticated || !authState.user?.email) {
                    return [];
                }
                
                // Use the reactive store if initialized
                if (this.savedSearchesStore) {
                    // Wait for store to load if it's currently loading
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
                    return this.savedSearchesStore.data || [];
                }
                
                // Fallback: return empty array if store not initialized
                return [];
            } catch (error) {
                console.error('Failed to load saved searches:', error);
                return [];
            }
        },
        handleSelection() {
            // Clear URL params flag when user manually selects
            this.isUsingUrlParams = false;
            
            const selectedValue = this.selectedOption;
            
            // Find the selected option
            const option = this.availableOptions.find(opt => opt.value === selectedValue);
            
            if (!option || option.type === 'separator' || option.type === 'urlparams') {
                return;
            }
            
            if (option.type === 'year') {
                // Handle year selection - create date range filter for the entire selected year
                const year = parseInt(selectedValue);
                const startDate = `${year}-01-01`;
                const endDate = `${year}-12-31`;
                this.filter = { startDate, endDate, year };
            } else if (option.type === 'search') {
                // Handle saved search selection
                this.applySavedSearch(option.searchData);
            }
        },
        applySavedSearch(searchData) {
            const filter = {
                searchParams: {}
            };
            
            // Parse DateSearch from saved search
            if (searchData.dateSearch) {
                const dateFilter = parseDateSearchParameter(searchData.dateSearch);
                
                // Check if this is an overlap search (has overlapShowIdentifier)
                if (dateFilter.overlapShowIdentifier) {
                    // Convert overlapShowIdentifier to identifier for API
                    filter.identifier = dateFilter.overlapShowIdentifier;
                } else {
                    // Regular date filter
                    Object.assign(filter, dateFilter);
                }
            }
            
            // Apply text filters
            if (searchData.textFilters && searchData.textFilters.length > 0) {
                searchData.textFilters.forEach(textFilter => {
                    if (textFilter.column && textFilter.value) {
                        filter.searchParams[textFilter.column] = textFilter.value;
                    }
                });
            }
            
            this.filter = filter;
        },
        loadComplexSearchFromURL() {
            // Check if we're on the main schedule page (not advanced-search)
            if (this.containerPath !== 'schedule') return false;
            
            // Get URL parameters for schedule route
            const params = NavigationRegistry.getNavigationParameters('schedule');
            
            if (Object.keys(params).length === 0) return false;
            
            // Check if there are complex search parameters (DateSearch or text filters)
            const hasDateSearch = !!params.DateSearch;
            const hasTextFilters = Object.keys(params).some(key => key.startsWith('Col') || key.startsWith('Val'));
            
            if (!hasDateSearch && !hasTextFilters) return false;
            
            // Use utility to parse all search parameters
            const { dateFilter, searchParams } = parseSearchParameters(params);
            
            // Build combined filter object
            const filter = {
                ...dateFilter,
                searchParams
            };
            
            // Apply the filter
            this.filter = filter;
            
            // Set flag to show "URL Params" in dropdown
            this.isUsingUrlParams = true;
            
            return true; // Indicate that complex search was loaded
        }
    },
    template: html`
        <slot>
            <!-- Main Schedule View (Year Selector) -->
            <div v-if="containerPath === 'schedule'" class="schedule-page">
                <ScheduleTableComponent 
                    :filter="dateFilter"
                    :search-params="tableSearchParams"
                    @navigate-to-path="(event) => navigateToPath(event.targetPath)"
                >
                    <template #table-header-area>
                        <div class="button-bar">
                            <select 
                                id="schedule-filter-select"
                                :value="dropdownDisplayValue"
                                @change="(e) => { selectedOption = e.target.value; handleSelection(); }"
                                :disabled="isLoadingOptions"
                                class="year-select"
                            >
                                <option 
                                    v-for="option in availableOptions" 
                                    :key="option.value" 
                                    :value="option.value"
                                    :disabled="option.disabled"
                                >
                                    {{ isLoadingOptions ? 'Loading...' : option.label }}
                                </option>
                            </select>
                            <button @click="navigateToPath('schedule/advanced-search')">
                                Advanced
                            </button>
                        </div>
                    </template>
                </ScheduleTableComponent>
            </div>

            <!-- Advanced Search View -->
            <AdvancedSearchComponent 
                v-else-if="isAdvancedSearchView"
                :container-path="containerPath"
                :navigate-to-path="navigateToPath"
                @navigate-to-path="(event) => navigateToPath(event.targetPath)"
            />
        </slot>
    `
};
