import { ContainerComponent, containerManager } from './components/containerComponent.js';
import { TestTableComponent } from './components/testTableComponent.js';
import { ModalComponent, modalManager } from './components/modalComponent.js';
import { PrimaryNavComponent } from './components/navigation/primaryNavComponent.js';
import { Auth, authState } from './utils/auth.js';
import { NavigationConfig } from './utils/navigation.js';
import { html } from './utils/template-helpers.js';
import { 
    DashboardOverview, 
    DashboardStats, 
    DashboardActions, 
    PacklistContent, 
    InventoryContent, 
    InterfacesContent 
} from './components/content/index.js';
import { DashboardToggleComponent } from './utils/DashboardManagement.js';
import { Requests } from '../data_management/api.js';

const { createApp } = Vue;

// Create simple alert and confirm components
const AlertComponent = {
    props: {
        message: String
    },
    template: html`
        <div style="text-align: center; padding: 1rem;">
            <p>{{ message }}</p>
        </div>
    `
};

const SystemInfoComponent = {
    computed: {
        systemInfo() {
            return {
                browser: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                online: navigator.onLine ? 'Yes' : 'No'
            };
        }
    },
    template: html`
        <div style="text-align: left;">
            <h4>System Information</h4>
            <p><strong>Browser:</strong> {{ systemInfo.browser }}</p>
            <p><strong>Platform:</strong> {{ systemInfo.platform }}</p>
            <p><strong>Language:</strong> {{ systemInfo.language }}</p>
            <p><strong>Online:</strong> {{ systemInfo.online }}</p>
        </div>
    `
};

// Create combined menu components using standard Vue patterns
const CombinedMenuComponent = {
    props: {
        containerPath: String,
        title: String,
        menuType: String
    },
    components: {
        DashboardToggleComponent
    },
    inject: ['appContext'],
    computed: {
        currentView() {
            if (this.containerPath) {
                const segments = this.containerPath.split('/').filter(s => s.length > 0);
                return segments[1] || 'main';
            }
            return 'main';
        }
    },
    methods: {
        handleInventoryAction(action) {
            // Handle inventory-specific actions
            this.appContext.showAlert?.(`Action ${action} not implemented yet.`, 'Info');
        }
    },
    template: html`
        <div>
            <!-- Dashboard Management Menu -->
            <div v-if="menuType === 'dashboard-management'" style="text-align: left;">
                <h4>Dashboard Management</h4>
                <p><strong>Available Paths:</strong></p>
                <div v-for="{ path, isAdded, displayName } in appContext.getAllPathsWithStatus()" :key="path">
                    <button 
                        @click="isAdded ? appContext.removeDashboardContainer(path) : appContext.addToDashboard(path, displayName)"
                        :style="{
                            margin: '5px',
                            padding: '5px 10px',
                            background: isAdded ? '#f44336' : '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }">
                        {{ isAdded ? 'Remove' : 'Add' }} {{ displayName }}
                    </button>
                    <br>
                </div>
            </div>
            
            <!-- Inventory Menu -->
            <div v-else-if="menuType === 'inventory-menu'" style="text-align: left;">
                <h4>Inventory Actions</h4>
                <ul style="list-style: none; padding: 0;">
                    <li style="margin-bottom: 5px;">
                        <button 
                            @click="handleInventoryAction('refresh')"
                            style="width: 100%; padding: 8px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; text-align: left;">
                            Refresh Inventory
                        </button>
                    </li>
                    <li style="margin-bottom: 5px;">
                        <button 
                            @click="handleInventoryAction('add')"
                            style="width: 100%; padding: 8px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; text-align: left;">
                            Add New Item
                        </button>
                    </li>
                </ul>
                
                <!-- Add dashboard toggle for inventory -->
                <DashboardToggleComponent 
                    :container-path="containerPath"
                    :title="title" />
            </div>
            
            <!-- Default Dashboard Toggle -->
            <DashboardToggleComponent 
                v-else
                :container-path="containerPath"
                :title="title" />
        </div>
    `
};

// Vue app with inline template
const App = {
    components: {
        'app-container': ContainerComponent,
        'test-table': TestTableComponent,
        'app-modal': ModalComponent,
        'primary-nav': PrimaryNavComponent,
        'dashboard-overview': DashboardOverview,
        'dashboard-stats': DashboardStats,
        'dashboard-actions': DashboardActions,
        'packlist-content': PacklistContent,
        'inventory-content': InventoryContent,
        'interfaces-content': InterfacesContent,
        AlertComponent,
        SystemInfoComponent,
        CombinedMenuComponent,
        DashboardToggleComponent
    },
    provide() {
        return {
            appContext: this
        };
    },
    data() {
        return {
            isMenuOpen: false,
            navigationItems: NavigationConfig.navigationItems.map(itemId => ({
                title: itemId.charAt(0).toUpperCase() + itemId.slice(1),
                file: itemId
            })),
            currentPage: 'dashboard',
            containers: [],
            modals: [],
            // Make dashboard containers reactive
            dashboardContainers: [...NavigationConfig.allDashboardContainers]
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
        }
    },
    async mounted() {
        // Initialize authentication on app mount
        await Auth.initialize();
        
        // Load dashboard state from user data if authenticated
        if (this.isAuthenticated) {
            await this.loadDashboardState();
        }
        
        // Create containers based on auth state
        this.updateContainersForPage(this.currentPage);
        
        // Add ESC key support for closing modals
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Watch for auth state changes
        this.$watch('isAuthenticated', async (newVal) => {
            if (newVal) {
                await this.loadDashboardState();
            }
            this.updateContainersForPage(this.currentPage);
        });
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
                const success = await Auth.login();
                if (success) {
                    console.log('Login successful');
                    // Containers will update automatically via watcher
                } else {
                    console.error('Login failed');
                }
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
        navigateToPage(pageFile) {
            NavigationConfig.navigateToPage(pageFile, this);
        },
        async addContainer(type = 'default', title = '', options = {}) {
            const containerOptions = { ...options };
            
            const container = containerManager.createContainer(type, title, containerOptions);
            
            // Set container type and page for content determination
            container.containerType = type;
            container.currentPage = this.currentPage;
            container.containerPath = options.containerPath || '';
            
            this.containers.push(container);
            return container;
        },
        removeContainer(containerId) {
            const containerToRemove = this.containers.find(c => c.id === containerId);
            
            // If removing a dashboard container, remove it from NavigationConfig and save state
            if (this.currentPage === 'dashboard' && containerToRemove) {
                console.log('App: Removing dashboard container:', containerToRemove.containerPath || containerToRemove.containerType);
                
                // Use the container path if available, otherwise fall back to container type
                const pathToRemove = containerToRemove.containerPath || containerToRemove.containerType;
                
                // Update both the NavigationConfig and reactive data
                NavigationConfig.removeDashboardContainer(pathToRemove);
                this.dashboardContainers = [...NavigationConfig.allDashboardContainers];
                
                // Save the updated dashboard state
                this.saveDashboardState();
                
                console.log('App: Dashboard containers after removal:', this.dashboardContainers);
            }
            
            this.containers = this.containers.filter(c => c.id !== containerId);
            containerManager.removeContainer(containerId);
            
            // If authenticated and no containers remain on a non-dashboard page, navigate to dashboard
            if (this.isAuthenticated && this.containers.length === 0 && this.currentPage !== 'dashboard') {
                this.navigateToPage('dashboard');
            }
        },

        /**
         * Load dashboard state from user data
         */
        async loadDashboardState() {
            if (!this.isAuthenticated || !this.currentUser?.email) {
                return;
            }
            
            try {
                const savedDashboardData = await Requests.getUserData(this.currentUser.email, 'dashboard_containers');
                
                if (savedDashboardData && savedDashboardData.length > 0) {
                    // Parse the saved dashboard containers
                    const savedContainers = JSON.parse(savedDashboardData[0] || '[]');
                    
                    // Update NavigationConfig and reactive data
                    NavigationConfig.allDashboardContainers = savedContainers;
                    this.dashboardContainers = [...savedContainers];
                    
                    console.log('Dashboard state loaded:', savedContainers);
                } else {
                    console.log('No saved dashboard state found, using defaults');
                }
            } catch (error) {
                console.error('Failed to load dashboard state:', error);
                // Continue with default dashboard state on error
            }
        },

        /**
         * Save current dashboard state to user data
         */
        async saveDashboardState() {
            if (!this.isAuthenticated || !this.currentUser?.email) {
                return;
            }
            
            try {
                const dashboardData = JSON.stringify(this.dashboardContainers);
                await Requests.storeUserData(this.currentUser.email, 'dashboard_containers', [dashboardData]);
                console.log('Dashboard state saved successfully');
            } catch (error) {
                console.warn('Failed to save dashboard state (continuing without saving):', error.message);
                // Show a non-intrusive notification to the user
                this.showAlert?.('Dashboard preferences could not be saved. Your changes will apply for this session only.', 'Warning');
                // Don't throw the error - let the application continue functioning
                // The dashboard state will still work in memory for the current session
            }
        },

        /**
         * Remove a container from the dashboard and refresh if on dashboard
         * @param {string} containerPath - The container path to remove
         */
        removeDashboardContainer(containerPath) {
            console.log('App: removeDashboardContainer called with:', containerPath);
            console.log('App: Dashboard containers before removal:', this.dashboardContainers);
            
            // Update both the NavigationConfig and reactive data
            NavigationConfig.removeDashboardContainer(containerPath);
            this.dashboardContainers = [...NavigationConfig.allDashboardContainers];
            
            console.log('App: Dashboard containers after removal:', this.dashboardContainers);
            
            // Save the updated state
            this.saveDashboardState();
            
            // If currently on dashboard, refresh to remove the container
            if (this.currentPage === 'dashboard') {
                this.updateContainersForPage('dashboard');
            }
        },

        /**
         * Add a container to the dashboard and refresh if on dashboard
         * @param {string} containerPath - The container path to add
         * @param {string} title - The title for the container (optional)
         */
        addToDashboard(containerPath, title = null) {
            console.log('App: addToDashboard called with:', containerPath, title);
            console.log('App: Dashboard containers before addition:', this.dashboardContainers);
            
            // Update both the NavigationConfig and reactive data
            NavigationConfig.addDashboardContainer(containerPath, title);
            this.dashboardContainers = [...NavigationConfig.allDashboardContainers];
            
            console.log('App: Dashboard containers after addition:', this.dashboardContainers);
            
            // Save the updated state
            this.saveDashboardState();
            
            // If currently on dashboard, refresh to show the new container
            if (this.currentPage === 'dashboard') {
                this.updateContainersForPage('dashboard');
            }
        },

        /**
         * Get paths that can be added to dashboard
         * @returns {Array} Array of addable paths
         */
        getAddablePaths() {
            return NavigationConfig.getAddablePaths();
        },

        /**
         * Get all available paths with their status
         * @returns {Array} Array of paths with isAdded status
         */
        getAllPathsWithStatus() {
            const allPaths = NavigationConfig.getAvailablePaths();
            // Use reactive dashboardContainers instead of NavigationConfig directly
            return allPaths.map(path => ({
                path,
                isAdded: this.dashboardContainers.some(container => container.path === path),
                displayName: NavigationConfig.getDisplayNameForPath(path)
            }));
        },

        async updateContainersForPage(pageFile) {
            await NavigationConfig.updateContainersForPage(pageFile, this);
        },
        handleKeyDown(event) {
            if (event.key === 'Escape') {
                // Close all modals on ESC
                this.modals.forEach(modal => {
                    if (modal.isVisible) {
                        this.hideModal(modal.id);
                    }
                });
            }
        },
        // Modal management methods
        addModal(title = '', component = null, options = {}) {
            const modal = modalManager.createModal(title, component, options);
            this.modals.push(modal);
            return modal;
        },
        showModal(modalId) {
            const modal = modalManager.showModal(modalId);
            if (modal) {
                // Update the modal in the reactive array
                const index = this.modals.findIndex(m => m.id === modalId);
                if (index !== -1) {
                    this.modals[index].isVisible = true;
                }
                console.log('Modal shown:', modalId, this.modals[index]);
            }
            return modal;
        },
        hideModal(modalId) {
            const modal = modalManager.hideModal(modalId);
            if (modal) {
                // Update the modal in the reactive array
                const index = this.modals.findIndex(m => m.id === modalId);
                if (index !== -1) {
                    this.modals[index].isVisible = false;
                }
            }
            return modal;
        },
        removeModal(modalId) {
            this.modals = this.modals.filter(m => m.id !== modalId);
            modalManager.removeModal(modalId);
        },
        // Quick modal creation methods
        showAlert(message, title = 'Alert') {
            const modal = this.addModal(title, AlertComponent, {
                componentProps: { message }
            });
            this.showModal(modal.id);
            return modal;
        },
        showConfirm(message, title = 'Confirm') {
            return this.showAlert(message, title);
        },
        showHamburgerMenuModal(menuData) {
            console.log('showHamburgerMenuModal called with:', menuData);
            
            let modalComponent;
            let componentProps;
            
            if (menuData.menuType === 'combined' && menuData.customComponent) {
                // Create a combined component with both custom content and dashboard toggle
                modalComponent = {
                    components: {
                        CustomContent: menuData.customComponent.component,
                        DashboardToggleComponent
                    },
                    inject: ['appContext'],
                    template: html`
                        <div>
                            <CustomContent v-bind="customProps" />
                            <DashboardToggleComponent 
                                :container-path="containerPath"
                                :title="title" />
                        </div>
                    `,
                    data() {
                        return {
                            customProps: menuData.customComponent.props || {},
                            containerPath: menuData.containerPath,
                            title: menuData.title
                        };
                    }
                };
                componentProps = {};
            } else if (menuData.customComponent && menuData.customComponent.component) {
                // Use custom component only
                modalComponent = menuData.customComponent.component;
                componentProps = menuData.customComponent.props || {};
                console.log('Using custom component:', modalComponent);
                console.log('With props:', componentProps);
            } else {
                // Fallback to the combined menu component
                modalComponent = CombinedMenuComponent;
                componentProps = {
                    containerPath: menuData.containerPath,
                    title: menuData.title,
                    menuType: menuData.menuType
                };
            }
            
            const modal = this.addModal(
                menuData.title,
                modalComponent,
                {
                    componentProps: componentProps
                }
            );
            console.log('Modal created:', modal);
            this.showModal(modal.id);
        },

        // Remove all unused hamburger menu action handlers since they're not used anymore
        showSystemInfo() {
            this.addModal('System Information', SystemInfoComponent);
        },

        expandContainer(containerData) {
            NavigationConfig.expandContainer(containerData, this);
        },
        handleNavigateBack(navigationData) {
            NavigationConfig.handleNavigateBack(navigationData, this);
        },
        handleNavigateToPath(navigationData) {
            NavigationConfig.handleNavigateToPath(navigationData, this);
        },
        createNavigateToPathHandler(containerId) {
            return NavigationConfig.createNavigateToPathHandler(containerId, (navigationData) => {
                NavigationConfig.handleNavigateToPath(navigationData, this);
            });
        },
        /**
         * Handle navigation mapping added by a container
         */
        handleNavigationMappingAdded(mappingData) {
            const { segmentId, displayName } = mappingData;
            
            // Add to container manager's global map
            containerManager.addGlobalNavigationMapping(segmentId, displayName);
        }
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
                @login="login"
                @logout="logout">
            </primary-nav>

            <div id="app-content">
                <!-- Show auth error if present -->
                <div v-if="authError" class="error-message" style="background: #ffebee; border: 1px solid #f44336; padding: 1rem; margin: 1rem; border-radius: 4px; color: #c62828;">
                    <strong>Authentication Error:</strong> {{ authError }}
                    <button @click="authError = null" style="float: right; background: none; border: none; font-size: 1.2em; cursor: pointer;">&times;</button>
                </div>

                <!-- Dynamic containers inserted directly here -->
                <app-container 
                    v-for="container in containers" 
                    :key="container.id"
                    :ref="'container-' + container.id"
                    :container-id="container.id"
                    :container-type="container.containerType"
                    :title="container.title"
                    :container-path="container.containerPath"
                    :navigation-map="container.navigationMap"
                    :card-style="currentPage === 'dashboard'"
                    :show-close-button="container.containerType !== 'overview'"
                    :show-hamburger-menu="true"
                    :show-expand-button="currentPage === 'dashboard' && container.containerType !== 'overview'"
                    :page-location="container.pageLocation"
                    :container-data="container"
                    :app-context="{ 
                        addToDashboard, 
                        removeDashboardContainer, 
                        dashboardContainers,
                        showAlert
                    }"
                    @close-container="removeContainer"
                    @navigate-back="handleNavigateBack"
                    @navigate-to-path="handleNavigateToPath"
                    @navigation-mapping-added="handleNavigationMappingAdded"
                    @show-hamburger-menu="showHamburgerMenuModal"
                    @expand-container="expandContainer">

                    <template #content>
                        <!-- Overview Content -->
                        <dashboard-overview 
                            v-if="container.containerType === 'overview'"
                            :current-user="currentUser"
                            :get-all-paths-with-status="getAllPathsWithStatus"
                            :add-to-dashboard="addToDashboard"
                            :remove-dashboard-container="removeDashboardContainer"
                            @custom-hamburger-content="$event => { console.log('App: custom-hamburger-content from overview:', $event); container.customHamburgerContent = $event; }"
                            @custom-hamburger-component="$event => { console.log('App: custom-hamburger-component from overview:', $event); container.customHamburgerComponent = $event; $refs['container-' + container.id]?.[0]?.onCustomHamburgerComponent($event); }">
                        </dashboard-overview>
                        
                        <!-- Stats Content -->
                        <dashboard-stats 
                            v-else-if="container.containerType === 'stats'">
                        </dashboard-stats>
                        
                        <!-- Actions Content -->
                        <dashboard-actions 
                            v-else-if="container.containerType === 'actions'"
                            :navigate-to-page="navigateToPage"
                            :add-container="addContainer"
                            :show-alert="showAlert"
                            :show-confirm="showConfirm">
                        </dashboard-actions>
                        
                        <!-- Packlist Content -->
                        <packlist-content 
                            v-else-if="container.containerType === 'packlist'"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)">
                        </packlist-content>
                        
                        <!-- Inventory Content -->
                        <inventory-content 
                            v-else-if="container.containerType === 'inventory' || container.containerPath?.startsWith('inventory')"
                            :show-alert="showAlert"
                            :container-path="container.containerPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)"
                            @custom-hamburger-component="$event => { 
                                console.log('App: Received custom-hamburger-component from inventory:', $event);
                                $nextTick(() => {
                                    const refKey = 'container-' + container.id;
                                    const containerRef = $refs[refKey];
                                    console.log('Container ref lookup result:', containerRef);
                                    console.log('Looking for ref key:', refKey);
                                    console.log('Available refs:', Object.keys($refs));
                                    
                                    if (containerRef && containerRef.length > 0) {
                                        console.log('App: Calling onCustomHamburgerComponent on container (array)');
                                        containerRef[0].onCustomHamburgerComponent($event);
                                    } else if (containerRef && typeof containerRef.onCustomHamburgerComponent === 'function') {
                                        console.log('App: Calling onCustomHamburgerComponent on container (direct)');
                                        containerRef.onCustomHamburgerComponent($event);
                                    } else {
                                        console.error('App: Could not find container ref or method for', container.id);
                                    }
                                });
                            }">
                        </inventory-content>
                        
                        <!-- Interfaces Content -->
                        <interfaces-content 
                            v-else-if="container.containerType === 'interfaces'">
                        </interfaces-content>
                        
                        <!-- Default Content -->
                        <div v-else class="default-container">
                            <p>Container {{ container.id }} loaded successfully!</p>
                            <p>Type: {{ container.containerType }}</p>
                            <p>Path: {{ container.containerPath || 'No path' }}</p>
                        </div>
                    </template>
                </app-container>
                <footer>
                    <p>
                        &copy; 2024 Top Shelf Exhibits
                        <br>
                        <a href="https://topshelfexhibits.com">www.topshelfexhibits.com</a>
                    </p>
                </footer>
            </div>
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
                    :component="modal.component"
                    :component-props="modal.componentProps"
                    @close-modal="removeModal">
                </app-modal>
            </transition-group>
        </div>
    `
};

// Initialize the app
const app = createApp(App);
app.mount('body');