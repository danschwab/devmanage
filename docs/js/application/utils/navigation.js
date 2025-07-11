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
        
        // Dashboard sections
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
    navigationItems: ['dashboard', 'packlist', 'inventory', 'interfaces'],

    // Component type to page mapping for expansion
    componentPageMapping: {
        'dashboard-overview': 'dashboard',
        'dashboard-stats': 'inventory',
        'dashboard-actions': 'dashboard',
        'dashboard-inventory': 'inventory',
        'test': 'interfaces'
    },

    // Component type to container path mapping for dashboard cards
    dashboardComponentPaths: {
        'dashboard-overview': 'dashboard',
        'dashboard-stats': 'inventory',
        'dashboard-actions': 'dashboard',
        'dashboard-inventory': 'inventory'
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
     * Get target page for component expansion
     */
    getExpandTargetPage(containerType) {
        return this.componentPageMapping[containerType] || containerType;
    },

    /**
     * Get dashboard component path
     */
    getDashboardComponentPath(containerType) {
        return this.dashboardComponentPaths[containerType] || 'dashboard';
    }
};
