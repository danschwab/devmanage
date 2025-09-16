import { html, getReactiveStore, Requests, authState, NavigationRegistry, ContainerComponent, InventoryContent, PacklistContent, ScheduleContent } from '../../index.js';

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
            return this.appContext.hasDashboardContainer(this.containerPath);
        },
        isLoading() {
            return this.appContext.dashboardLoading || false;
        },
        loadingMessage() {
            return 'Dashboard updating...';
        }
    },
    methods: {
        async toggleDashboardPresence() {
            if (this.isOnDashboard) {
                // Remove from dashboard
                this.appContext.removeDashboardContainer(this.containerPath);
            } else {
                // Add to dashboard
                const displayTitle = this.title || NavigationRegistry.getDisplayName(this.containerPath, true);
                this.appContext.addDashboardContainer(this.containerPath, displayTitle);
            }
        }
    },
    template: html`
        <div style="border-top: 1px solid #ddd; margin-top: 10px; padding-top: 10px;">
            <button 
                @click="toggleDashboardPresence"
                :disabled="isLoading"
                :class="{ 'red': isOnDashboard && !isLoading, 'green': !isOnDashboard && !isLoading, 'disabled': isLoading }">
                {{ isLoading ? loadingMessage : (isOnDashboard ? 'Remove from Dashboard' : 'Add to Dashboard') }}
            </button>
        </div>
    `
};


export const DashboardContent = {
    components: {
        'app-container': ContainerComponent,
        'inventory-content': InventoryContent,
        'packlist-content': PacklistContent,
        'schedule-content': ScheduleContent
    },
    emits: ['navigate-to-path'],
    data() {
        return {
            dashboardStore: null,
            isLoading: false
        };
    },
    computed: {
        dashboardContainers() {
            const containers = this.dashboardStore?.data || [];
            console.log('[DashboardContent] Dashboard containers from store:', containers);
            return containers;
        },
        isStoreLoading() {
            return this.dashboardStore?.isLoading || false;
        },
        // Create container objects for dashboard cards
        dashboardContainerObjects() {
            if (!this.dashboardContainers.length) {
                console.log('[DashboardContent] No dashboard containers found');
                return [];
            }
            
            const containers = this.dashboardContainers.map((container, index) => ({
                id: `dashboard-${index}`,
                containerType: this.getTypeFromPath(container.path),
                title: container.title,
                containerPath: container.path,
                fullPath: container.path
            }));
            
            console.log('[DashboardContent] Generated dashboard container objects:', containers);
            return containers;
        }
    },
    async mounted() {
        this.isLoading = true;
        if (authState.isAuthenticated && authState.user?.email) {
            await this.initializeDashboardStore();
        } else {
            console.warn('[DashboardContent] User not authenticated, cannot access dashboard store');
            this.isLoading = false;
        }
    },
    methods: {
        async initializeDashboardStore() {
            try {
                // Create reactive store for dashboard state
                this.dashboardStore = getReactiveStore(
                    Requests.getUserData,
                    Requests.storeUserData,
                    [authState.user.email, 'dashboard_containers'],
                );

                // Use store data directly as dashboard containers
                if (!this.dashboardStore.data || this.dashboardStore.data.length === 0) {
                    // Initialize with defaults if no saved data
                    this.dashboardStore.setData([]);
                    console.log('[DashboardContent] No saved dashboard state found, using defaults');
                } else {
                    console.log('[DashboardContent] Dashboard state loaded from reactive store:', this.dashboardStore.data);
                }
            } catch (error) {
                console.error('[DashboardContent] Failed to initialize dashboard store:', error);
            } finally {
                this.isLoading = false;
            }
        },

        addDashboardContainer(containerPath, title = null) {
            if (!this.dashboardStore) return;
            
            const containers = this.dashboardStore.data;
            const exists = containers.some(container => container.path === containerPath);
            
            if (!exists) {
                const displayTitle = title || this.getDisplayName(containerPath);
                const newContainer = { path: containerPath, title: displayTitle };
                this.dashboardStore.addRow(newContainer);
                console.log('[DashboardContent] Added dashboard container:', newContainer);
            }
        },

        removeDashboardContainer(containerPath) {
            if (!this.dashboardStore) return;
            
            const containers = this.dashboardStore.data;
            const index = containers.findIndex(container => container.path === containerPath);
            
            if (index !== -1) {
                this.dashboardStore.markRowForDeletion(index, true);
                this.dashboardStore.removeMarkedRows();
                console.log('[DashboardContent] Removed dashboard container:', containerPath);
            }
        },

        hasDashboardContainer(containerPath) {
            if (!this.dashboardStore || !this.dashboardStore.data) {
                return false;
            }
            return this.dashboardStore.data.some(container => container.path === containerPath);
        },

        getDisplayName(containerPath, isSubPath = false) {
            // Use NavigationRegistry's existing display name logic
            return NavigationRegistry.getDisplayName(containerPath, isSubPath);
        },

        getTypeFromPath(path) {
            // Use NavigationRegistry's existing type logic
            return NavigationRegistry.getTypeFromPath(path);
        },

        getAddablePaths() {
            if (!this.dashboardStore || !this.dashboardStore.data) {
                return NavigationRegistry.getAllPaths(true); // Get sub-paths only
            }
            
            const currentPaths = this.dashboardStore.data.map(container => container.path);
            return NavigationRegistry.getAllPaths(true).filter(pathObj => 
                !currentPaths.includes(pathObj.path)
            );
        },

        syncDashboardContainers() {
            // This method can be called to ensure dashboard is in sync
            if (this.dashboardStore) {
                return this.dashboardStore.save('Syncing dashboard...');
            }
        },

        // Handle container removal from dashboard
        removeDashboardContainerCard(containerId) {
            // Find the container object by ID and get its path
            const container = this.dashboardContainerObjects.find(c => c.id === containerId);
            if (container) {
                this.removeDashboardContainer(container.containerPath);
                // Save the updated dashboard state
                this.syncDashboardContainers();
            }
        },

        // Handle container expansion (navigate to full page)
        expandDashboardContainer(containerData) {
            const targetPath = containerData.containerPath || containerData.path;
            this.$emit('navigate-to-path', targetPath);
        },

        // Create a navigation handler for each container
        createNavigateToPathHandler(containerId) {
            return (path) => {
                this.$emit('navigate-to-path', path);
            };
        }
    },
    template: html`
        <div class="dashboard-page">
            <!-- Dashboard loading indicator -->
            <div v-if="isLoading || isStoreLoading" class="container dashboard-card" style="display:flex; align-items: center; justify-content: center;">
                <div class="loading-message">
                    <img src="images/loading.gif" alt="..."/>
                    <p>Loading dashboard cards...</p>
                </div>
            </div>
            
            <!-- Dashboard containers rendered as cards -->
            <div v-else class="dashboard-content">
                <app-container 
                    v-for="container in dashboardContainerObjects"
                    :key="container.id"
                    :container-id="container.id"
                    :container-type="container.containerType"
                    :title="container.title"
                    :container-path="container.containerPath"
                    :card-style="true"
                    :show-expand-button="true"
                    @close-container="removeDashboardContainerCard"
                    @navigate-to-path="$emit('navigate-to-path', $event)"
                    @expand-container="expandDashboardContainer"
                >
                    <template #content>
                        <!-- Inventory Content -->
                        <inventory-content 
                            v-if="container.containerType === 'inventory' || container.containerPath?.startsWith('inventory')"
                            :container-path="container.containerPath"
                            :full-path="container.fullPath"
                            :navigate-to-path="createNavigateToPathHandler(container.id)"
                        >
                        </inventory-content>
                        <!-- Packlist Content -->
                        <packlist-content 
                            v-else-if="container.containerType === 'packlist' || container.containerPath?.startsWith('packlist')"
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
                            :navigate-to-path="createNavigateToPathHandler(container.id)"
                        >
                        </schedule-content>
                    </template>
                </app-container>
                
                <!-- Empty dashboard message -->
                <div v-if="dashboardContainerObjects.length === 0" class="container dashboard-card">
                    <div style="text-align: center; padding: 20px;">
                        <h3>Your Dashboard is Empty</h3>
                        <p>Navigate to any page and use the "Add to Dashboard" button to create dashboard cards.</p>
                    </div>
                </div>
            </div>
        </div>
    `
};
