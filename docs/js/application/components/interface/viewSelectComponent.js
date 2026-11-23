import { html } from '../../utils/template-helpers.js';
import { NavigationRegistry } from '../../index.js';

/**
 * ViewSelectComponent — switches between the views of a page view registry (§4.11).
 *
 * - 2 views: an icon toggle showing the other view's icon.
 * - 3+ views: a menu drawn like the page's selects: the current view's icon and a chevron. A click
 *   drops a column of view icons under it (the .selection-action-bubble of the table's edit
 *   bubble and the pinned alerts), the current one gray. The column goes to the body with a fixed
 *   place, so no header or dashboard card clips it; a choice, a click elsewhere, Escape, scrolling
 *   or resizing closes it.
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
    data() {
        return { menuOpen: false, menuStyle: {} };
    },
    computed: {
        otherView() {
            if (this.views.length !== 2) return null;
            return this.views.find(v => v.id !== this.currentId) || this.views[0];
        },
        currentView() {
            return this.views.find(v => v.id === this.currentId) || this.views[0];
        }
    },
    beforeUnmount() {
        this.closeMenu();
    },
    methods: {
        select(id) {
            if (!id || id === this.currentId) return;
            NavigationRegistry.updateContainerParams(this.containerPath, this.appContext?.currentPath, {
                view: id === this.defaultId ? undefined : id,
                layout: undefined
            }, this.navigateToPath);
        },
        toggleMenu() {
            if (this.menuOpen) this.closeMenu();
            else this.openMenu();
        },
        // The column's top just under the menu button, centred on the current view's icon
        openMenu() {
            const button = this.$refs.menuButton.getBoundingClientRect();
            const icon = this.$refs.menuIcon.getBoundingClientRect();
            this.menuStyle = { top: `${button.bottom + 4}px`, left: `${icon.left + icon.width / 2}px` };
            this.menuOpen = true;
            document.addEventListener('pointerdown', this.closeOnOutside, true);
            document.addEventListener('keydown', this.closeOnEscape, true);
            window.addEventListener('scroll', this.closeMenu, true);
            window.addEventListener('resize', this.closeMenu);
        },
        closeMenu() {
            if (!this.menuOpen) return;
            this.menuOpen = false;
            document.removeEventListener('pointerdown', this.closeOnOutside, true);
            document.removeEventListener('keydown', this.closeOnEscape, true);
            window.removeEventListener('scroll', this.closeMenu, true);
            window.removeEventListener('resize', this.closeMenu);
        },
        closeOnOutside(event) {
            if (this.$refs.menu?.contains(event.target) || this.$refs.menuButton?.contains(event.target)) return;
            this.closeMenu();
        },
        closeOnEscape(event) {
            if (event.key === 'Escape') this.closeMenu();
        },
        choose(id) {
            this.closeMenu();
            this.select(id);
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
        <button
            v-else-if="views.length > 2"
            ref="menuButton"
            class="view-select-menu"
            :title="'View: ' + (currentView.name || currentView.id)"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            @click="toggleMenu"
        >
            <span ref="menuIcon" class="material-symbols-outlined">{{ currentView.icon || 'visibility' }}</span>
            <svg class="select-chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 1.75 6 6.25l4.5-4.5"/></svg>
        </button>
        <Teleport to="body">
            <transition name="fade">
                <div v-if="menuOpen" ref="menu" class="view-select-bubble selection-action-bubble" role="menu" :style="menuStyle">
                    <button
                        v-for="v in views"
                        :key="v.id"
                        role="menuitem"
                        :class="['button-symbol', v.id === currentId ? 'gray' : 'white']"
                        :title="v.name || v.id"
                        :aria-current="v.id === currentId"
                        @click="choose(v.id)"
                    >
                        <span class="material-symbols-outlined">{{ v.icon || 'visibility' }}</span>
                    </button>
                </div>
            </transition>
        </Teleport>
    `
};
