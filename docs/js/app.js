import { GoogleSheetsAuth, PageBuilder, ModalManager } from './index.js';

// Define navigation items
export let navigationItems = [
    { title: 'Home', file: 'home.html' },
    { title: 'Prod Sched', file: 'prod.html' },
    { title: 'Pack Lists', file: 'packlist.html' },
    { title: 'About', file: 'about.html' }
];



// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', async () => {    
    try {
        await GoogleSheetsAuth.initialize();
        const loadingModal = ModalManager.notify('Checking authentication...', { timeout: 0 });

        const isAuthenticated = await GoogleSheetsAuth.isAuthenticated();
        if (isAuthenticated) {
            PageBuilder.generateNavigation();
            PageBuilder.loadContent('pages/home.html');
            loadingModal.remove();
        } else {
            PageBuilder.generateLoginButton();
            PageBuilder.loadContent('pages/login.html');
            loadingModal.remove();
        }
    } catch (error) {
        PageBuilder.generateLoginButton();
        loadingModal.remove();
        ModalManager.alert('Authentication error. Please try again.');
    }
});



// Add global function for console access
/*
window.loadPage = async (pageName) => {
    try {
        await PageBuilder.loadContent(`pages/${pageName}.html`);
    } catch (error) {
        console.error(`Failed to load page ${pageName}:`, error);
        await ModalManager.alert(`Failed to load page ${pageName}:`);
    }
};
*/