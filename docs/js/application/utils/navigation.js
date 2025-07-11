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
    navigationItems: ['dashboard', 'packlist', 'inventory', 'interfaces'],

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
    }
};
