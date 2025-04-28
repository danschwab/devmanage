import { GoogleSheetsAuth, PageBuilder, FormBuilder, buildTable } from './index.js';

// Define navigation items
const navigationItems = [
    { title: 'Home', file: 'home.html' },
    { title: 'Search', file: 'search.html' },
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
        }
    } catch (error) {
        await PageBuilder.generateLoginButton();
        PageBuilder.buildPage('<div class="error-message">Authentication error. Please try again.</div>');
    }
});