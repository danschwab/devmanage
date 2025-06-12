import { GoogleSheetsAuth, PageBuilder, ModalManager, TabManager, TableManager } from './index.js';

// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', async () => {    
    try {
        const loadingModal = ModalManager.showLoadingIndicator('Checking authentication...');
        await GoogleSheetsAuth.initialize();

        const isAuthenticated = await GoogleSheetsAuth.isAuthenticated();
        if (isAuthenticated) {
            PageBuilder.generateNavigation();
            if (!window.location.hash) {
                window.location.hash = 'home';
                PageBuilder.loadContent(`home`);
            } else {
                const pageName = window.location.hash.substring(1);
                PageBuilder.loadContent(pageName);
            }
        } else {
            PageBuilder.generateLoginButton();
        }
        loadingModal.hide();
    } catch (error) {
        PageBuilder.generateLoginButton();
        loadingModal.hide();
        ModalManager.alert('Authentication error. Please try again.');
    }

    // Initialize the tab system
    await TabManager.init();

    // Initialize drag and drop handling in tables
    await TableManager.init();
});

// Define navigation items
export let navigationItems = [
    { title: 'Home', file: 'home' },
    { title: 'Prod Sched', file: 'prod' },
    { title: 'Pack Lists', file: 'packlist' },
    { title: 'About', file: 'about' }
];