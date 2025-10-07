import { html } from '../../index.js';

// Cards Grid Component: Simple responsive grid layout with clickable cards
export const CardsComponent = {
    props: {
        items: {
            type: Array,
            required: true,
            // Expected format: [{ id, title, content?, onClick?, cardClass? }]
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
            return this.isLoading || (!this.items || this.items.length === 0);
        },
        shouldShowEmpty() {
            return !this.isLoading && this.items && this.items.length === 0;
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
            <!-- Loading State -->
            <div v-if="shouldShowLoading && isLoading" class="loading-message">
                <img src="images/loading.gif" alt="Loading..."/>
                <p>{{ loadingMessage }}</p>
            </div>
            
            <!-- Empty State -->
            <div v-else-if="shouldShowEmpty" class="empty-message">
                <p>{{ emptyMessage }}</p>
            </div>
            
            <!-- Cards Grid -->
            <div v-else class="cards-grid">
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
                        <p>{{ item.content }}</p>
                    </div>
                </div>
            </div>
        </div>
    `
};
