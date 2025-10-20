import { html } from './index.js';
import { ContainerComponent } from './index.js';
import { ModalComponent, modalManager } from './index.js';
import { PrimaryNavComponent } from './index.js';
import { Auth, authState } from './index.js';
import { NavigationRegistry } from './index.js';
import { PacklistContent, InventoryContent, ScheduleContent} from './index.js';
import { hamburgerMenuRegistry } from './index.js';

const { createApp } = Vue;

// Vue app with inline template
const App = {
    components: {
        'app-container': ContainerComponent,
        'app-modal': ModalComponent,
        'primary-nav': PrimaryNavComponent,
        'packlist-content': PacklistContent,
        'inventory-content': InventoryContent,
        'schedule-content': ScheduleContent,
    },
    provide() {
        return {
            appContext: this,
            hamburgerMenuRegistry: hamburgerMenuRegistry,
            $modal: modalManager
        };
    },
    data() {
        return {
            appLoading: true,
            appLoadingMessage: 'Loading application...',
            isMenuOpen: false,
            navigationItems: NavigationRegistry.primaryNavigation,
            currentPage: 'dashboard',
            currentPath: 'dashboard',
            modals: [],
            currentYear: new Date().getFullYear()
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
            return NavigationRegistry.dashboardRegistry.isLoading;
        },
        // Reactive containers based on current page and authentication state
        containers() {
            if (!authState.isAuthenticated) {
                return [];
            }
            
            if (this.currentPage === 'dashboard') {
                const containers = NavigationRegistry.dashboardRegistry.containers || [];
                return containers.map(container => {
                    const containerId = typeof container === 'string' ? container : container.path;
                    const containerClasses = typeof container === 'string' ? '' : (container.classes || '');
                    const type = NavigationRegistry.getTypeFromPath(containerId);
                    return {
                        key: `${type}-${containerId.replace(/[^a-zA-Z0-9]/g, '_')}`,
                        path: containerId,
                        type,
                        title: NavigationRegistry.getDisplayName(containerId),
                        containerPath: containerId,
                        cardStyle: true,
                        cardClasses: ` ${containerClasses}`,
                        showExpandButton: true
                    };
                });
            } else {
                const type = NavigationRegistry.getTypeFromPath(this.currentPath);
                return [{
                    key: `${type}-${this.currentPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    path: this.currentPath,
                    type,
                    title: NavigationRegistry.getDisplayName(this.currentPath),
                    containerPath: this.currentPath,
                    cardStyle: false,
                    cardClasses: '',
                    showExpandButton: false
                }];
            }
        }
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
            // Initialize dashboard registry if authenticated
            await NavigationRegistry.initializeDashboard();
            
            // Apply current URL state if user is already authenticated
            const currentUrl = NavigationRegistry.urlRouter.getCurrentURLPath();
            if (currentUrl && currentUrl !== 'dashboard') {
                NavigationRegistry.handleNavigateToPath({ 
                    targetPath: currentUrl, 
                    isBrowserNavigation: true 
                }, this);
            }
        }
        
        // Watch for auth state changes
        this.$watch('isAuthenticated', async (newVal) => {
            if (newVal) {
                NavigationRegistry.initializeDashboard();
                
                // Apply current URL when user logs in
                const currentUrl = NavigationRegistry.urlRouter.getCurrentURLPath();
                if (currentUrl && currentUrl !== 'dashboard') {
                    NavigationRegistry.handleNavigateToPath({ 
                        targetPath: currentUrl, 
                        isBrowserNavigation: true 
                    }, this);
                }
            }
        });

        this.appLoading = false;
    },
    beforeUnmount() {
        // Clean up event listener
        document.removeEventListener('keydown', this.handleKeyDown);
        
        // Save any pending dashboard changes before unmounting
        NavigationRegistry.dashboardRegistry.saveNow();
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
        navigateToPath(pathOrData) {
            // Handle both string paths and navigation data objects
            const targetPath = typeof pathOrData === 'string' ? pathOrData : pathOrData.targetPath;
            NavigationRegistry.handleNavigateToPath({ targetPath }, this);
        },
        
        // Handle container expansion by navigating to its path
        expandContainer(containerData) {
            const targetPath = containerData.containerPath || containerData.path;
            this.navigateToPath(targetPath);
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
                @navigate-to-path="navigateToPath"
                @login="login"
                @logout="logout">
            </primary-nav>

            <div id="app-content" :class="{ 'dashboard': currentPage === 'dashboard' }">
                <!-- App loading indicator -->
                <div v-if="!isAuthenticated" class="empty-message">
                    please log in to view content
                </div>
                
                <!-- App loading indicator -->
                <div v-else-if="appLoading" :class="'container' + (currentPage === 'dashboard' ? ' dashboard-card' : '')" style="display:flex; align-items: center; justify-content: center;">
                    <div class="loading-message">
                        <img src="images/loading.gif" alt="..."/>
                        <p>{{ appLoadingMessage }}</p>
                    </div>
                </div>
                
                <!-- Dashboard loading indicators -->
                <div v-else-if="dashboardLoading && currentPage === 'dashboard'" class="container dashboard-card" style="display:flex; align-items: center; justify-content: center;">
                    <div class="loading-message">
                        <img src="images/loading.gif" alt="..."/>
                        <p>loading dashboard...</p>
                    </div>
                </div>

                <!-- No containers message -->
                <div v-else-if="containers.length === 0" class="empty-message">
                    open a page to see content
                </div>
                
                <!-- Reactive containers -->
                <template v-else>
                    <app-container 
                        v-for="container in containers" 
                        :key="container.key"
                        :container-id="container.key"
                        :container-type="container.type"
                        :title="container.title"
                        :container-path="container.containerPath"
                        :card-style="container.cardStyle"
                        :card-classes="container.cardClasses"
                        :show-expand-button="container.showExpandButton"
                        @navigate-to-path="navigateToPath"
                        @expand-container="expandContainer"
                    >
                        <template #content>
                            <!-- Inventory Content -->
                            <inventory-content 
                                v-if="container.type === 'inventory' || container.containerPath?.startsWith('inventory')"
                                :container-path="container.containerPath"
                                :navigate-to-path="(path, params) => navigateToPath(params ? NavigationRegistry.buildPath(path, params) : path)"
                            >
                            </inventory-content>
                            <!-- Packlist Content -->
                            <packlist-content 
                                v-else-if="container.type === 'packlist' || container.containerPath?.startsWith('packlist')"
                                :container-path="container.containerPath"
                                :navigate-to-path="(path, params) => navigateToPath(params ? NavigationRegistry.buildPath(path, params) : path)"
                            >
                            </packlist-content>
                            
                            <!-- Schedule Content -->
                            <schedule-content 
                                v-else-if="container.type === 'schedule' || container.containerPath?.startsWith('schedule')"
                                :container-path="container.containerPath"
                                :navigate-to-path="(path, params) => navigateToPath(params ? NavigationRegistry.buildPath(path, params) : path)">
                            </schedule-content>
                        </template>
                    </app-container>
                </template>

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