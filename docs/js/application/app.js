import { html } from './index.js';
import { ContainerComponent, containerManager } from './index.js';
import { InventoryTableComponent } from './index.js';
import { ModalComponent, modalManager } from './index.js';
import { PrimaryNavComponent } from './index.js';
import { Auth, authState } from './index.js';
import { NavigationRegistry } from './index.js';
import { PacklistContent, InventoryContent, ScheduleContent} from './index.js';
import { hamburgerMenuRegistry } from './index.js';
import { DashboardContent } from './components/content/DashboardContent.js';

const { createApp } = Vue;

// Vue app with inline template
const App = {
    components: {
        'app-container': ContainerComponent,
        'inventory-table': InventoryTableComponent,
        'app-modal': ModalComponent,
        'primary-nav': PrimaryNavComponent,
        'packlist-content': PacklistContent,
        'inventory-content': InventoryContent,
        'schedule-content': ScheduleContent,
        'dashboard-content': DashboardContent,
    },
    provide() {
        return {
            appContext: this,
            hamburgerMenuRegistry: hamburgerMenuRegistry
        };
    },
    data() {
        return {
            appLoading: true,
            appLoadingMessage: 'Loading application...',
            isMenuOpen: false,
            navigationItems: NavigationRegistry.primaryNavigation,
            currentPage: 'dashboard',
            containers: [],
            modals: [],
            tabSystems: {},
            currentYear: new Date().getFullYear(),
            dashboardContentRef: null // Reference to DashboardContent component
        };
    },
    computed: {
        // Make auth state reactive in the component
        isAuthenticated() {
            return authState.isAuthenticated;
        },
        currentUser() {
            return authState.user;
        },
        isAuthLoading() {
            return authState.isLoading;
        },
        authError() {
            return authState.error;
        },
        dashboardLoading() {
            return this.getDashboardContent()?.dashboardStore?.isLoading;
        },
    },
    async mounted() {
        // Initialize authentication on app mount
        await Auth.initialize();

        // Initialize URL routing system
        NavigationRegistry.initializeURLRouting(this);
        
        // Add ESC key support for closing modals
        document.addEventListener('keydown', this.handleKeyDown);

        // Pass the reactive modals array to modalManager for all modal operations
        modalManager.setReactiveModals(this.modals);

        if (this.isAuthenticated) {
            // Dashboard will initialize its own store now
            // Remove direct dashboard store initialization from here
        } else {
            // Store current URL for post-login navigation if not authenticated
            NavigationRegistry.urlRouter.storeIntendedURL();
        }
        
        // Watch for auth state changes
        this.$watch('isAuthenticated', async (newVal) => {
            if (newVal) {
                // Dashboard component will handle its own initialization
                // Handle post-login URL routing
                NavigationRegistry.handlePostLogin();
            }
            NavigationRegistry.updateContainersForPage(this.currentPage, this);
        });

        // Create containers based on auth state
        NavigationRegistry.updateContainersForPage(this.currentPage, this);

        this.appLoading = false;
    },
    beforeUnmount() {
        // Clean up event listener
        document.removeEventListener('keydown', this.handleKeyDown);
    },
    methods: {
        toggleMenu() {
            this.isMenuOpen = !this.isMenuOpen;
        },
        async login() {
            try {
                Auth.login();
            } catch (error) {
                console.error('Login error:', error);
            }
        },
        async logout() {
            try {
                await Auth.logout();
                console.log('Logout successful');
                // Containers will update automatically via watcher
            } catch (error) {
                console.error('Logout error:', error);
            }
        },
        navigateToPage(pagePath) {
            NavigationRegistry.navigateToPage(pagePath, this);
        },
        navigateToPath(path) {
            NavigationRegistry.handleNavigateToPath({ targetPath: path }, this);
        },
        async addContainer(type = 'default', title = '', options = {}) {
            const container = containerManager.createContainer(type, title, options);
            
            // Set container type and page for content determination
            container.containerType = type;
            container.currentPage = this.currentPage;
            container.containerPath = options.containerPath || '';
            
            this.containers.push(container);
            return container;
        },
        removeContainer(containerId) {
            const containerToRemove = this.containers.find(c => c.id === containerId);
            
            if (this.currentPage === 'dashboard' && containerToRemove) {
                console.log('App: Removing dashboard container:', containerToRemove.containerPath || containerToRemove.containerType);
                
                const pathToRemove = containerToRemove.containerPath || containerToRemove.containerType;
                
                this.removeDashboardContainer(pathToRemove);
                // Dashboard will handle its own save via DashboardContent
            }
            
            this.containers = this.containers.filter(c => c.id !== containerId);
            containerManager.removeContainer(containerId);
            
            // If authenticated and no containers remain on a non-dashboard page, navigate to dashboard
            if (this.isAuthenticated && this.containers.length === 0 && this.currentPage !== 'dashboard') {
                this.navigateToPage('dashboard');
            }
        },

        /**
         * Get all available paths with their status
         * @returns {Array} Array of paths with isAdded status
         */
        getAllPathsWithStatus() {
            return NavigationRegistry.getAllPaths(true).map(path => ({
                path,
                isAdded: this.hasDashboardContainer(path),
                displayName: NavigationRegistry.getDisplayName(path)
            }));
        },

        expandContainer(containerData) {
            NavigationRegistry.expandContainer(containerData, this);
        },
        handleNavigateToPath(navigationData) {
            NavigationRegistry.handleNavigateToPath(navigationData, this);
        },
        createNavigateToPathHandler(containerId) {
            return NavigationRegistry.createNavigateToPathHandler(containerId, (navigationData) => {
                NavigationRegistry.handleNavigateToPath(navigationData, this);
            });
        },

        // Dashboard-related methods that delegate to DashboardContent component
        getDashboardContent() {
            return this.$refs.dashboardContent;
        },

        addDashboardContainer(containerPath, title = null) {
            const dashboardContent = this.getDashboardContent();
            if (dashboardContent) {
                return dashboardContent.addDashboardContainer(containerPath, title);
            }
        },

        removeDashboardContainer(containerPath) {
            const dashboardContent = this.getDashboardContent();
            if (dashboardContent) {
                return dashboardContent.removeDashboardContainer(containerPath);
            }
        },

        hasDashboardContainer(containerPath) {
            const dashboardContent = this.getDashboardContent();
            if (dashboardContent) {
                return dashboardContent.hasDashboardContainer(containerPath);
            }
            return false;
        },

        getDashboardContainers() {
            const dashboardContent = this.getDashboardContent();
            if (dashboardContent) {
                return dashboardContent.dashboardContainers;
            }
            return [];
        },

        /**
         * Generic property getter for module state
         * @param {string} module - Module name/key
         * @param {string} prop - Property name
         * @param {*} defaultValue - Value to return if not set
         */
        getProperty(module, prop, defaultValue = undefined) {
            if (this[module] && prop in this[module]) {
                return this[module][prop];
            }
            return defaultValue;
        },
        /**
         * Generic property setter for module state
         * @param {string} module - Module name/key
         * @param {string} prop - Property name
         * @param {*} value - Value to set
         */
        setProperty(module, prop, value) {
            if (!this[module]) this[module] = {};
            this[module][prop] = value;
        }
    },
    setup() {
        return { modalManager };
    },
    template: html `
        <div id="app">
            <!-- Primary Navigation Component -->
            <primary-nav
                :is-menu-open="isMenuOpen"
                :navigation-items="navigationItems"
                :current-page="currentPage"
                :is-authenticated="isAuthenticated"
                :is-auth-loading="isAuthLoading"
                :current-user="currentUser"
                @toggle-menu="toggleMenu"
                @navigate-to-page="navigateToPage"
                @navigate-to-path="navigateToPath"
                @login="login"
                @logout="logout">
            </primary-nav>

            <div id="app-content">
                
                <!-- App loading indicator -->
                <div v-if="!isAuthenticated" class="empty-message">
                    <p>please log in to view content</p>
                </div>
            
                <!-- App loading indicator -->
                <div v-else-if="appLoading" :class="'container' + (currentPage === 'dashboard' ? ' dashboard-card' : '')" style="display:flex; align-items: center; justify-content: center;">
                    <div class="loading-message">
                        <img src="images/loading.gif" alt="..."/>
                        <p>{{ appLoadingMessage }}</p>
                    </div>
                </div>
                
                <!-- Dashboard mount point -->
                <dashboard-content 
                    v-else-if="currentPage === 'dashboard'"
                    ref="dashboardContent"
                    @navigate-to-path="handleNavigateToPath"
                >
                </dashboard-content>
                
                <!-- Dynamic containers inserted directly here -->
                <app-container 
                    v-for="container in containers"
                    :key="container.id"
                    :ref="'container-' + container.id"
                    :container-id="container.id"
                    :container-type="container.containerType"
                    :title="container.title"
                    :container-path="container.containerPath"
                    :card-style="false"
                    :show-expand-button="false"
                    @close-container="removeContainer"
                    @navigate-to-path="handleNavigateToPath"
                    @expand-container="expandContainer"
                    v-if="currentPage !== 'dashboard' && containers.length > 0"
                >
                    <template #content>
                        <!-- Inventory Content -->
                        <inventory-content 
                            v-if="container.containerType === 'inventory' || container.containerPath?.startsWith('inventory')"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :full-path="container.fullPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)"
                        >
                        </inventory-content>
                        <!-- Packlist Content -->
                        <packlist-content 
                            v-else-if="container.containerType === 'packlist' || container.containerPath?.startsWith('packlist')"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :full-path="container.fullPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)"
                        >
                        </packlist-content>
                        
                        <!-- Schedule Content -->
                        <schedule-content 
                            v-else-if="container.containerType === 'schedule' || container.containerPath?.startsWith('schedule')"
                            :container-path="container.containerPath"
                            :full-path="container.fullPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)">
                        </schedule-content>
                        
                        <!-- Default Content -->
                        <div v-else class="empty-message">
                            <p>Empty container mounted: {{ container.id }}</p>
                        </div>
                    </template>
                </app-container>
                <footer>
                    <p>
                        &copy; {{ currentYear }} Top Shelf Exhibits
                        <br>
                        <a href="https://topshelfexhibits.com">www.topshelfexhibits.com</a>
                    </p>
                </footer>
            </div>
            <!-- Modal Space -->
            <div id="modal-space">
                <transition-group name="fade">
                    <app-modal 
                        v-for="modal in modals" 
                        :key="modal.id"
                        :modal-id="modal.id"
                        :title="modal.title"
                        :is-visible="modal.isVisible"
                        :components="modal.components"
                        :component-props="modal.componentProps"
                        @close-modal="modalManager.removeModal(modal.id)"
                    ></app-modal>
                </transition-group>
            </div>
        </div>
    `
};

// Initialize the app
const app = createApp(App);
app.mount('body');