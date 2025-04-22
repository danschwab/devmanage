import { FormBuilder } from './index.js';
import { buildTable } from './index.js';
import { GoogleSheetsAuth } from './index.js';

// Define navigation items
const navigationItems = [
    { title: 'Home', file: 'home.html' },
    { title: 'Search', file: 'search.html' },
    { title: 'About', file: 'about.html' }
];

// Function to generate the login button
function generateLoginButton() {
    const nav = document.getElementById('navbar');
    nav.innerHTML = ''; // Clear existing navigation
    
    const loginButton = document.createElement('button');
    loginButton.textContent = 'Log in';
    loginButton.onclick = async () => {
        try {
            await GoogleSheetsAuth.initialize();
            generateNavigation();
            loadContent('pages/home.html');
        } catch (error) {
            console.error('Login failed:', error);
        }
    };
    nav.appendChild(loginButton);
}

// Function to generate the navigation menu
function generateNavigation() {
    const nav = document.getElementById('navbar');
    nav.innerHTML = ''; // Clear existing content
    
    navigationItems.forEach(item => {
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = item.title;
        link.onclick = (e) => {
            e.preventDefault();
            loadContent(`pages/${item.file}`);
        };
        nav.appendChild(link);
    });
}

// Update the DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', async () => {
    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = '<div class="loading">Checking authentication...</div>';

    try {
        const isAuthenticated = await GoogleSheetsAuth.checkAuth();
        if (isAuthenticated) {
            generateNavigation();
            loadContent('pages/home.html');
        } else {
            generateLoginButton();
            contentDiv.innerHTML = '<div>Please log in to access the application.</div>';
        }
    } catch (error) {
        console.error('Failed to check authentication:', error);
        generateLoginButton();
        contentDiv.innerHTML = `
            <div class="error">
                Failed to check authentication: ${error.message}
            </div>`;
    }
});

// Function to load content dynamically into the #content div
async function loadContent(page) {
    const contentDiv = document.getElementById('content');
    try {
        // Check authentication before loading content
        await GoogleSheetsAuth.checkAuth();
        
        const cacheBuster = `?v=${new Date().getTime()}`; // Unique query parameter
        const response = await fetch(page + cacheBuster); // Append cache buster
        if (response.ok) {
            const html = await response.text();
            contentDiv.innerHTML = html;

            // Modified script handling for modules
            const scripts = contentDiv.querySelectorAll('script');
            for (const script of scripts) {
                if (script.type === 'module') {
                    // Handle module scripts
                    const newScript = document.createElement('script');
                    newScript.type = 'module';
                    if (script.src) {
                        newScript.src = script.src;
                    } else {
                        newScript.textContent = script.textContent;
                    }
                    document.body.appendChild(newScript);
                } else {
                    // Handle regular scripts
                    const newScript = document.createElement('script');
                    newScript.textContent = script.textContent;
                    document.body.appendChild(newScript);
                    document.body.removeChild(newScript);
                }
            }

            // Call dynamic event handlers for the loaded page
            initializeDynamicHandlers();
        } else {
            contentDiv.innerHTML = '<p>Error loading content.</p>';
        }
    } catch (error) {
        console.error('Error:', error);
        if (error.message.includes('auth')) {
            contentDiv.innerHTML = `
                <div class="error">
                    Authentication error. Please <button onclick="location.reload()">reload</button> to re-authenticate.
                </div>`;
        } else {
            contentDiv.innerHTML = '<p>Error loading content.</p>';
        }
    }
}

// Functions and event handlers added dynamically after the page loads
function initializeDynamicHandlers() {
    
    const dropdown = document.getElementById('dropdown');
    if (dropdown) {
        (async () => {
            try {
                await GoogleSheetsAuth.checkAuth();
                const response = await fetch('/getNonEmptyValues', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        sheetName: 'INVENTORY', 
                        index: 1, // Ensure this is sent as a number
                        isRow: true 
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    dropdown.innerHTML = ''; // Clear existing options
                    data.forEach(item => {
                        const option = document.createElement('option');
                        option.value = item;
                        option.textContent = item;
                        dropdown.appendChild(option);
                    });
                } else {
                    const errorText = await response.text();
                    console.error('Failed to fetch dropdown data:', errorText);
                    dropdown.innerHTML = '<option value="">Error loading data</option>';
                }
            } catch (error) {
                console.error('Error fetching dropdown data:', error);
                dropdown.innerHTML = '<option value="">Authentication error</option>';
            }
        })();
    }
    
    // Add event handler for the submit button if it exists
    const submitButton = document.getElementById('submitButton');
    if (submitButton) {
        submitButton.addEventListener('click', async () => {
            try {
                await GoogleSheetsAuth.checkAuth();
                const dataInput = document.getElementById('dataInput').value;
                const rowHeading = document.getElementById('dropdown').value;
                const resultMessage = document.getElementById('resultMessage');
                const resultData = document.getElementById('resultData');

                // Clear previous results
                resultMessage.textContent = '';
                resultData.innerHTML = '';

                if (!dataInput) {
                    resultMessage.textContent = 'Please enter some data to submit.';
                    return;
                }

                try {
                    const requestData = { 
                        sheetName: 'INVENTORY', 
                        columnTitle: rowHeading,
                        searchValue: dataInput 
                    };
                    
                    const response = await fetch('/getDataFromColumnSearchString', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestData)
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        resultMessage.textContent = 'Data retrieved successfully:';
                        
                        // Get headers from the dropdown to use as table headers
                        const headers = Array.from(document.getElementById('dropdown').options).map(opt => opt.value);
                        
                        // Build and display the table
                        const table = buildTable(result.data, headers);
                        resultData.appendChild(table);
                    } else {
                        const error = await response.text();
                        resultMessage.textContent = `Failed to retrieve data. Error: ${error}`;
                    }
                } catch (error) {
                    console.error('Error:', error);
                    resultMessage.textContent = 'An error occurred while retrieving data.';
                }
            } catch (error) {
                console.error('Error:', error);
                const resultMessage = document.getElementById('resultMessage');
                resultMessage.textContent = error.message.includes('auth') 
                    ? 'Authentication error. Please reload the page.'
                    : 'An error occurred while retrieving data.';
            }
        });
    }
}