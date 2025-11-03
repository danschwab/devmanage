import { html, ScheduleTableComponent, hamburgerMenuRegistry, DashboardToggleComponent, NavigationRegistry, Requests } from '../../index.js';

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

// Advanced Search Component for Schedule (defined first so it can be registered)
const AdvancedSearchComponent = {
    components: {
        ScheduleTableComponent
    },
    props: {
        containerPath: String
    },
    data() {
        return {
            // Date range filters
            startDate: '',
            endDate: '',
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
            activeSearchParams: null
        };
    },
    computed: {
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
        await Promise.all([
            this.loadAvailableShows(),
            this.loadAvailableColumns()
        ]);
    },
    methods: {
        async loadAvailableShows() {
            this.isLoadingShows = true;
            try {
                // Get all shows from production schedule (no filters)
                const allShowsData = await Requests.getProductionScheduleData();
                
                // Create a unique list of show identifiers with display names and year
                this.allShows = allShowsData.map(show => ({
                    identifier: show.Identifier || `${show.Client} ${show.Year} ${show.Show}`,
                    display: `${show.Show} - ${show.Client} (${show.Year})`,
                    year: show.Year
                })).sort((a, b) => {
                    // Sort by year desc, then by display name
                    if (a.year !== b.year) {
                        return parseInt(b.year) - parseInt(a.year);
                    }
                    return a.display.localeCompare(b.display);
                });
                
            } catch (error) {
                console.error('Failed to load available shows:', error);
                this.allShows = [];
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
        setDateFilterMode(mode) {
            this.dateFilterMode = mode;
        },
        applyFilters() {
            // Build filter object for date range (parameters to getOverlappingShows)
            let filter = null;
            let searchParams = null;

            // Date range or overlap filtering based on active mode
            if (this.hasDateRangeFilter) {
                if (this.dateFilterMode === 'overlap' && this.overlapShowIdentifier) {
                    // Use identifier-based overlap detection
                    filter = { identifier: this.overlapShowIdentifier };
                } else if (this.dateFilterMode === 'dateRange' && (this.startDate || this.endDate)) {
                    // Use date range
                    filter = {};
                    if (this.startDate) filter.startDate = this.startDate;
                    if (this.endDate) filter.endDate = this.endDate;
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
        },
        clearFilters() {
            this.startDate = '';
            this.endDate = '';
            this.overlapShowIdentifier = '';
            this.overlapShowYearFilter = new Date().getFullYear().toString();
            this.dateFilterMode = 'dateRange';
            this.textFilters = [{ id: 1, column: '', value: '' }];
            this.nextFilterId = 2;
            this.activeFilter = null;
            this.activeSearchParams = null;
        },
        setPreset(preset) {
            this.clearFilters();
            const today = new Date();
            const currentYear = today.getFullYear();
            
            switch (preset) {
                case 'upcoming':
                    this.startDate = today.toISOString().slice(0, 10);
                    const future = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
                    this.endDate = future.toISOString().slice(0, 10);
                    break;
                case 'thisYear':
                    this.startDate = `${currentYear}-01-01`;
                    this.endDate = `${currentYear}-12-31`;
                    break;
                case 'nextYear':
                    this.startDate = `${currentYear + 1}-01-01`;
                    this.endDate = `${currentYear + 1}-12-31`;
                    break;
                case 'lastYear':
                    this.startDate = `${currentYear - 1}-01-01`;
                    this.endDate = `${currentYear - 1}-12-31`;
                    break;
                case 'thisMonth':
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    this.startDate = monthStart.toISOString().slice(0, 10);
                    this.endDate = monthEnd.toISOString().slice(0, 10);
                    break;
            }
            
            this.applyFilters();
        }
    },
    template: html`
        <div class="advanced-search-container">
            <div class="content search-form-section">
                <!-- Quick Presets -->
                <h4>Quick Presets</h4>
                <div class="button-bar">
                    <button @click="setPreset('upcoming')" class="">Upcoming Year</button>
                    <button @click="setPreset('thisYear')" class="">This Year</button>
                    <button @click="setPreset('nextYear')" class="">Next Year</button>
                    <button @click="setPreset('lastYear')" class="">Last Year</button>
                    <button @click="setPreset('thisMonth')" class="">This Month</button>
                </div>

                <!-- Date Range Filters -->
                <div class="cards-grid two">
                    <!-- Date Range Card -->
                    <div 
                        :class="['card', dateFilterMode === 'dateRange' ? 'green' : 'white clickable']"
                        @click="setDateFilterMode('dateRange')"
                    >
                        <div class="content-header">
                            <h5>Filter By Date Range</h5>
                            <small v-if="dateFilterMode === 'dateRange'" style="display: block; color: var(--color-green);">
                                ✓ Active filter
                            </small>
                            <small v-else style="display: block; color: var(--color-text-light);">
                                Click to activate
                            </small>
                        </div>
                        <div class="content">
                            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span style="font-weight: 500; font-size: 0.9rem;">Start Date:</span>
                                <input 
                                    type="date" 
                                    v-model="startDate" 
                                    placeholder="YYYY-MM-DD"
                                    @focus="setDateFilterMode('dateRange')"
                                    style="padding: 0.5rem;"
                                />
                            </label>
                            
                            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span style="font-weight: 500; font-size: 0.9rem;">End Date:</span>
                                <input 
                                    type="date" 
                                    v-model="endDate"
                                    placeholder="YYYY-MM-DD"
                                    @focus="setDateFilterMode('dateRange')"
                                    style="padding: 0.5rem;"
                                />
                            </label>
                        </div>
                    </div>
                    
                    <!-- Overlap Show Card -->
                    <div 
                        :class="['card', dateFilterMode === 'overlap' ? 'green' : 'white clickable']"
                        @click="setDateFilterMode('overlap')"
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
                                ✓ Active filter - showing {{ filteredShows.length }} show(s)
                            </small>
                            <small v-else style="display: block; color: var(--color-text-light);">
                                Click to activate ({{ filteredShows.length }} show(s) available)
                            </small>
                        </div>
                        <div class="content">
                            <label style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span style="font-weight: 500; font-size: 0.9rem;">Filter Shows by Year:</span>
                                <select 
                                    v-model="overlapShowYearFilter" 
                                    @focus="setDateFilterMode('overlap')"
                                    @change="overlapShowIdentifier = ''"
                                    style="padding: 0.5rem;"
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
                                <span style="font-weight: 500; font-size: 0.9rem;">Overlaps with Show:</span>
                                <select 
                                    v-model="overlapShowIdentifier" 
                                    :disabled="isLoadingShows || filteredShows.length === 0"
                                    @focus="setDateFilterMode('overlap')"
                                    style="padding: 0.5rem;"
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
                <div v-if="isLoadingColumns" style="padding: 1rem; text-align: center; color: #666;">
                    Loading columns...
                </div>
                
                <slot v-else>
                    <div 
                        v-for="filter in textFilters" 
                        :key="filter.id"
                        :class="'card' + (filter.value ? ' green' : ' white')"
                        style="display: flex; gap: var(--padding-sm); align-items: center;"
                    >
                        <span style="font-weight: 500; font-size: 0.9rem;">Column Filter:</span>
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
                    
                        <span style="font-weight: 500; font-size: 0.9rem;">Search Text:</span>
                        <input 
                            type="text" 
                            v-model="filter.value" 
                            :placeholder="filter.column ? 'Search in ' + filter.column : 'Select a column first'"
                            :disabled="!filter.column"
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
                    <button @click="applyFilters" class="green">Apply Filters</button>
                    <button @click="clearFilters" class="white">Clear All</button>
                </div>
            </div>

            <!-- Results Table -->
            <div class="search-results-section" style="margin-top: 1rem;">
                <ScheduleTableComponent 
                    v-if="activeFilter !== null || activeSearchParams !== null"
                    :filter="activeFilter"
                    :search-params="activeSearchParams"
                />
                <div v-else class="placeholder-message content" style="text-align: center; padding: 2rem;">
                    <p style="font-size: 1.1rem; color: var(--text-muted, #666);">Configure your search criteria above and click "Apply Filters" to see results.</p>
                </div>
            </div>
        </div>
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
            availableYearOptions: [],
            selectedYearOption: 'upcoming', // Default to "Upcoming"
            isLoadingYears: false,
            filter: null
        };
    },
    computed: {
        isAdvancedSearchView() {
            return this.containerPath === 'schedule/advanced-search';
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
        
        this.loadAvailableYears();
        this.handleYearSelection(); // Set initial filter
    },
    methods: {
        loadAvailableYears() {
            this.isLoadingYears = true;
            try {
                // Generate years from 2023 to current year, plus "Upcoming" option
                const currentYear = new Date().getFullYear();
                const startYear = 2023;
                const yearOptions = [];
                
                // Add "Upcoming" as first option
                yearOptions.push({ value: 'upcoming', label: 'Upcoming' });
                
                // Add years from current year down to start year
                for (let year = currentYear; year >= startYear; year--) {
                    yearOptions.push({ value: year.toString(), label: year.toString() });
                }
                
                this.availableYearOptions = yearOptions;
            } catch (error) {
                console.error('Failed to generate available years:', error);
            } finally {
                this.isLoadingYears = false;
            }
        },
        handleYearSelection() {
            if (this.selectedYearOption === 'upcoming') {
                // Create filter for upcoming shows (today to +10 years)
                const today = new Date();
                const startDate = today.toISOString().slice(0, 10);
                const future = new Date(today.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
                const endDate = future.toISOString().slice(0, 10);
                this.filter = { startDate, endDate };
            } else if (this.selectedYearOption) {
                // Create date range filter for the entire selected year
                const year = parseInt(this.selectedYearOption);
                const startDate = `${year}-01-01`;
                const endDate = `${year}-12-31`;
                this.filter = { startDate, endDate, year };
            } else {
                this.filter = null;
            }
        }
    },
    template: html`
        <slot>
            <!-- Main Schedule View (Year Selector) -->
            <div v-if="containerPath === 'schedule'" class="schedule-page">
                <ScheduleTableComponent 
                    :filter="filter" 
                    @navigate-to-path="(event) => navigateToPath(event.targetPath)"
                >
                    <template #table-header-area>
                        <div class="year-selector-bar">
                            <select 
                                id="year-select"
                                v-model="selectedYearOption" 
                                @change="handleYearSelection"
                                :disabled="isLoadingYears"
                                class="year-select"
                            >
                                <option 
                                    v-for="option in availableYearOptions" 
                                    :key="option.value" 
                                    :value="option.value"
                                >
                                    {{ option.label }}
                                </option>
                            </select>
                            <span v-if="isLoadingYears" class="status-text">
                                Loading years...
                            </span>
                        </div>
                    </template>
                </ScheduleTableComponent>
            </div>

            <!-- Advanced Search View -->
            <AdvancedSearchComponent 
                v-else-if="isAdvancedSearchView"
                :container-path="containerPath"
                @navigate-to-path="(event) => navigateToPath(event.targetPath)"
            />
        </slot>
    `
};
