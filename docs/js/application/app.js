import { Auth, PageBuilder, ModalManager, TabManager, TableManager, NotificationManager, NOTIFICATIONS } from '../index.js';

// Define initial navigation items
export let navigationItems = [
    { title: 'Dashboard', file: 'dashboard' },
    { title: 'Plan', file: 'home' },
    { title: 'Pack Lists', file: 'packlist' },
    { title: 'Inventory', file: 'inventory' },
    { title: 'Test', file: 'interfaces' }
];

// initialize the application
async function init() {
    
    const appBody = document.querySelector('body');
    const appTemplate = await PageBuilder.fetchHtml('app', true);
    PageBuilder.buildPage(appTemplate, appBody, true);


    const loadingModal = ModalManager.showLoadingIndicator('Checking authentication...');
    try {
        // Initialize the notification system first
        subscribeNotifications();
        
        // Initialize Auth system
        await Auth.init();
        
        // Check if already authenticated
        if (Auth.isSignedIn()) {
            // Already authenticated from init
            NotificationManager.publish(NOTIFICATIONS.AUTH_SUCCESS, { userInfo: Auth.getCurrentUser() });
        } else {
            // User needs to authenticate interactively
            PageBuilder.generateNavigation();
            PageBuilder.generateLoginButton();
        }

    } catch (error) {
        PageBuilder.generateLoginButton();
        ModalManager.alert('Authentication error. Please try again.');
    }

    // Initialize the tab system
    await TabManager.init();

    // Initialize drag and drop handling in tables
    await TableManager.init();

    // Hide loading modal if it exists
    if (loadingModal) {
        loadingModal.hide();
    }
}



// Set up primary application notification subscriptions
function subscribeNotifications() {
    NotificationManager.subscribe(NOTIFICATIONS.AUTH_INITIALIZED, event => {
        console.log('Auth initialized:', event.data);
    });
    
    NotificationManager.subscribe(NOTIFICATIONS.AUTH_SUCCESS, async event => {
        console.log('Auth success:', event.data);
        PageBuilder.generateNavigation();
        
        // Use the openPage helper function
        await openPage();
    });
    
    NotificationManager.subscribe(NOTIFICATIONS.AUTH_ERROR, event => {
        console.error('Auth error:', event.data);
        PageBuilder.generateLoginButton();
        ModalManager.alert('Authentication error. Please try again.');
    });
}

// Helper function to open a page by name
async function openPage(pageName = null) {
    try {
        // Use current hash if no pageName provided, default to 'home'
        if (!pageName) {
            pageName = window.location.hash ? window.location.hash.substring(1) : 'home';
        }
        
        // Find the navigation item by checking both title and file properties
        const navItem = navigationItems.find(item => 
            item.file === pageName || item.title.toLowerCase() === pageName.toLowerCase()
        );
        
        // Use the found item's file or fallback to the pageName directly
        const fileName = navItem ? navItem.file : pageName;
        
        // If we couldn't find a match and it's not 'home', fallback to home
        if (!navItem && pageName !== 'home') {
            console.warn(`Page '${pageName}' not found in navigationItems, falling back to home`);
            window.location.hash = 'home';
            return await openPage('home');
        }
        
        // Update URL hash if it's different
        const pageNameWithoutExt = fileName.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
        if (window.location.hash.substring(1) !== pageNameWithoutExt) {
            window.location.hash = pageNameWithoutExt;
        }
        
        // Load and build the page
        const pageContent = await PageBuilder.fetchHtml(fileName);
        const builtContent = await PageBuilder.buildFromTemplate(pageContent);
        await PageBuilder.buildPage(builtContent);
        
    } catch (error) {
        console.error('Error loading page:', error);
        ModalManager.alert('Error loading page content');
        
        // If it wasn't home and failed, try home as last resort
        if (pageName !== 'home') {
            window.location.hash = 'home';
            return await openPage('home');
        }
    }
}

// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', init);