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
        'overview': 'Dashboard Overview',
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
    },

    // Primary navigation items (just IDs)
    navigationItems: ['dashboard', 'packlist', 'inventory', 'interfaces'],

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
     * Navigate to a page and return container configurations
     * @param {string} pageFile - The page to navigate to
     * @param {boolean} isAuthenticated - Whether user is authenticated
     * @returns {Object} Navigation result with containers
     */
    navigateToPage(pageFile, isAuthenticated = true) {
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
    }
};
