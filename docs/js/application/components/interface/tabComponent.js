import { html } from '../../index.js';

// TabComponent: Modular tab navigation for application use
export const TabComponent = {
    props: {
        tabs: {
            type: Array,
            required: true // [{ name, label, closable, content }]
        },
        activeTab: {
            type: String,
            default: ''
        },
        showNewTabButton: {
            type: Boolean,
            default: false
        }
    },
    emits: ['tab-change', 'tab-close', 'new-tab', 'hamburger-menu'],
    data() {
        const tabs = this.tabs || [];
        return {
            internalActiveTab: this.activeTab || (tabs[0]?.name || ''),
            isOverflowing: false
        };
    },
    watch: {
        activeTab(val) {
            this.internalActiveTab = val;
        },
        tabs: {
            handler() {
                this.$nextTick(() => this.checkOverflow());
            },
            deep: true
        },
        internalActiveTab() {
            // Watch for tab open/close and check overflow
            this.$nextTick(() => this.checkOverflow());
        }
    },
    mounted() {
        window.addEventListener('resize', this.checkOverflow);
        this.$nextTick(() => this.checkOverflow());
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.checkOverflow);
    },
    methods: {
        selectTab(tabName) {
            this.internalActiveTab = tabName;
            this.$emit('tab-change', tabName);
        },
        closeTab(tabName) {
            this.$emit('tab-close', tabName);
        },
        addNewTab() {
            this.$emit('new-tab');
            // After adding a tab, verify dropdown mode
            this.$nextTick(() => this.checkOverflow());
        },
        openHamburgerMenu() {
            const tabsEl = this.$el?.querySelector('.tabs');
            if (!tabsEl) return;
            tabsEl.classList.toggle('menu-open');
            this.$emit('hamburger-menu');
        },
        checkOverflow(openMenu = false) {
            const tabsEl = this.$el?.querySelector('.tabs');
            if (!tabsEl) return;
            // Remove dropdown-mode and menu-open to allow layout recalculation
            tabsEl.classList.remove('dropdown-mode');
            tabsEl.classList.remove('menu-open');
            // Force reflow for accurate measurement
            void tabsEl.offsetWidth;
            // Use scrollWidth vs clientWidth to detect overflow
            const isOverflowing = tabsEl.scrollWidth > tabsEl.clientWidth;
            this.isOverflowing = isOverflowing;
            if (isOverflowing) {
                tabsEl.classList.add('dropdown-mode');
                if (openMenu) tabsEl.classList.add('menu-open');
            }
        }
    },
    template: html`
        <div class="tab-component">
            <div class="tabs">
                <button
                    class="button-symbol white"
                    @click="openHamburgerMenu"
                    title="Show tab menu"
                >≡</button>
                <button
                    v-for="tab in tabs"
                    :key="tab.name"
                    class="tab-button"
                    :class="{ active: tab.name === internalActiveTab }"
                    @click="selectTab(tab.name)"
                    :data-tab="tab.name"
                >
                    {{ tab.label }}
                    <span
                        v-if="tab.closable"
                        class="tab-close"
                        @click.stop="closeTab(tab.name)"
                        title="Close tab"
                    >×</span>
                </button>
                <button
                    v-if="showNewTabButton"
                    class="new-tab-button"
                    @click="addNewTab"
                    title="New Tab"
                >+</button>
            </div>
            <div class="tab-container">
                <div
                    v-for="tab in tabs"
                    :key="tab.name + '-content'"
                    v-show="tab.name === internalActiveTab"
                    class="tab-content"
                    :id="tab.name"
                >
                    <component
                        v-if="tab.component"
                        :is="tab.component"
                        v-bind="tab.props || {}"
                    ></component>
                    <template v-else>
                        <div v-html="tab.content"></div>
                    </template>
                </div>
            </div>
        </div>
    `
};

export default TabComponent;