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
        }
    },
    computed: {
        shouldShowLoading() {
            // Only show loading spinner if actually loading AND no items yet
            return this.isLoading && (!this.items || this.items.length === 0);
        },
        shouldShowEmpty() {
            return !this.isLoading && !this.isAnalyzing && this.items && this.items.length === 0;
        },
        shouldShowCards() {
            // Show cards if we have items, even during analysis
            return this.items && this.items.length > 0;
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
        <div class="cards-component">
            <!-- Loading/Analysis Progress Indicator -->
            <transition name="fade">
                <LoadingBarComponent
                    v-if="isLoading || isAnalyzing"
                    :is-loading="isLoading"
                    :is-analyzing="isAnalyzing"
                    :percent-complete="loadingProgress"
                />
            </transition>
            
            <!-- Initial Loading State (no items yet) -->
            <div v-if="shouldShowLoading" class="loading-message">
                <img src="images/loading.gif" alt="Loading..."/>
                <p>{{ loadingMessage }}</p>
            </div>
            
            <!-- Empty State -->
            <div v-else-if="shouldShowEmpty" class="empty-message">
                <p>{{ emptyMessage }}</p>
            </div>
            
            <!-- Cards Grid (shows during analysis with progressive updates) -->
            <div v-else-if="shouldShowCards" class="cards-grid">
                <div
                    v-for="item in items"
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
