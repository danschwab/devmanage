import { GoogleSheetsAuth } from '../index.js';

export class PageBuilder {
    
    // Function to load content dynamically into the #content div
    static async loadContent(page) {
        const contentDiv = document.getElementById('content');
        try {
            await GoogleSheetsAuth.checkAuth();
            
            const cacheBuster = `?v=${new Date().getTime()}`;
            const response = await fetch(page + cacheBuster);
            if (response.ok) {
                const html = await response.text();
                await buildPage(contentDiv, html);
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
    
    
    
    static async buildPage(contentDiv, html) {
        contentDiv.innerHTML = html;

        // Handle scripts in the loaded content
        const scripts = contentDiv.querySelectorAll('script');
        for (const script of scripts) {
            if (script.type === 'module') {
                const newScript = document.createElement('script');
                newScript.type = 'module';
                if (script.src) {
                    newScript.src = script.src;
                } else {
                    newScript.textContent = script.textContent;
                }
                document.body.appendChild(newScript);
            } else {
                const newScript = document.createElement('script');
                newScript.textContent = script.textContent;
                document.body.appendChild(newScript);
                document.body.removeChild(newScript);
            }
        }
    }

    // Function to generate the login button
    static async generateLoginButton() {
        const nav = document.getElementById('navbar');
        nav.innerHTML = ''; // Clear existing navigation
        
        const loginButton = document.createElement('button');
        loginButton.textContent = 'Log in';
        loginButton.onclick = async () => {
            try {
                // Create auth container
                const contentDiv = document.getElementById('content');
                contentDiv.innerHTML = `
                    <div id="google-auth-container" class="auth-container">
                        <h2>Sign in with Google</h2>
                        <p>Please wait while we initialize the sign-in process...</p>
                    </div>`;

                const success = await GoogleSheetsAuth.authenticate();
                if (success) {
                    await this.generateNavigation();
                    await this.loadContent('pages/home.html');
                } else {
                    throw new Error('Authentication failed');
                }
            } catch (error) {
                console.error('Login failed:', error);
                const contentDiv = document.getElementById('content');
                contentDiv.innerHTML = `
                    <div class="error">
                        Login failed: ${error.message}. Please try again.
                    </div>`;
            }
        };
        nav.appendChild(loginButton);
    }
    
    // Function to generate the navigation menu
    static async generateNavigation() {
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
}
