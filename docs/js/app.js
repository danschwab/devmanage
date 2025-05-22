import { GoogleSheetsAuth, PageBuilder, FormBuilder, buildTable, ModalManager } from './index.js';

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
        PageBuilder.buildPage('<div class="loading-message">Checking authentication...</div>');

        const isAuthenticated = await GoogleSheetsAuth.isAuthenticated();
        if (isAuthenticated) {
            PageBuilder.generateNavigation();
            PageBuilder.loadContent('pages/home.html');
        } else {
            PageBuilder.generateLoginButton();
            PageBuilder.loadContent('pages/login.html');
        }
    } catch (error) {
        PageBuilder.generateLoginButton();
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