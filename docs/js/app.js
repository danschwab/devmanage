import { GoogleSheetsAuth, PageBuilder, FormBuilder, buildTable } from './index.js';

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
            await PageBuilder.generateNavigation();
            await PageBuilder.loadContent('pages/home.html');
        } else {
            await PageBuilder.generateLoginButton();
            PageBuilder.buildPage('<div class="info-message">Please log in.</div>');
        }
    } catch (error) {
        await PageBuilder.generateLoginButton();
        PageBuilder.buildPage('<div class="error-message">Authentication error. Please try again.</div>');
    }
});



// Add global function for console access
window.loadPage = async (pageName) => {
    try {
        await PageBuilder.loadContent(`pages/${pageName}.html`);
    } catch (error) {
        console.error(`Failed to load page ${pageName}:`, error);
    }
};