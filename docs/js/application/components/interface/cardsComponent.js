import { html, LoadingBarComponent, NavigationRegistry } from '../../index.js';

// Cards Grid Component: Simple responsive grid layout with clickable cards
export const CardsComponent = {
    components: { LoadingBarComponent },
    inject: ['appContext'],
    props: {
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
        defaultCardClass: {
            type: String,
            default: 'gray'
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
        hideCardsOnSearch: {
            type: Boolean,
            default: true
        }
    },
    data() {
        return {
            searchValue: '', // Will be initialized from URL in mounted if syncSearchWithUrl
        };
    },
    watch: {
        // Watch for URL parameter changes when syncSearchWithUrl is enabled
        'appContext.currentPath': {
            handler(newPath, oldPath) {
                if (!this.syncSearchWithUrl || !oldPath) return;
                
                const newParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath,
                    newPath
                );
                const oldParams = NavigationRegistry.getParametersForContainer(
                    this.containerPath,
                    oldPath
                );
                
                // Only update if searchTerm parameter changed
                if (newParams?.searchTerm !== oldParams?.searchTerm) {
                    this.searchValue = newParams?.searchTerm || '';
                }
            }
        },

    },
    computed: {
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
            if (this.searchValue && this.searchValue.trim() && this.hideCardsOnSearch) {
                const searchTerm = this.searchValue.toLowerCase().trim();
                filteredData = filteredData.filter(row => {
                    if (!row) return false;
                    // Search in title, content, and contentFooter fields
                    const fields = [
                        row.title,
                        row.content,
                        row.contentFooter
                    ];
                    return fields.some(field =>
                        field && String(field).toLowerCase().includes(searchTerm)
                    );
                });
            }

            return filteredData;
        }
    },
    mounted() {
        // Initialize searchValue from URL if syncSearchWithUrl is enabled
        if (this.syncSearchWithUrl && this.containerPath && this.appContext?.currentPath) {
            const params = NavigationRegistry.getParametersForContainer(
                this.containerPath,
                this.appContext.currentPath
            );
            if (params?.searchTerm) {
                this.searchValue = params.searchTerm;
            }
        }
    },
    methods: {
        /**
         * Update searchTerm parameter in URL when syncSearchWithUrl is enabled
         */
        updateSearchInURL(searchValue) {
            if (!this.syncSearchWithUrl || !this.containerPath || !this.navigateToPath) {
                return;
            }
            
            const isOnDashboard = this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
            
            // Set searchTerm or undefined to remove it
            const params = {
                searchTerm: (searchValue && searchValue.trim()) ? searchValue : undefined
            };
            
            const newPath = NavigationRegistry.buildPathWithCurrentParams(
                this.containerPath.split('?')[0],
                this.appContext?.currentPath,
                params
            );
            
            if (isOnDashboard) {
                // Update dashboard registry
                NavigationRegistry.dashboardRegistry.updatePath(
                    this.containerPath.split('?')[0],
                    newPath
                );
            } else {
                // Regular navigation
                this.navigateToPath(newPath);
            }
        },
        
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
            console.log('CardsComponent: Refresh requested');
            this.$emit('refresh');
        },
        isCardAnalyzing(cardIndex) {
            // Check if this card is currently being analyzed
            const card = this.visibleCards[cardIndex];
            return card && card.AppData && card.AppData._analyzing === true;
        }
    },
    template: html`
        <div class="cards-component content">
            
            <!-- Initial Loading State (no items yet) -->
            <div v-if="!showHeader && isLoading && !(shouldShowCards && visibleCards.length > 0)" class="loading-message">
                <img src="images/loading.gif" alt="Loading..."/>
                <p>{{ loadingMessage }}</p>
            </div>
            
            <!-- Empty State -->
            <div v-else-if="!showHeader && shouldShowEmpty" class="empty-message">
                <p>{{ emptyMessage }}</p>
            </div>
            
            <div key="content-header" v-if="showHeader" class="content-header">
                <!--h3 v-if="title">{{ title }}</h3-->
                <slot 
                    name="header-area" 
                ></slot>
                <p v-if="isLoading || isAnalyzing">{{ loadingMessage }}</p>
                <p v-else-if="shouldShowEmpty" class="empty-message">{{ emptyMessage }}</p>
                
                <div v-if="showRefresh || showSearch" class="button-bar">
                    <input
                        v-if="showSearch"
                        type="text"
                        v-model="searchValue"
                        @blur="syncSearchWithUrl && updateSearchInURL(searchValue)"
                        placeholder="Find..."
                        class="search-input"
                    />
                    <button 
                        v-if="showRefresh" 
                        @click="handleRefresh" 
                        :disabled="isLoading" 
                        class="refresh-button"
                    >
                        {{ isLoading ? 'Loading...' : 'Refresh' }}
                    </button>
                </div>
                <!-- Loading/Analysis Progress Indicator -->
                <LoadingBarComponent
                    :is-loading="isLoading"
                    :is-analyzing="isAnalyzing"
                    :percent-complete="loadingProgress"
                    class="embedded"
                />
            </div>

            <!-- Cards Grid (shows during analysis with progressive updates) -->
            <div v-if="shouldShowCards" class="cards-grid">
                <div
                    v-for="(item, idx) in visibleCards"
                    :key="item.id || item.title"
                    :class="['card', 'clickable', { 'analyzing': isCardAnalyzing(idx) }, item.cardClass || defaultCardClass]"
                    @click="handleCardClick(item)"
                    @keydown="handleKeyDown($event, item)"
                    :title="item.title"
                    :aria-label="item.title + (item.content ? ': ' + item.content : '')"
                >
                    <div class="content-header">
                        <h3>{{ item.title }}</h3>
                    </div>
                    <div class="content" v-if="item.content">
                        <div v-html="item.content"></div>
                    </div>
                    <div class="content-footer" v-if="item.contentFooter">
                        <div v-html="item.contentFooter"></div>
                    </div>
                </div>
            </div>
        </div>
    `
};
