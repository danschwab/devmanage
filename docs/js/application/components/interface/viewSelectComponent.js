import { html } from '../../utils/template-helpers.js';
import { NavigationRegistry } from '../../index.js';

/**
 * ViewSelectComponent — switches between the views of a page view registry (§4.11).
 *
 * - 2 views: an icon toggle showing the other view's icon.
 * - 3+ views: a joined row of icon buttons, one per view, the current one filled (aria-pressed);
 *   one nested .button-bar, so the header's ButtonBar keeps it on one line.
 * Switching writes `?view=<id>` (the default view removes the parameter) and clears the legacy
 * `layout` parameter. On the dashboard it rewrites the card's stored path instead of navigating,
 * so the card remembers its last view (R3.3).
 */
export const ViewSelectComponent = {
    name: 'ViewSelectComponent',
    inject: ['appContext'],
    props: {
        views: { type: Array, required: true },          // [{ id, name, icon }]
        currentId: { type: String, required: true },
        defaultId: { type: String, default: null },
        containerPath: { type: String, required: true },
        navigateToPath: { type: Function, default: null }
    },
    computed: {
        otherView() {
            if (this.views.length !== 2) return null;
            return this.views.find(v => v.id !== this.currentId) || this.views[0];
        }
    },
    methods: {
        select(id) {
            if (!id || id === this.currentId) return;
            NavigationRegistry.updateContainerParams(this.containerPath, this.appContext?.currentPath, {
                view: id === this.defaultId ? undefined : id,
                layout: undefined
            }, this.navigateToPath);
        }
    },
    template: html`
        <button
            v-if="otherView"
            class="white button-symbol view-select"
            :title="'Switch to ' + (otherView.name || otherView.id)"
            @click="select(otherView.id)"
        >
            <span class="material-symbols-outlined">{{ otherView.icon || 'visibility' }}</span>
        </button>
        <div v-else-if="views.length > 2" class="button-bar view-select" role="group" aria-label="View">
            <button
                v-for="v in views"
                :key="v.id"
                :class="['button-symbol', v.id === currentId ? '' : 'white']"
                :title="v.name || v.id"
                :aria-pressed="v.id === currentId"
                @click="select(v.id)"
            >
                <span class="material-symbols-outlined">{{ v.icon || 'visibility' }}</span>
            </button>
        </div>
    `
};
