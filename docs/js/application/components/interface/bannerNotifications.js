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
    props: {
        banners: {
            type: Array,
            default: () => []
        }
    },
    data() {
        return {
            dismissedKeys: {}
        };
    },
    created() {
        // Store interval IDs outside Vue reactivity — they are implementation detail, not state.
        this._pollIntervals = {};
    },
    computed: {
        visibleBanners() {
            return this.banners.filter(b => b.visible && !this.dismissedKeys[b.key]);
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
        }
    },
    beforeUnmount() {
        Object.values(this._pollIntervals).forEach(id => clearInterval(id));
        this._pollIntervals = {};
    },
    methods: {
        dismiss(key) {
            this.dismissedKeys = { ...this.dismissedKeys, [key]: true };
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
        <transition-group name="expand">
            <template v-for="banner in visibleBanners" :key="banner.key">
                <div :class="['banner-notification', 'card', banner.color]" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5em;">
                    <span>{{ banner.message }}</span>
                    <button
                        v-if="banner.action"
                        @click="banner.action.fn()"
                        :class="['column-button', banner.color]"
                    >{{ banner.action.label }}</button>
                    <button
                        v-if="banner.dismissible !== false"
                        @click="dismiss(banner.key)"
                        title="Dismiss"
                        :class="['column-button', banner.color]"
                    >🗙</button>
                </div>
            </template>
        </transition-group>
    `
};
