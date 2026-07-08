import { html, LoadingBarComponent, ViewChangeComponent, NavigationRegistry, parseDate } from '../../index.js';
import { useSearch } from '../../utils/useSearch.js';
import { useStickyHeader } from '../../utils/useStickyHeader.js';

function normalizeItemSortWords(value) {
    return String(value)
        .toLowerCase()
        .split(/[\s\-_,./\\:;|]+/)
        .filter(Boolean);
}

function compareItemLikeValues(aValue, bValue) {
    const aWords = normalizeItemSortWords(aValue);
    const bWords = normalizeItemSortWords(bValue);
    const maxWords = Math.max(aWords.length, bWords.length);

    for (let i = 0; i < maxWords; i++) {
        const aWord = aWords[i];
        const bWord = bWords[i];

        if (aWord === undefined) return -1;
        if (bWord === undefined) return 1;

        const wordComparison = aWord.localeCompare(bWord, undefined, { numeric: true, sensitivity: 'base' });
        if (wordComparison !== 0) {
            return wordComparison;
        }
    }

    return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' });
}

// Cards Grid Component: Simple responsive grid layout with clickable cards
export const CardsComponent = {
    components: { LoadingBarComponent, ViewChangeComponent },
    inject: ['appContext'],
    props: {
        theme: {
            type: String,
            default: 'gray'
        },
        items: {
            type: Array,
            required: true,
            // Expected format: [{ id, title, content?, contentFooter?, onClick?, cardClass? }]
            // content and contentFooter support HTML (rendered with v-html)
            // cardClass options: 'gray' (default), 'blue', 'green', 'yellow', 'red'
        },
        onItemClick: {
            type: Function,
            required: true
        },
        isLoading: {
            type: Boolean,
            default: false
        },
        isAnalyzing: {
            type: Boolean,
            default: false
        },
        loadingProgress: {
            type: Number,
            default: -1
        },
        loadingMessage: {
            type: String,
            default: 'Loading...'
        },
        emptyMessage: {
            type: String,
            default: 'No items available'
        },
        showHeader: {
            type: Boolean,
            default: false
        },
        showRefresh: {
            type: Boolean,
            default: false
        },
        showSearch: {
            type: Boolean,
            default: false
        },
        syncSearchWithUrl: {
            type: Boolean,
            default: false
        },
        containerPath: {
            type: String,
            default: ''
        },
        navigateToPath: {
            type: Function,
            default: null
        },
        viewModes: {
            type: Array,
            default: null
        },
        hideCardsOnSearch: {
            type: Boolean,
            default: true
        },
        showPinButtons: {
            type: Boolean,
            default: false
        },
        pinnedItems: {
            type: Set,
            default: () => new Set()
        },
        showPinnedOnly: {
            type: Boolean,
            default: false
        },
        showSort: {
            type: Boolean,
            default: false
        },
        sortColumns: {
            type: Array,
            default: () => []
        },
        defaultSortColumn: {
            type: [String, Array],
            default: null
        },
        defaultSortDirection: {
            type: String,
            default: 'asc',
            validator: (value) => ['asc', 'desc'].includes(String(value || '').toLowerCase())
        }
    },
    setup(props, { emit }) {
        // Initialize search composable
        const search = useSearch({
            formatValue: null,
            syncWithUrl: props.syncSearchWithUrl,
            navigationRegistry: NavigationRegistry,
            containerPath: props.containerPath,
            appContext: Vue.inject('appContext')
        });

        // Return search properties and methods to be available in component
        return {
            search
        };
    },
    data() {
        return {
            stickyActive: false,
            stickyTop: 0,
            stickyLeft: 0,
            stickyWidth: 0,
            stickySpacerHeight: 0,
            selectedSortKey: null,
            selectedSortDirection: 'asc',
            isUsingDefaultSort: true,
        };
    },
    watch: {
        sortColumns: {
            handler() {
                const selectedColumnStillExists = this.sortableColumns.some(col => col.key === this.selectedSortKey);
                if (!selectedColumnStillExists) {
                    this.applyDefaultSortColumn({ force: true });
                }
            },
            deep: true
        },
        defaultSortColumn() {
            this.applyDefaultSortColumn({ force: true });
        },
        defaultSortDirection() {
            if (this.isUsingDefaultSort) {
                this.selectedSortDirection = this.getNormalizedDefaultSortDirection();
            }
        }
    },
    computed: {
        sortableColumns() {
            return (this.sortColumns || [])
                .filter(col => col && typeof col.key === 'string' && col.key.trim())
                .filter(col => col.sortable !== false)
                .map(col => ({
                    key: col.key.trim(),
                    label: col.label || col.key,
                    type: col.type || null,
                    sortable: true
                }));
        },
        shouldShowEmpty() {
            return !this.isLoading && !this.isAnalyzing && this.items && this.items.length === 0;
        },
        shouldShowCards() {
            // Show cards if we have items, even during analysis
            return this.items && this.items.length > 0;
        },
        visibleCards() {
            // Filter rows based on search value but keep all rows including marked for deletion
            if (!Array.isArray(this.items)) return [];

            let filteredData = this.items
                .filter(row => row); // Only filter out null/undefined rows

            // Apply search filter if searchValue is provided and hideCardsOnSearch is enabled
            if (this.search.hasActiveSearch.value && this.hideCardsOnSearch) {
                const searchWords = this.search.searchWords.value;
                
                filteredData = filteredData.filter(row => {
                    if (!row) return false;
                    // Search in title, content, and contentFooter fields
                    const fields = [
                        row.title,
                        row.content,
                        row.contentFooter
                    ];
                    
                    // All search words must match somewhere in the fields (AND logic)
                    return searchWords.every(word =>
                        fields.some(field =>
                            // Skip null/undefined to prevent matching "undefined" or "null" strings
                            field != null && String(field).toLowerCase().includes(word.toLowerCase())
                        )
                    );
                });
            }

            const sortCriteria = this.isUsingDefaultSort
                ? this.getDefaultSortCriteria()
                : this.getCurrentSortCriteria();

            if (sortCriteria.length > 0) {
                const sortedData = [...filteredData].sort((a, b) => {
                    for (const criterion of sortCriteria) {
                        const comparison = this.compareCardsByColumn(a, b, criterion.column, criterion.direction);
                        if (comparison !== 0) return comparison;
                    }
                    return 0;
                });
                filteredData = sortedData;
            }

            return filteredData;
        }
    },
    watch: {
        // Trigger sticky header recalculation when the current route/content changes
        // This ensures sticky headers reposition correctly after navigation
        'appContext.currentPath'(newPath, oldPath) {
            if (newPath !== oldPath && this._stickyHeader) {
                // Reset peak height cache and trigger immediate update
                this._stickyHeader.reset();
                this.$nextTick(() => {
                    this._stickyHeader.update();
                });
            }
        }
    },
    mounted() {
        // Initialize search from URL and setup watcher if syncSearchWithUrl is enabled
        this.search.initializeFromUrl();
        this.search.setupUrlWatcher();
        this.applyDefaultSortColumn();

        this._stickyHeader = useStickyHeader({
            getStickyEl: () => this.$refs.stickyWrapperEl,
            getAnchorEl: () => this.$refs.stickySpacerEl,
            getContainerEl: () => [
                this.$refs.cardsGridEl,
                this.$refs.stickySpacerEl?.closest('.container'),
            ].filter(Boolean),
            getIsActive: () => this.stickyActive,
            onActivate: (navBottom) => {
                const wrapper = this.$refs.stickyWrapperEl;
                if (!this.stickyActive) {
                    this.stickySpacerHeight = wrapper ? wrapper.offsetHeight : 0;
                }
                const rect = wrapper ? wrapper.getBoundingClientRect() : null;
                this.stickyActive = true;
                this.stickyTop = navBottom;
                this.stickyLeft = rect ? rect.left : 0;
                this.stickyWidth = rect ? rect.width : 0;
            },
            onDeactivate: () => {
                this.stickyActive = false;
            },
        });
        this._stickyHeader.setup();
    },
    beforeUnmount() {
        this._stickyHeader?.teardown();
    },
    methods: {
        
        handleCardClick(item) {
            // Call item-specific onClick handler if provided, otherwise use component-level handler
            if (item.onClick && typeof item.onClick === 'function') {
                item.onClick(item);
            } else {
                this.onItemClick(item.title || item.id);
            }
        },
        handleKeyDown(event, item) {
            // Handle keyboard navigation for accessibility
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.handleCardClick(item);
            }
        },
        handleRefresh() {
            //console.log('CardsComponent: Refresh requested');
            this.$emit('refresh');
        },
        getNormalizedDefaultSortDirection() {
            return String(this.defaultSortDirection || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
        },
        normalizeDefaultSortColumnConfig() {
            const config = this.defaultSortColumn;
            if (Array.isArray(config)) return config;
            if (typeof config === 'string' && config.trim()) return [config.trim()];
            return [];
        },
        getDefaultSortCriteria() {
            const fallbackDirection = this.getNormalizedDefaultSortDirection();
            return this.normalizeDefaultSortColumnConfig()
                .map((entry) => {
                    if (typeof entry === 'string') {
                        return { key: entry.trim(), direction: fallbackDirection };
                    }

                    if (entry && typeof entry === 'object') {
                        const key = typeof entry.key === 'string' ? entry.key.trim() : '';
                        const direction = String(entry.direction || fallbackDirection).toLowerCase() === 'desc' ? 'desc' : 'asc';
                        return { key, direction };
                    }

                    return null;
                })
                .filter(item => item && item.key)
                .map(item => {
                    const column = this.sortableColumns.find(col => col.key === item.key);
                    return column ? { column, direction: item.direction } : null;
                })
                .filter(Boolean);
        },
        getCurrentSortCriteria() {
            if (!this.selectedSortKey) return [];
            const column = this.sortableColumns.find(col => col.key === this.selectedSortKey);
            if (!column) return [];
            return [{ column, direction: this.selectedSortDirection }];
        },
        applyDefaultSortColumn(options = {}) {
            const { force = false } = options;
            const defaultSortCriteria = this.getDefaultSortCriteria();
            if (defaultSortCriteria.length === 0) return;

            const currentSortColumn = this.sortableColumns.find(col => col.key === this.selectedSortKey);
            const hasValidCurrentSort = !!(this.selectedSortKey && currentSortColumn);

            if (!force && hasValidCurrentSort) return;

            this.selectedSortKey = defaultSortCriteria[0].column.key;
            this.selectedSortDirection = defaultSortCriteria[0].direction;
            this.isUsingDefaultSort = true;
        },
        compareCardsByColumn(aCard, bCard, column, direction) {
            const aValue = aCard?.[column.key];
            const bValue = bCard?.[column.key];

            const aMissing = aValue === null || aValue === undefined || aValue === '';
            const bMissing = bValue === null || bValue === undefined || bValue === '';
            if (aMissing && bMissing) return 0;
            if (aMissing) return 1;
            if (bMissing) return -1;

            const columnType = String(column.type || '').toLowerCase();
            if (columnType === 'item') {
                const comparison = compareItemLikeValues(aValue, bValue);
                return direction === 'desc' ? -comparison : comparison;
            }

            const aDate = parseDate(aValue);
            const bDate = parseDate(bValue);
            if ((columnType === 'date' || columnType === '') && aDate && bDate) {
                const comparison = aDate.getTime() - bDate.getTime();
                return direction === 'desc' ? -comparison : comparison;
            }

            const aNum = parseFloat(aValue);
            const bNum = parseFloat(bValue);
            const isANum = !isNaN(aNum);
            const isBNum = !isNaN(bNum);

            let comparison = 0;
            if (columnType === 'number' && isANum && isBNum) {
                comparison = aNum - bNum;
            } else if (isANum && isBNum && columnType !== 'string') {
                comparison = aNum - bNum;
            } else {
                comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' });
            }

            return direction === 'desc' ? -comparison : comparison;
        },
        handleSortSelectionChange() {
            if (!this.selectedSortKey) {
                this.applyDefaultSortColumn({ force: true });
                return;
            }
            this.selectedSortDirection = 'asc';
            this.isUsingDefaultSort = false;
        },
        isCardAnalyzing(cardIndex) {
            // Check if this card is currently being analyzed
            const card = this.visibleCards[cardIndex];
            return card && card.AppData && card.AppData._analyzing === true;
        },
        handlePinClick(event, item) {
            // Prevent card click event from firing
            event.stopPropagation();
            this.$emit('toggle-pin', item.title || item.id);
        },
        isPinned(item) {
            return this.pinnedItems.has(item.title || item.id);
        }
    },
    template: html`
        <slot>
            <div style="width: 100%;">
            <template v-if="showHeader">
            <div ref="stickySpacerEl" class="sticky-header-spacer" :style="{ height: stickyActive ? stickySpacerHeight + 'px' : '0' }"></div>
            <div ref="stickyWrapperEl" class="sticky-header-wrapper" :style="stickyActive ? { position: 'fixed', top: stickyTop + 'px', left: stickyLeft + 'px', width: stickyWidth + 'px', zIndex: '1000' } : { paddingBottom: 'var(--padding-md)' }">
            <div key="content-header" :class="['content-header', theme]">
                <slot 
                    name="header-area" 
                ></slot>
                <div class="spacer"></div>
                <div v-if="showRefresh || showSearch || showSort || (viewModes && containerPath && navigateToPath)" class="button-bar">
                    <div v-if="showSearch" class="input-container">
                        <input
                            type="text"
                            v-model="search.searchValue.value"
                            @blur="search.handleBlur"
                            @keydown.esc="search.clearSearch"
                            placeholder="Find..."
                            class="search-input"
                        />
                        <button
                            v-if="search.searchValue.value"
                            @mousedown="search.clearSearch"
                            class="column-button"
                            title="Clear search"
                        >
                            🗙
                        </button>
                    </div>
                    <select v-if="showSort && sortableColumns.length > 0" v-model="selectedSortKey" @change="handleSortSelectionChange" class="search-input" title="Sort cards">
                        <option v-if="!selectedSortKey" value="">Default sort</option>
                        <option v-for="col in sortableColumns" :key="col.key" :value="col.key">Sort by: {{ col.label }}</option>
                    </select>
                    <button 
                        v-if="showRefresh" 
                        @click="handleRefresh" 
                        :disabled="isLoading" 
                        class="refresh-button"
                    >
                        {{ isLoading ? 'Loading...' : 'Refresh' }}
                    </button>
                    <ViewChangeComponent
                        v-if="viewModes && containerPath && navigateToPath"
                        :container-path="containerPath"
                        :navigate-to-path="navigateToPath"
                        :view-modes="viewModes"
                    />
                </div>
                <!-- Loading/Analysis Progress Indicator -->
                <LoadingBarComponent
                    :is-loading="isLoading"
                    :is-analyzing="isAnalyzing"
                    :percent-complete="loadingProgress"
                    class="embedded"
                />
            </div>
            </div>
            </template>

            <!-- Cards Grid (shows during analysis with progressive updates) -->
            <div ref="cardsGridEl" v-if="shouldShowCards" class="cards-grid">
                <div
                    v-for="(item, idx) in visibleCards"
                    :key="(item.id || item.sheetId || item.title) + '_' + idx"
                    :class="['card', 'clickable', { 'analyzing': isCardAnalyzing(idx) }, item.cardClass || theme]"
                    @click="handleCardClick(item)"
                    @keydown="handleKeyDown($event, item)"
                    :title="item.title"
                    :aria-label="item.title + (item.content ? ': ' + item.content : '')"
                >
                    <div class="content-header">
                        <h3 v-html="search.highlightRawText(item.title)"></h3>
                        <slot v-if="showPinButtons">
                            <button
                                @click="handlePinClick($event, item)"
                                :class="['column-button', { 'active': isPinned(item) }]"
                                :title="isPinned(item) ? 'Unpin' : 'Pin'"
                            >
                                <span class="material-symbols-outlined" :title="isPinned(item) ? 'Unpin' : 'Pin'">{{ isPinned(item) ? 'keep' : 'keep_off' }}</span>
                            </button>
                        </slot>
                    </div>
                    <div class="content" v-if="item.content">
                        <div v-html="search.highlightHtmlContent(item.content)"></div>
                    </div>
                    <div class="content-footer" v-if="item.contentFooter">
                        <div v-html="search.highlightHtmlContent(item.contentFooter)"></div>
                    </div>
                </div>
                
                <button
                    v-if="search.hasActiveSearch.value"
                    @click="search.clearSearch"
                    style="align-self: flex-start;"
                    title="Clear filter"
                >
                    🗙 Clear filter
                </button>
            </div>

            
            <!-- Initial Loading State (no items yet) -->
            <div v-if="isLoading || isAnalyzing" class="loading-message">
                <img v-if="!showHeader && !shouldShowCards" src="assets/loading.gif" alt="Loading..."/>
                <p>{{ loadingMessage || 'Loading...' }}</p>
            </div>
            <p v-else-if="shouldShowEmpty" class="empty-message">{{ emptyMessage }}</p>
            </div>
        </slot>
    `
};
