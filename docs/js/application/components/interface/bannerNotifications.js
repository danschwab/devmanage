import { html } from '../../index.js';

/**
 * BannerNotifications — renders a stack of status banners above table content.
 *
 * Each banner is an object with the shape:
 *   {
 *     key:       String   — unique key used for v-for and interval tracking
 *     color:     String   — card color class ('red', 'white', 'orange', 'purple', ...)
 *     message:   String   — text to display
 *     visible:   Boolean  — whether to render this banner
 *     dismissible?: Boolean — whether the dismiss button is enabled (default true)
 *     poll?: {            — optional: while visible, call fn on a recurring interval
 *       fn:          Function  — async function to call
 *       intervalMs:  Number   — interval in milliseconds
 *     }
 *   }
 *
 * Polling lifecycle:
 *   - An interval is started the first time a banner with `poll` becomes visible.
 *   - The interval is stopped when the banner is no longer visible or the component unmounts.
 *   - Intervals are never duplicated — reconciliation runs on every banners change.
 */
export const BannerNotifications = {
    inject: ['$modal'],
    props: {
        banners: {
            type: Array,
            default: () => []
        }
    },
    data() {
        return {
            dismissedKeys: {},
            bannersScrolledOut: false,
            scrollableParent: null
        };
    },
    created() {
        // Store interval IDs outside Vue reactivity — they are implementation detail, not state.
        this._pollIntervals = {};
        // Bind the scroll handler to preserve 'this' context
        this._boundScrollHandler = this.checkBannersVisibility.bind(this);
    },
    mounted() {
        // Find the scrollable parent container (typically #app-content)
        let scrollable = this.$el.parentElement;
        while (scrollable && scrollable !== document.body) {
            const style = window.getComputedStyle(scrollable);
            const overflowY = style.overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') {
                this.scrollableParent = scrollable;
                break;
            }
            scrollable = scrollable.parentElement;
        }
        
        if (!this.scrollableParent) {
            this.scrollableParent = window;
        }
        
        // Add scroll listener to the actual scrollable container
        this.scrollableParent.addEventListener('scroll', this._boundScrollHandler);
        this.$nextTick(() => this.checkBannersVisibility());
    },
    beforeUnmount() {
        if (this.scrollableParent) {
            this.scrollableParent.removeEventListener('scroll', this._boundScrollHandler);
        }
        Object.values(this._pollIntervals).forEach(id => clearInterval(id));
        this._pollIntervals = {};
    },
    computed: {
        visibleBanners() {
            return this.banners.filter(b => b.visible && !this.dismissedKeys[b.key]);
        },
        showAlertBubbles() {
            return this.bannersScrolledOut && this.visibleBanners.length > 0;
        }
    },
    watch: {
        banners: {
            handler(newBanners) {
                // Clear dismissed state for any banner that is no longer visible,
                // so it will re-show if its condition becomes true again.
                for (const banner of newBanners) {
                    if (!banner.visible && this.dismissedKeys[banner.key]) {
                        delete this.dismissedKeys[banner.key];
                    }
                }
                this._reconcilePolling(newBanners);
            },
            deep: true,
            immediate: true
        },
        visibleBanners() {
            // Re-check visibility when visible banners change
            this.$nextTick(() => this.checkBannersVisibility());
        }
    },
    methods: {
        checkBannersVisibility() {
            if (!this.$el || this.visibleBanners.length === 0) {
                this.bannersScrolledOut = false;
                return;
            }
            
            // Find the actual banner elements (not the wrapper)
            const bannerElements = this.$el.querySelectorAll('.banner-notification');
            if (bannerElements.length === 0) {
                this.bannersScrolledOut = false;
                return;
            }
            
            // Check the last banner's position (if all banners are scrolled out, the last one will be)
            const lastBanner = bannerElements[bannerElements.length - 1];
            const rect = lastBanner.getBoundingClientRect();
            
            // Consider banners scrolled out if the bottom is above the viewport top
            this.bannersScrolledOut = rect.bottom < 0;
        },

        dismiss(key) {
            this.dismissedKeys = { ...this.dismissedKeys, [key]: true };
        },

        showAlertDetails(banner) {
            this.$modal.confirm(
                String(banner.message || ''),
                () => {
                    if (banner.action) {
                        banner.action.fn();
                    }
                },
                null,
                'Alert',
                banner.action ? banner.action.label : 'OK'
            );
        },

        getAlertSymbol(banner) {
            // Return a symbol based on the banner color
            const symbols = {
                red: '⚠',
                orange: '⚠',
                yellow: '⚠'
            };
            return symbols[banner.color] || 'ℹ';
        },

        _reconcilePolling(banners) {
            if (!this._pollIntervals) this._pollIntervals = {};
            const activeKeys = new Set();

            for (const banner of banners) {
                if (banner.visible && banner.poll) {
                    activeKeys.add(banner.key);
                    if (!this._pollIntervals[banner.key]) {
                        this._pollIntervals[banner.key] = setInterval(
                            () => banner.poll.fn(),
                            banner.poll.intervalMs
                        );
                    }
                }
            }

            // Clear intervals for banners that are no longer visible or no longer have poll config.
            for (const key of Object.keys(this._pollIntervals)) {
                if (!activeKeys.has(key)) {
                    clearInterval(this._pollIntervals[key]);
                    delete this._pollIntervals[key];
                }
            }
        }
    },
    template: html`
        <div>
            <transition-group name="expand">
                <template v-for="banner in visibleBanners" :key="banner.key">
                    <div :class="['banner-notification', 'card', banner.color]" style="display: flex; align-items: center; justify-content: space-between; gap: var(--padding-sm);">
                        <span>{{ banner.message }}</span>
                        <div v-if="banner.action && banner.dismissible !== false" class="button-bar">
                            <button
                                @click="banner.action.fn()"
                                :class="[banner.color]"
                            >{{ banner.action.label }}</button>
                            <button
                                @click="dismiss(banner.key)"
                                title="Dismiss"
                                :class="['button-symbol', banner.color]"
                            >🗙</button>
                        </div>
                        <slot v-else>
                            <button
                                v-if="banner.action"
                                @click="banner.action.fn()"
                                :class="[banner.color]"
                            >{{ banner.action.label }}</button>
                            <button
                                v-if="banner.dismissible !== false"
                                @click="dismiss(banner.key)"
                                title="Dismiss"
                                :class="['button-symbol', banner.color]"
                            >🗙</button>
                        </slot>
                    </div>
                </template>
            </transition-group>

            <!-- Alert bubbles when scrolled out of view -->
            <transition name="fade">
                <div v-if="showAlertBubbles" class="selection-action-bubble" style="position: fixed; bottom: var(--padding-md); right: var(--padding-md); left: unset; z-index: 1000;">
                    <button
                        v-for="banner in visibleBanners"
                        :key="banner.key"
                        @click="showAlertDetails(banner)"
                        :class="['button-symbol', banner.color]"
                        :title="banner.message"
                    >
                        {{ getAlertSymbol(banner) }}
                    </button>
                </div>
            </transition>
        </div>
    `
};
