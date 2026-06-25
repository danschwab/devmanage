import { html, NavigationRegistry, appSettings, runNonessentialAnalysisOnAllStores } from '../../index.js';
import { PriorityQueue } from '../../utils/priorityQueue.js';

export const PrimaryNavComponent = {
    props: {
        isMenuOpen: {
            type: Boolean,
            default: false
        },
        navigationItems: {
            type: Array,
            default: () => []
        },
        currentPath: {
            type: String,
            default: 'dashboard'
        },
        isAuthenticated: {
            type: Boolean,
            default: false
        },
        isAuthLoading: {
            type: Boolean,
            default: false
        },
        currentUser: {
            type: Object,
            default: () => null
        }
    },
    emits: [
        'toggle-menu',
        'navigate-to-path',
        'login',
        'logout'
    ],
    data() {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return {
            isMenuVisible: true,
            lastScrollTop: 0,
            darkMode: saved === 'dark' ? true : saved === 'light' ? false : prefersDark
        };
    },
    computed: {
        currentPage() {
            const cleanPath = this.currentPath.split('?')[0];
            return cleanPath.split('/')[0];
        },
        isDarkMode() {
            return this.darkMode;
        },
        logoSrc() {
            return this.isDarkMode ? 'assets/logoW.png' : 'assets/logo.png';
        },
        isMobileView() {
            // Mobile view is max-width: 800px
            return window.innerWidth <= 800;
        },
        onlyEssentialAnalysis() {
            return appSettings.onlyRunEssentialAnalysis;
        }
    },
    methods: {
        toggleEssentialAnalysis() {
            const wasEssentialOnly = appSettings.onlyRunEssentialAnalysis;
            appSettings.onlyRunEssentialAnalysis = !appSettings.onlyRunEssentialAnalysis;
            
            // Save to localStorage
            localStorage.setItem('essentialAnalysisOnly', appSettings.onlyRunEssentialAnalysis);
            
            if (wasEssentialOnly) {
                // Switching from essential-only to full analysis
                // Trigger nonessential analysis on all stores that have data
                //console.log('[Navigation] Enabling full analysis mode - triggering nonessential analysis');
                runNonessentialAnalysisOnAllStores();
            } else {
                // Switching from full to essential-only
                // Clear pending nonessential analysis tasks from queue
                //console.log('[Navigation] Enabling essential-only mode - clearing nonessential tasks');
                PriorityQueue.clearNonessentialAnalysis();
            }
        },
        toggleDarkMode() {
            this.darkMode = !this.darkMode;
            const theme = this.darkMode ? 'dark' : 'light';
            document.documentElement.dataset.theme = theme;
            localStorage.setItem('theme', theme);
        },
        handleNavClick(item) {
            // In mobile view: if menu is closed, open it first; if open, then navigate
            // In desktop view: always navigate
            if (this.isMobileView && !this.isMenuOpen) {
                this.$emit('toggle-menu');
            } else {
                this.$emit('navigate-to-path', item.path);
            }
        },
        handleClickOutside(event) {
            if (!this.isMenuOpen) return;
            const nav = this.$el.querySelector('nav');
            if (nav && !nav.contains(event.target)) {
                this.$emit('toggle-menu');
            }
        }
    },
    mounted() {
        const saved = localStorage.getItem('theme');
        if (saved) document.documentElement.dataset.theme = saved;
        document.addEventListener('mouseup', this.handleClickOutside);
        //add a listener for scroll up or down in #app-content to hide or show the navbar
        document.querySelector('#app-content').addEventListener('scroll', () => {
            const currentScroll = document.querySelector('#app-content').scrollTop;
            if (currentScroll > this.lastScrollTop + 12) {
                this.isMenuVisible = false;
                this.lastScrollTop = currentScroll;
            } else if (currentScroll < this.lastScrollTop - 64 || currentScroll <= 0) {
                this.isMenuVisible = true;
                this.lastScrollTop = currentScroll;
            }
        });
    },
    beforeUnmount() {
        document.removeEventListener('mouseup', this.handleClickOutside);
    },
    template: html`
        <header>
            <nav 
                :class="{ 'open': isMenuOpen, 'hidden': !isMenuVisible && !isMenuOpen }"
                >
                <a @click.prevent="$emit('navigate-to-path', 'dashboard');">
                    <img :src="logoSrc" alt="Top Shelf Exhibits" />
                </a>

                <span id="navbar">
                    <template v-if="isAuthenticated">
                        <a v-for="item in navigationItems" 
                           :key="item.path"
                           :class="{ 'active': currentPage === item.path }"
                           @click.prevent="handleNavClick(item)">
                            {{ item.title }}
                        </a>
                    </template>
                    
                    <div class="button-bar">
                        <button class="button-symbol" 
                                @click="toggleEssentialAnalysis" 
                                :class="{ 'red': onlyEssentialAnalysis }"
                                :title="onlyEssentialAnalysis ? 'Running essential analysis only (click to enable all)' : 'Running all analysis (click to enable essential only)'">
                            <span class="material-symbols-outlined">timeline</span>
                        </button>
                        <button class="button-symbol" @click="toggleDarkMode" :title="darkMode ? 'Switch to light mode' : 'Switch to dark mode'">
                            <span class="material-symbols-outlined">{{ darkMode ? 'light_mode' : 'dark_mode' }}</span>
                        </button>
                        <button v-if="!isAuthenticated" 
                                @click="$emit('login')" 
                                :disabled="isAuthLoading"
                                class="login-out-button active">
                            {{ isAuthLoading ? 'Loading...' : 'Login' }}
                        </button>
                        <button v-else 
                                @click="$emit('logout')" 
                                :disabled="isAuthLoading"
                                class="login-out-button">
                            {{ isAuthLoading ? 'Logging out...' : 'Logout (' + (currentUser?.name || '') + ')' }}
                        </button>
                    </div>
                </span>
                
                <button class="nav-toggle button-symbol white" @click="$emit('toggle-menu')">
                    {{ isMenuOpen ? '🗙' : '≡' }}
                </button>
            </nav>
        </header>
    `
};


export const BreadcrumbComponent = {
    props: {
        containerPath: {
            type: String,
            default: ''
        },
        title: {
            type: String,
            default: ''
        },
        cardStyle: {
            type: Boolean,
            default: false
        },
        containerId: {
            type: String,
            required: false
        }
    },
    data() {
        return {
            showHoverPath: false
        };
    },
    computed: {
        // Extract clean path without query parameters for breadcrumb display
        cleanPath() {
            if (!this.containerPath) return '';
            return this.containerPath.split('?')[0];
        },
        pathSegments() {
            if (!this.cleanPath) return [];
            return this.cleanPath.split('/').filter(segment => segment.length > 0);
        },
        pathSegmentsWithNames() {
            if (!this.pathSegments.length) return [];
            
            return this.pathSegments.map((segment, index) => {
                // Build the cumulative path up to this segment
                const cumulativePath = this.pathSegments.slice(0, index + 1).join('/');
                
                return {
                    id: segment,
                    name: this.getSegmentName(segment),
                    index: index,
                    path: cumulativePath
                };
            });
        },
        displayTitle() {
            if (this.containerPath) {
                // For dashboard cards, use dashboard title; for regular breadcrumbs, use display name
                if (this.cardStyle) {
                    return NavigationRegistry.getDisplayName(this.containerPath,true);
                } else {
                    if (this.pathSegmentsWithNames.length === 0) return this.title;
                    return this.pathSegmentsWithNames[this.pathSegmentsWithNames.length - 1].name;
                }
            }
            return this.title;
        },
        canGoBack() {
            if (this.pathSegments.length <= 1) return false;
            
            // Don't allow going back if the parent path would be 'dashboard'
            const parentSegments = this.pathSegments.slice(0, -1);
            if (parentSegments.length === 1 && parentSegments[0] === 'dashboard') {
                return false;
            }
            
            return true;
        },
        parentPath() {
            if (this.pathSegments.length <= 1) return '';
            return this.pathSegments.slice(0, -1).join('/');
        }
    },
    methods: {
        /**
         * Get human-readable name for a segment, building it if not found
         * @param {string} segmentId - The segment identifier
         */
        getSegmentName(segmentId) {
            // Try to get from NavigationRegistry
            let registryName = NavigationRegistry.getDisplayName(segmentId);
            if (registryName !== 'Unknown') {
                return registryName;
            }
            
            // Auto-generate name if not found
            return segmentId.charAt(0).toUpperCase() + segmentId.slice(1);
        },
        navigateToBreadcrumb(index) {
            if (index < this.pathSegments.length - 1) {
                const targetPath = this.pathSegments.slice(0, index + 1).join('/');
                
                // Emit string path for navigation
                this.$emit('navigate-to-path', targetPath);
            }
        },
        showHoverBreadcrumb() {
            this.showHoverPath = true;
        },
        hideHoverBreadcrumb() {
            this.showHoverPath = false;
        }
    },
    template: html`
        <div v-if="containerPath" class="breadcrumb-nav">
            <!-- Full breadcrumb path for non-card containers -->
            <div v-if="!cardStyle" class="breadcrumb-path">
                <template v-for="(segment, index) in pathSegmentsWithNames" :key="segment.id">
                    <span 
                        class="breadcrumb-segment"
                        :class="{ 
                            'active': index === pathSegmentsWithNames.length - 1,
                            'page-highlight': index === 0 
                        }"
                        @click="navigateToBreadcrumb(index)">
                        {{ segment.name }}
                    </span>
                    <span v-if="index < pathSegmentsWithNames.length - 1" class="breadcrumb-separator">/</span>
                </template>
            </div>
            <!-- Current location with hover overlay for dashboard cards -->
            <div v-else class="breadcrumb-card-container">
                <span v-if="!showHoverPath" class="breadcrumb-current" 
                    @mouseenter="showHoverBreadcrumb" 
                    @mouseleave="hideHoverBreadcrumb">
                    {{ displayTitle }}
                </span>

                <!-- Hover overlay with full breadcrumb path -->
                <div v-else-if="showHoverPath" class="breadcrumb-hover-overlay"
                     @mouseenter="showHoverBreadcrumb" 
                     @mouseleave="hideHoverBreadcrumb">
                    <div class="breadcrumb-path">
                        <template v-for="(segment, index) in pathSegmentsWithNames" :key="segment.id">
                            <span 
                                class="breadcrumb-segment"
                                :class="{ 
                                    'active': index === pathSegmentsWithNames.length - 1,
                                    'page-highlight': index === 0 
                                }"
                                @click="navigateToBreadcrumb(index)">
                                {{ segment.name }}
                            </span>
                            <span v-if="index < pathSegmentsWithNames.length - 1" class="breadcrumb-separator">/</span>
                        </template>
                    </div>
                </div>
            </div>
        </div>
        <!-- Traditional Title (fallback) -->
        <h2 v-else-if="title">{{ displayTitle }}</h2>
    `
};


/**
 * Standard Vue component for dashboard toggle functionality
 */
export const DashboardToggleComponent = {
    props: {
        containerPath: String,
        containerType: String,
        currentView: String,
        title: String
    },
    inject: ['appContext'],
    computed: {
        isOnDashboard() {
            return NavigationRegistry.dashboardRegistry.has(this.containerPath);
        },
        isLoading() {
            return NavigationRegistry.dashboardRegistry.isLoading;
        },
        loadingMessage() {
            return NavigationRegistry.dashboardRegistry.loadingMessage;
        },
        containerClasses() {
            const classes = NavigationRegistry.dashboardRegistry.getClasses(this.containerPath);
            return new Set(classes ? classes.split(' ').filter(c => c.length > 0) : []);
        },
        canMoveLeft() {
            if (!this.isOnDashboard) return false;
            const containers = NavigationRegistry.dashboardRegistry.containers;
            const index = containers.findIndex(container => 
                (typeof container === 'string' ? container : container.path) === this.containerPath
            );
            return index > 0;
        },
        canMoveRight() {
            if (!this.isOnDashboard) return false;
            const containers = NavigationRegistry.dashboardRegistry.containers;
            const index = containers.findIndex(container => 
                (typeof container === 'string' ? container : container.path) === this.containerPath
            );
            return index > -1 && index < containers.length - 1;
        }
    },
    methods: {
        async toggleDashboardPresence() {
            if (this.isOnDashboard) {
                await NavigationRegistry.dashboardRegistry.remove(this.containerPath);
            } else {
                await NavigationRegistry.dashboardRegistry.add(this.containerPath);
            }
        },
        async toggleDashboardClass(className) {
            if (this.isOnDashboard) {
                await NavigationRegistry.dashboardRegistry.toggleClass(this.containerPath, className);
            }
        },
        async moveLeft() {
            if (this.canMoveLeft) {
                await NavigationRegistry.dashboardRegistry.moveLeft(this.containerPath);
            }
        },
        async moveRight() {
            if (this.canMoveRight) {
                await NavigationRegistry.dashboardRegistry.moveRight(this.containerPath);
            }
        }
    },
    template: html`
        <div>
            <!-- Dashboard card styling controls (only show on dashboard page) -->
            <div v-if="(this.appContext.currentPath?.split('/')[0] === 'dashboard') && isOnDashboard" class="button-bar">
                <button @click="toggleDashboardClass('wide');" 
                        :class="{ 'green': containerClasses.has('wide'), 'blue': !containerClasses.has('wide') }">
                    Wide
                </button>
                <button @click="toggleDashboardClass('tall');" 
                        :class="{ 'green': containerClasses.has('tall'), 'blue': !containerClasses.has('tall') }">
                    Tall
                </button>
            </div>
            
            <!-- Dashboard ordering controls (only show on dashboard page) -->
            <div v-if="(this.appContext.currentPath?.split('/')[0] === 'dashboard') && isOnDashboard" class="button-bar">
                <button @click="moveLeft" :disabled="!canMoveLeft" 
                        :class="{ 'blue': canMoveLeft, 'disabled': !canMoveLeft }">
                    ← Move Left
                </button>
                <button @click="moveRight" :disabled="!canMoveRight" 
                        :class="{ 'blue': canMoveRight, 'disabled': !canMoveRight }">
                    Move Right →
                </button>
            </div>
            
            <!-- Add/Remove from dashboard -->
            <button 
                @click="toggleDashboardPresence"
                :class="{ 'red': isOnDashboard, 'green': !isOnDashboard }">
                {{ isOnDashboard ? 'Remove from Dashboard' : 'Add to Dashboard' }}
            </button>
        </div>
    `
};

/**
 * ViewChangeComponent: A flexible component for switching between different view modes
 * 
 * Props:
 * - containerPath: The path of the container using this component
 * - navigateToPath: Function to navigate to a new path
 * - viewModes: Array of view mode objects with structure:
 *   [
 *     { paramName: 'layout', paramValue: null, symbol: 'table', title: 'Table view' },
 *     { paramName: 'layout', paramValue: 'calendar', symbol: 'calendar_month', title: 'Calendar view' }
 *   ]
 *   Where:
 *   - paramName: The URL parameter name to update
 *   - paramValue: The value to set (null/undefined removes the parameter)
 *   - symbol: Material symbol icon name to display
 *   - title: Tooltip text for the button
 */
export const ViewChangeComponent = {
    name: 'ViewChangeComponent',
    inject: ['appContext'],
    props: {
        containerPath: { type: String, required: true },
        navigateToPath: { type: Function, required: true },
        viewModes: { type: Array, required: true }
    },
    computed: {
        currentViewMode() {
            if (!this.viewModes || this.viewModes.length === 0) return null;
            
            const params = NavigationRegistry.getNavigationParameters(this.containerPath);
            
            // Find the current view mode by matching the param value
            for (const mode of this.viewModes) {
                const currentValue = params[mode.paramName];
                if (mode.paramValue === null || mode.paramValue === undefined) {
                    // This mode represents "no parameter set"
                    if (!currentValue) return mode;
                } else if (currentValue === mode.paramValue) {
                    return mode;
                }
            }
            
            // Default to first mode if no match
            return this.viewModes[0];
        },
        nextViewMode() {
            if (!this.viewModes || this.viewModes.length === 0) return null;
            
            const currentIndex = this.viewModes.indexOf(this.currentViewMode);
            const nextIndex = (currentIndex + 1) % this.viewModes.length;
            return this.viewModes[nextIndex];
        },
        togglePath() {
            if (!this.nextViewMode) return this.containerPath;
            
            const cleanPath = this.containerPath.split('?')[0];
            const params = { ...NavigationRegistry.getNavigationParameters(this.containerPath) };
            
            if (this.nextViewMode.paramValue === null || this.nextViewMode.paramValue === undefined) {
                delete params[this.nextViewMode.paramName];
            } else {
                params[this.nextViewMode.paramName] = this.nextViewMode.paramValue;
            }
            
            return NavigationRegistry.buildPath(cleanPath, params);
        }
    },
    methods: {
        toggle() {
            if (!this.nextViewMode) return;
            
            const cleanPath = this.containerPath.split('?')[0];
            const isOnDashboard = this.appContext?.currentPath?.split('?')[0].split('/')[0] === 'dashboard';
            
            if (isOnDashboard) {
                NavigationRegistry.dashboardRegistry.updatePath(cleanPath, this.togglePath);
            } else {
                this.navigateToPath(this.togglePath);
            }
        }
    },
    template: html`
        <button
            v-if="nextViewMode"
            class="white button-symbol"
            :title="nextViewMode.title || 'Switch view'"
            @click="toggle()"
        >
            <span class="material-symbols-outlined">{{ nextViewMode.symbol }}</span>
        </button>
    `
};