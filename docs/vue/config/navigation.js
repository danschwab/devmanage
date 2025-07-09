// Navigation configuration - centralized list of valid pages
export const navigationConfig = [
    { 
        title: 'Dashboard', 
        file: 'dashboard', 
        path: '/dashboard',
        icon: '📊' // Optional icons for future use
    },
    { 
        title: 'Plan', 
        file: 'home', 
        path: '/home',
        icon: '📋'
    },
    { 
        title: 'Pack Lists', 
        file: 'packlist', 
        path: '/packlist',
        icon: '📦'
    },
    { 
        title: 'Inventory', 
        file: 'inventory', 
        path: '/inventory',
        icon: '📝'
    },
    { 
        title: 'Test', 
        file: 'interfaces', 
        path: '/interfaces',
        icon: '🧪'
    }
];

// Helper function to get navigation item by path
export function getNavItemByPath(path) {
    return navigationConfig.find(item => item.path === path);
}

// Helper function to get navigation item by file name
export function getNavItemByFile(fileName) {
    return navigationConfig.find(item => item.file === fileName);
}

// Helper function to check if a path is valid
export function isValidPath(path) {
    return navigationConfig.some(item => item.path === path);
}
