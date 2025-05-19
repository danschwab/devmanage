import { GoogleSheetsAuth, GoogleSheetsService } from '../index.js';
import { navigationItems } from '../app.js';

export class PageBuilder {
    static CACHE_SPREADSHEET_ID = '1lq3caE7Vjzit38ilGd9gLQd9F7W3X3pNIGLzbOB45aw';

    // Function to load content dynamically into the #content div
    static async loadContent(page) {
        try {
            // Cache current page before loading new one if we're on a valid page
            if (window.location.hash) {
                const userEmail = await GoogleSheetsAuth.getUserEmail();
                if (userEmail) {
                    await GoogleSheetsService.cachePage(this.CACHE_SPREADSHEET_ID);
                }
            }

            // Check for cached version of new page (valid for 1 hour)
            const cachedContent = await GoogleSheetsService.getCachedPage(this.CACHE_SPREADSHEET_ID, 60 * 60 * 1000);
            if (cachedContent) {
                await this.buildPage(cachedContent);
                return;
            }

            const cacheBuster = `?v=${new Date().getTime()}`;
            const response = await fetch(page + cacheBuster);
            if (response.ok) {
                const html = await response.text();
                // Set the location hash to the current page name (without extension)
                const pageName = page.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
                window.location.hash = pageName;
                await this.buildPage(html);
            } else {
                this.buildPage('<div class="loading-message">Error loading content.</div>');
            }
        } catch (error) {
            console.error('Error:', error);
            if (error.message.includes('auth')) {
                this.generateLoginButton();
            } else {
                this.buildPage('<div class="loading-message">Error loading content.</div>');
            }
        }
    }
    
    
    static async buildPage(content, contentDiv = null, overwrite = true) {
        // if no contentDiv passed, assume the primary page content div
        if (!contentDiv) contentDiv = document.getElementById('content');
        // allow contentDiv to be a string id value
        if (typeof contentDiv == 'string') {
            contentDiv = document.getElementById(contentDiv);
        }

        if (content instanceof HTMLElement) {
            // if content is a dom element add as a child to the tab content div.
            if (overwrite) contentDiv.innerHTML = ''; // Clear existing content
            contentDiv.appendChild(content);            
        } else if (typeof content == 'string') {
            if (!overwrite) {
                // if not overwriting, append the new content to the existing content
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = content;
                contentDiv.appendChild(tempDiv);
                // Set contentDiv to the new div to handle scripts
                contentDiv = tempDiv;
            } else {
                contentDiv.innerHTML = content;
            }
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
                    contentDiv.appendChild(newScript);
                } else {
                    const newScript = document.createElement('script');
                    newScript.textContent = script.textContent;
                    contentDiv.appendChild(newScript);
                    contentDiv.removeChild(newScript);
                }
            }
        } else {
            console.error('Content must be a string or a DOM element');
            return null;
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
                this.buildPage(`<div class="loading-message">Loading authentication...</br>A pop up blocker may have prevented google authentication from loading.</div>`,nav);

                const success = await GoogleSheetsAuth.authenticate();
                if (success) {
                    await this.generateNavigation();
                    //await this.loadContent('pages/home.html');
                } else {
                    throw new Error('Authentication failed');
                }
            } catch (error) {
                console.error('Application error:', error);
                this.generateLoginButton();
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
                this.loadContent(`pages/${item.file}`);
            };
            nav.appendChild(link);
        });

        // Add logout button
        const logoutButton = document.createElement('button');
        logoutButton.textContent = 'Log out';
        logoutButton.className = 'logout-button';
        logoutButton.onclick = async () => {
            try {
                await GoogleSheetsAuth.logout();
                this.buildPage('<div class="info-message">Successfully logged out.</div>');
                await this.generateLoginButton();
            } catch (error) {
                console.error('Logout failed:', error);
                this.buildPage('<div class="error-message">Logout failed. Please try again.</div>');
            }
        };
        nav.appendChild(logoutButton);
    }
}
