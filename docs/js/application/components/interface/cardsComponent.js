import { html, LoadingBarComponent } from '../../index.js';

// Cards Grid Component: Simple responsive grid layout with clickable cards
export const CardsComponent = {
    components: { LoadingBarComponent },
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
        showSearch: {
            type: Boolean,
            default: false
        },
        searchTerm: {
            type: String,
            default: ''
        },
        hideCardsOnSearch: {
            type: Boolean,
            default: true
        }
    },
    data() {
        return {
            searchValue: this.searchTerm || '', // Initialize with searchTerm prop
        };
    },
    watch: {
        // Watch for changes to searchTerm prop and update internal searchValue
        searchTerm(newValue) {
            this.searchValue = newValue || '';
        }
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
        }
    },
    template: html`
        <div class="cards-component content">
            
            <!-- Initial Loading State (no items yet) -->
            <div v-if="!showHeader && isLoading" class="loading-message">
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
                    name="table-header-area"
                ></slot>
                <p v-if="isLoading || isAnalyzing">{{ loadingMessage }}</p>
                <p v-else-if="shouldShowEmpty" class="empty-message">{{ emptyMessage }}</p>
                
                <div v-if="showSearch" class="button-bar">
                    <input
                        v-if="showSearch"
                        type="text"
                        v-model="searchValue"
                        placeholder="Find..."
                        class="search-input"
                    />
                    <!--button
                        v-if="showSaveButton || allowSaveEvent"
                        @click="handleSave"
                        :disabled="isLoading || !allowSaveEvent"
                        class="save-button green"
                    >
                        Save
                    </button>
                    <button 
                        v-if="showRefresh" 
                        @click="handleRefresh" 
                        :disabled="isLoading" 
                        :class="'refresh-button ' + (allowSaveEvent ? 'red' : '')"
                    >
                        {{ isLoading ? 'Loading...' : (allowSaveEvent ? 'Discard' : 'Refresh') }}
                    </button>
                    <button
                        v-if="hamburgerMenuComponent"
                        @click="handleHamburgerMenu"
                        class="button-symbol white"
                    >
                        ☰
                    </button-->
                </div>
                <!-- Loading/Analysis Progress Indicator -->
                <transition name="fade">
                    <LoadingBarComponent
                        v-if="isLoading || isAnalyzing"
                        :is-loading="isLoading"
                        :is-analyzing="isAnalyzing"
                        :percent-complete="loadingProgress"
                        class="embedded"
                    />
                </transition>
            </div>

            <!-- Cards Grid (shows during analysis with progressive updates) -->
            <div v-if="shouldShowCards" class="cards-grid">
                <div
                    v-for="item in visibleCards"
                    :key="item.id || item.title"
                    :class="['card', 'clickable', item.cardClass || defaultCardClass]"
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
