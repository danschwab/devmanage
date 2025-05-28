import { GoogleSheetsAuth, PageBuilder, ModalManager } from './index.js';

// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', async () => {    
    try {
        await GoogleSheetsAuth.initialize();
        const loadingModal = ModalManager.notify('Checking authentication...', { timeout: 0 });

        const isAuthenticated = await GoogleSheetsAuth.isAuthenticated();
        if (isAuthenticated) {
            PageBuilder.generateNavigation();
            // Let hash handler load initial page
            if (!window.location.hash) {
                window.location.hash = 'home';
            } else {
                const pageName = window.location.hash.substring(1);
                PageBuilder.loadContent(`pages/${pageName}.html`);
            }
            loadingModal.remove();
        } else {
            PageBuilder.generateLoginButton();
            window.location.hash = 'login';
            loadingModal.remove();
        }
    } catch (error) {
        PageBuilder.generateLoginButton();
        loadingModal.remove();
        ModalManager.alert('Authentication error. Please try again.');
    }
});

// Define navigation items
export let navigationItems = [
    { title: 'Home', file: 'home' },
    { title: 'Prod Sched', file: 'prod' },
    { title: 'Pack Lists', file: 'packlist' },
    { title: 'About', file: 'about' }
];