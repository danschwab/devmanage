import { GoogleSheetsAuth, PageBuilder, FormBuilder, buildTable } from './index.js';

// Define navigation items
const navigationItems = [
    { title: 'Home', file: 'home.html' },
    { title: 'Search', file: 'search.html' },
    { title: 'About', file: 'about.html' }
];



// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', async () => {
    const contentDiv = document.getElementById('content');
    
    try {
        await GoogleSheetsAuth.initialize();
        contentDiv.innerHTML = '<div class="loading">Checking authentication...</div>';
        
        const isAuthenticated = await GoogleSheetsAuth.isAuthenticated();
        if (isAuthenticated) {
            await PageBuilder.generateNavigation();
            await PageBuilder.loadContent('pages/home.html');
        } else {
            generateLoginButton();
            contentDiv.innerHTML = '<div>Please log in to access the application.</div>';
        }
    } catch (error) {
        console.error('Failed to initialize authentication:', error);
        generateLoginButton();
        contentDiv.innerHTML = `
            <div class="error">
                Failed to initialize: ${error.message}
            </div>`;
    }
});