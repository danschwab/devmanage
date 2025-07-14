/**
 * Centralized navigation configuration and utilities
 */
export const NavigationConfig = {
    // Primary navigation items (just IDs)
    navigationItems: ['dashboard', 'packlist', 'inventory', 'interfaces'],

    // Dynamic list of dashboard containers (component, location pairs)
    allDashboardContainers: [
        { type: 'overview', containerPath: 'dashboard/overview' },
        { type: 'stats', containerPath: 'dashboard/stats' },
        { type: 'actions', containerPath: 'dashboard/actions' },
        { type: 'inventory', containerPath: 'inventory' }
    ],

    /**
     * Add a dashboard container
     * @param {string} containerType - The container type to add
     * @param {string} containerPath - The container path
     */
    addDashboardContainer(containerType, containerPath) {
        // Check if container already exists
        const exists = this.allDashboardContainers.some(container => 
            container.type === containerType && container.containerPath === containerPath
        );
        
        if (!exists) {
            this.allDashboardContainers.push({ type: containerType, containerPath: containerPath });
        }
    },

    /**
     * Remove a dashboard container
     * @param {string} containerType - The container type to remove
     */
    removeDashboardContainer(containerType) {
        this.allDashboardContainers = this.allDashboardContainers.filter(container => 
            container.type !== containerType
        );
    },

    /**
     * Check if a dashboard container exists
     * @param {string} containerType - The container type to check
     * @returns {boolean} Whether the container exists
     */
    hasDashboardContainer(containerType) {
        return this.allDashboardContainers.some(container => container.type === containerType);
    },

    /**
     * Get all available container types that can be added to dashboard
     * @returns {Array} Array of available container types
     */
    getAvailableContainerTypes() {
        return ['overview', 'stats', 'actions', 'inventory', 'packlist', 'interfaces'];
    },

    /**
     * Get container types not currently on dashboard
     * @returns {Array} Array of container types that can be added
     */
    getAddableContainerTypes() {
        const currentTypes = this.allDashboardContainers.map(container => container.type);
        return this.getAvailableContainerTypes().filter(type => !currentTypes.includes(type));
    },

    /**
     * Get navigation result for a page (containers configuration)
     * @param {string} pageFile - The page to navigate to
     * @param {boolean} isAuthenticated - Whether user is authenticated
     * @returns {Object} Navigation result with containers
     */
    getNavigationResult(pageFile, isAuthenticated = true) {
        // If not authenticated, return empty containers
        if (!isAuthenticated) {
            return {
                page: pageFile,
                containers: []
            };
        }

        // Get container configurations based on page type
        let containerConfigs;
        if (pageFile === 'dashboard') {
            // Return copy of current dashboard containers
            containerConfigs = [...this.allDashboardContainers];
        } else {
            containerConfigs = [{ type: pageFile, containerPath: pageFile }];
        }
        
        return {
            page: pageFile,
            containers: containerConfigs.map(config => ({
                ...config,
                title: config.title || '',
                options: {
                    ...config
                }
            }))
        };
    },

    /**
     * Handle container expansion logic
     * @param {Object} containerData - Container data object
     * @param {string} currentPage - Current page identifier
     * @returns {Object} Expansion result with target page and action
     */
    handleContainerExpansion(containerData, currentPage) {
        // If the container has a specific page location, navigate to it
        if (containerData.pageLocation) {
            return {
                action: 'navigate',
                targetPage: containerData.pageLocation
            };
        }
        
        // For dashboard cards, navigate to the container type as a page
        const targetPage = containerData.containerType;
        
        if (targetPage !== currentPage) {
            return {
                action: 'navigate',
                targetPage: targetPage,
                containerPath: containerData.containerPath
            };
        } else {
            return {
                action: 'already_here',
                message: `You are already viewing the ${containerData.title} page.`
            };
        }
    },

    /**
     * Handle navigation back logic and execute the action
     * @param {Object} navigationData - Navigation data with containerId and parentPath
     * @param {Object} appContext - App context with containers and removeContainer method
     * @returns {Object} Navigation result with action and data
     */
    handleNavigateBack(navigationData, appContext) {
        const { containerId, parentPath } = navigationData;
        const container = appContext.containers.find(c => c.id === containerId);
        
        if (container) {
            // If previous location is dashboard, remove the container (close button behavior)
            if (parentPath === 'dashboard' || !parentPath) {
                appContext.removeContainer(containerId);
                return {
                    action: 'remove_container',
                    containerId
                };
            } else {
                container.containerPath = parentPath;
                return {
                    action: 'update_path',
                    containerId,
                    newPath: parentPath
                };
            }
        }
        
        return { action: 'no_action' };
    },

    /**
     * Handle navigation to path logic and execute the action
     * @param {Object} navigationData - Navigation data with containerId and targetPath
     * @param {Object} appContext - App context with containers
     * @returns {Object} Navigation result with action and data
     */
    handleNavigateToPath(navigationData, appContext) {
        const { containerId, targetPath, navigationMap } = navigationData;
        const container = appContext.containers.find(c => c.id === containerId);
        
        if (container) {
            // If we're on dashboard and trying to navigate to a different path,
            // navigate to that path as a new page (like expand button behavior)
            if (appContext.currentPage === 'dashboard' && targetPath !== 'dashboard') {
                // Extract the base page from the target path (e.g., 'inventory/items' -> 'inventory')
                const basePage = targetPath.split('/')[0];
                
                this.navigateToPage(basePage, appContext);
                
                // After navigation, update the container path to the full target path
                appContext.$nextTick(() => {
                    const expandedContainer = appContext.containers.find(c => c.containerType === basePage);
                    if (expandedContainer) {
                        expandedContainer.containerPath = targetPath;
                    }
                });
                
                return {
                    action: 'navigate_to_new_page',
                    containerId,
                    targetPage: basePage,
                    targetPath: targetPath
                };
            }
            
            // If navigating to dashboard, navigate to dashboard page instead of updating path
            if (targetPath === 'dashboard') {
                this.navigateToPage('dashboard', appContext);
                return {
                    action: 'navigate_to_dashboard',
                    containerId,
                    targetPage: 'dashboard'
                };
            }
            
            container.containerPath = targetPath;
            
            // Update container's navigation map if provided
            if (navigationMap) {
                container.navigationMap = { ...container.navigationMap, ...navigationMap };
            }
            
            return {
                action: 'update_path',
                containerId,
                newPath: targetPath,
                navigationMap
            };
        }
        
        return { action: 'no_action' };
    },

    /**
     * Create a navigation handler for a specific container
     * @param {string} containerId - Container ID
     * @param {Function} handleNavigateToPath - Navigation handler function
     * @returns {Function} Path navigation handler
     */
    createNavigateToPathHandler(containerId, handleNavigateToPath) {
        return (path) => {
            handleNavigateToPath({
                containerId: containerId,
                targetPath: path
            });
        };
    },

    /**
     * Navigate to a specific page (Application-level function)
     * @param {string} pageFile - Page to navigate to
     * @param {Object} appContext - App context with currentPage, isMenuOpen, updateContainersForPage
     */
    navigateToPage(pageFile, appContext) {
        appContext.currentPage = pageFile;
        appContext.isMenuOpen = false; // Close menu when navigating
        console.log(`Navigating to: ${pageFile}`);
        // Update containers based on current page
        this.updateContainersForPage(pageFile, appContext);
    },

    /**
     * Update containers for a specific page (Application-level function)
     * @param {string} pageFile - Page file identifier
     * @param {Object} appContext - App context with containers, isAuthenticated, addContainer
     */
    async updateContainersForPage(pageFile, appContext) {
        // Clear existing containers
        appContext.containers = [];
        
        // Use centralized navigation logic
        const navigationResult = this.getNavigationResult(pageFile, appContext.isAuthenticated);
        
        // Create containers based on navigation result
        for (const containerConfig of navigationResult.containers) {
            await appContext.addContainer(
                containerConfig.type,
                containerConfig.title,
                containerConfig.options
            );
        }
        
        // If authenticated and no containers were added, navigate to dashboard
        if (appContext.isAuthenticated && appContext.containers.length === 0) {
            this.navigateToPage('dashboard', appContext);
        }
    },

    /**
     * Handle container expansion (Application-level function)
     * @param {Object} containerData - Container data
     * @param {Object} appContext - App context with currentPage, showAlert
     */
    expandContainer(containerData, appContext) {
        console.log('Expanding container:', containerData);
        
        const expansionResult = this.handleContainerExpansion(containerData, appContext.currentPage);
        
        switch (expansionResult.action) {
            case 'navigate':
                this.navigateToPage(expansionResult.targetPage, appContext);
                
                // If the container has a path, update the new container to that path
                if (expansionResult.containerPath) {
                    appContext.$nextTick(() => {
                        const expandedContainer = appContext.containers.find(c => c.containerType === expansionResult.targetPage);
                        if (expandedContainer) {
                            expandedContainer.containerPath = expansionResult.containerPath;
                        }
                    });
                }
                break;
            case 'already_here':
                appContext.showAlert(expansionResult.message, 'Already Here');
                break;
        }
    }
};