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
            isOverflowing: false,
            isLoading: false // reactive loading state
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
    beforeUnmount() {
        window.removeEventListener('resize', this.checkOverflow);
    },
    methods: {
        setLoading(val) {
            this.isLoading = val;
        },
        selectTab(tabName) {
            this.internalActiveTab = tabName;
            this.$emit('tab-change', tabName);
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
                        @click.stop="$emit('tab-close', tab.name)"
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
                <div v-if="isLoading" class="loading-message" style="text-align:center; padding:2rem;">
                    <img src="images/loading.gif" alt="..."/>
                    <p>Loading data...</p>
                </div>
                <div v-else>
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
        </div>
    `
};

// Generic Tabs List Component with loading pattern
export const TabsListComponent = {
    props: {
        tabs: {
            type: Array,
            required: true
        },
        onSelect: {
            type: Function,
            required: true
        },
        loadingMessage: {
            type: String,
            default: 'Loading data...'
        },
        isLoading: {
            type: Boolean,
            default: false
        }
    },
    computed: {
        computedIsLoading() {
            // Show loading if isLoading is true or tabs are empty
            return this.isLoading || !this.tabs || this.tabs.length === 0;
        }
    },
    methods: {
        selectTab(tabName) {
            this.onSelect(tabName);
        }
    },
    template: html`
        <div class="tabs-list">
            <div v-if="computedIsLoading" class="loading-message">
                <img src="images/loading.gif" alt="..."/>
                <p>{{ loadingMessage }}</p>
            </div>
            <div v-else>
                <button 
                    v-for="tab in tabs"
                    class="tab-button"
                    :key="tab.title"
                    @click="selectTab(tab.title)">
                    {{ tab.title }}
                </button>
            </div>
        </div>
    `
};

