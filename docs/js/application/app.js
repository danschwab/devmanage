import { Auth, PageBuilder, ModalManager, TabManager, TableManager, NotificationManager, NOTIFICATIONS } from '../index.js';

// Define initial navigation items
export let navigationItems = [
    { title: 'Plan', file: 'home' },
    { title: 'Pack Lists', file: 'packlist' },
    { title: 'Inventory', file: 'inventory' },
    { title: 'Test', file: 'interfaces' }
];

// initialize the application
async function init() {
    try {
        // Initialize the notification system first
        showAuthModal();
        
        // Initialize Auth system
        await Auth.init();
        
        // Check if already authenticated
        if (Auth.isSignedIn()) {
            // Already authenticated from init
            NotificationManager.publish(NOTIFICATIONS.AUTH_SUCCESS, { userInfo: Auth.getCurrentUser() });
        } else {
            // Try silent sign-in
            const success = await Auth.signIn(true);
            if (!success) {
                PageBuilder.generateNavigation();
                PageBuilder.generateLoginButton();
            }
        }

    } catch (error) {
        PageBuilder.generateLoginButton();
        ModalManager.alert('Authentication error. Please try again.');
    }

    // Initialize the tab system
    await TabManager.init();

    // Initialize drag and drop handling in tables
    await TableManager.init();
}

// Helper function to set up notification subscriptions
function showAuthModal() {
    const loadingModal = ModalManager.showLoadingIndicator('Checking authentication...');
    
    NotificationManager.subscribe(NOTIFICATIONS.AUTH_INITIALIZED, event => {
        console.log('Auth initialized:', event.data);
    });
    
    NotificationManager.subscribe(NOTIFICATIONS.AUTH_SUCCESS, event => {
        console.log('Auth success:', event.data);
        PageBuilder.generateNavigation();
        if (!window.location.hash) {
            window.location.hash = 'home';
            PageBuilder.loadContent(`home`);
        } else {
            const pageName = window.location.hash.substring(1);
            PageBuilder.loadContent(pageName);
        }
        loadingModal.hide();
    });
    
    NotificationManager.subscribe(NOTIFICATIONS.AUTH_ERROR, event => {
        console.error('Auth error:', event.data);
        PageBuilder.generateLoginButton();
        loadingModal.hide();
        ModalManager.alert('Authentication error. Please try again.');
    });
}


// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', init);