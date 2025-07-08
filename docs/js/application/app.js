import { Auth, PageBuilder, ModalManager, TabManager, TableManager, NotificationManager, NOTIFICATIONS } from '../index.js';

// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', async () => {    
    try {
        const loadingModal = ModalManager.showLoadingIndicator('Checking authentication...');
        
        // Initialize the notification system first
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
                loadingModal.hide();
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
});

// Define navigation items
export let navigationItems = [
    { title: 'Plan', file: 'home' },
    { title: 'Pack Lists', file: 'packlist' },
    { title: 'Inventory', file: 'inventory' },
    { title: 'Test', file: 'interfaces' }
];

// Add login button handler
export function handleLogin() {
    Auth.signIn(false).then(success => {
        if (success) {
            location.reload();
        }
    }).catch(error => {
        console.error("Login error:", error);
        ModalManager.alert("Failed to log in. Please try again.");
    });
}

// Add logout handler
export function handleLogout() {
    Auth.signOut().then(() => {
        location.reload();
    }).catch(error => {
        console.error("Logout error:", error);
    });
}

