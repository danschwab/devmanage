/**
 * Centralized navigation configuration and utilities
 */
export const NavigationConfig = {
    // Human-readable names for all navigation segments
    segmentNames: {
        // Main pages
        'dashboard': 'Dashboard',
        'inventory': 'Inventory', 
        'packlist': 'Pack Lists',
        'interfaces': 'Test',
        'overview': 'Overview',
        'stats': 'Quick Stats',
        'actions': 'Quick Actions',
        
        // Inventory sections
        'categories': 'Categories',
        'search': 'Search',
        'reports': 'Reports',
        
        // Categories
        'furniture': 'Furniture',
        'electronics': 'Electronics',
        'signage': 'Signage',
        
        // Generic
        'main': 'Overview'
    },

    // Primary navigation items (just IDs)
    navigationItems: ['dashboard', 'packlist', 'inventory', 'overview', 'stats', 'actions', 'interfaces'],

    // Page-to-container mapping for navigation
    pageContainerMapping: {
        'dashboard': [
            { type: 'overview', cardStyle: true, containerPath: 'overview' },
            { type: 'stats', cardStyle: true, containerPath: 'stats' },
            { type: 'actions', cardStyle: true, containerPath: 'actions' },
            { type: 'inventory', cardStyle: true, containerPath: 'inventory' }
        ],
        'overview': [
            { type: 'overview', containerPath: 'overview' }
        ],
        'stats': [
            { type: 'stats', containerPath: 'stats' }
        ],
        'actions': [
            { type: 'actions', containerPath: 'actions' }
        ],
        'packlist': [
            { type: 'packlist', containerPath: 'packlist' }
        ],
        'inventory': [
            { type: 'inventory', containerPath: 'inventory' }
        ],
        'interfaces': [
            { type: 'test', containerPath: 'interfaces' }
        ]
    },

    /**
     * Get human-readable name for a segment ID
     */
    getSegmentName(segmentId) {
        return this.segmentNames[segmentId] || segmentId.charAt(0).toUpperCase() + segmentId.slice(1);
    },

    /**
     * Get navigation item title by file name
     */
    getNavigationTitle(file) {
        return this.getSegmentName(file);
    },

    /**
     * Get base navigation map for containers
     */
    getBaseNavigationMap() {
        const baseMap = {};
        this.navigationItems.forEach(itemId => {
            baseMap[itemId] = this.getSegmentName(itemId);
        });
        return baseMap;
    },

    /**
     * Get container configurations for a specific page
     * @param {string} pageFile - The page identifier
     * @returns {Array} Array of container configurations
     */
    getContainersForPage(pageFile) {
        return this.pageContainerMapping[pageFile] || [
            { type: 'default', containerPath: pageFile }
        ];
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

        const containers = this.getContainersForPage(pageFile);
        
        return {
            page: pageFile,
            containers: containers.map(config => ({
                ...config,
                title: config.title || '',
                options: {
                    ...config,
                    navigationMap: this.getBaseNavigationMap()
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
            if (parentPath) {
                container.containerPath = parentPath;
                return {
                    action: 'update_path',
                    containerId,
                    newPath: parentPath
                };
            } else {
                appContext.removeContainer(containerId);
                return {
                    action: 'remove_container',
                    containerId
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
