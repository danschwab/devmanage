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
    { title: 'Plan', file: 'home' },
    { title: 'Pack Lists', file: 'packlist' },
    { title: 'Inventory', file: 'inventory' }
];

export const SPREADSHEET_IDS = {
    INVENTORY: '1qHAJ0FgHJjtqXiyCGohzaL1fuzdYQMF2n4YiDSc5uYE',
    PACK_LISTS: '1mPHa1lEkhHhZ7WYTDetJyUrhjwVEb3l5J1EBLcO17Z0',
    PROD_SCHED: '1BacxHxdGXSkS__ZtCv6WqgyxvTs_a2Hsv8NJnNiHU18',
    CACHE: '1lq3caE7Vjzit38ilGd9gLQd9F7W3X3pNIGLzbOB45aw'
};