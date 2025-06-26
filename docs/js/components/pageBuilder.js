import { GoogleSheetsAuth, GoogleSheetsService, ModalManager, navigationItems } from '../index.js';

export class PageBuilder {
    static CACHE_SPREADSHEET_ID = '1lq3caE7Vjzit38ilGd9gLQd9F7W3X3pNIGLzbOB45aw';

    static async cacheCurrentPage() {
        // Disabled: do not cache page to sheets
        return;
        /*
        try {
            const contentDiv = document.getElementById('content');
            if (contentDiv?.children.length > 0) {
                const cacheId = window.location.hash.substring(1);
                await GoogleSheetsService.cacheData(this.CACHE_SPREADSHEET_ID, cacheId, contentDiv.innerHTML);
            }
        } catch (error) {
            console.error('Failed to cache page:', error);
        }
        */
    }

    // Function to load content dynamically into the #content div
    static async loadContent(pageName, cache = true) {
        try {
            // Clean up existing handlers
            //TableManager.cleanup();
            //TabManager.cleanup();
            
            // Show loading notification
            const loadingModal = ModalManager.showLoadingIndicator();
            

            // Cache current page before changing
            if (cache) {
                await this.cacheCurrentPage();
            }
            

            // Ensure pageName ends with .html
            if (!pageName.endsWith('.html')) {
                pageName = `${pageName}.html`;
            }
            const page = `pages/${pageName}`;
            
            // Get the new page name
            const pageNameWithoutExt = pageName.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
            

            // Disabled: do not load from sheets cache
            //const cachedContent = await GoogleSheetsService.getCachedData(this.CACHE_SPREADSHEET_ID, pageNameWithoutExt, 60 * 60 * 1000);
            const cachedContent = null;

            if (cachedContent) {
                //const useCache = await ModalManager.confirm('A cached version of this page exists. Would you like to load it?');
                //if (useCache) {
                    await this.buildPage(cachedContent);
                //}
            } else {
                const cacheBuster = `?v=${new Date().getTime()}`;
                const response = await fetch(page + cacheBuster);
                if (response.ok) {
                    const html = await response.text();
                    await this.buildPage(html);
                } else {
                    loadingModal.hide();
                    // Redirect to 404 page but don't recurse if 404 itself fails
                    if (!page.endsWith('404.html')) {
                        await this.loadContent('404.html', false);
                    } else {
                        await ModalManager.alert('Error loading content');
                        window.location.hash = "";
                    }
                }
            }
            
            // Update the URL hash on success
            window.location.hash = pageNameWithoutExt;
            loadingModal.hide();
        } catch (error) {
            loadingModal.hide();
            console.error('Error:', error);
            if (error.message.includes('auth')) {
                this.generateLoginButton();
            } else {
                await ModalManager.alert('Error loading page: ' + error.message);
                window.location.hash = "";
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
        } else {
            console.error('Content must be a string or a DOM element');
            return null;
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

        // Remove original script tags
        for (const script of scripts) {
            if (script.parentNode) {
                script.parentNode.removeChild(script); 
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
                nav.innerHTML = `<div class="loading-message">Loading authentication...</br>A pop up blocker may have prevented google authentication from loading.</div>`;

                // Clear any stored tokens before login
                if (window.GoogleSheetsAuth && typeof window.GoogleSheetsAuth.clearStoredToken === 'function') {
                    window.GoogleSheetsAuth.clearStoredToken();
                }

                const success = await GoogleSheetsAuth.authenticate();
                if (success) {
                    this.generateNavigation();
                    const location = window.location.hash.substring(1);
                    this.loadContent(location || 'home');
                } else {
                    throw new Error('Authentication failed');
                }
            } catch (error) {
                console.error('Application error:', error);
                ModalManager.alert('Authentication failed');
                this.generateLoginButton();
            }
        };
        nav.appendChild(loginButton);
    }
    
    // Function to generate the navigation menu
    static async generateNavigation() {
        const nav = document.getElementById('navbar');
        nav.innerHTML = '';
        
        navigationItems.forEach(item => {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = item.title;
            link.onclick = (e) => {
                e.preventDefault();
                GoogleSheetsAuth.checkAuth();
                this.loadContent(item.file);
            };
            nav.appendChild(link);
        });
        
        // Add logout button
        const logoutButton = document.createElement('button');
        logoutButton.textContent = 'Log out';
        logoutButton.className = 'logout-button';
        logoutButton.onclick = async () => {
            try {
                await this.cacheCurrentPage();
                // Clear tokens and user state
                await GoogleSheetsAuth.logout();
                if (window.GoogleSheetsAuth && typeof window.GoogleSheetsAuth.clearStoredToken === 'function') {
                    window.GoogleSheetsAuth.clearStoredToken();
                }
                this.generateLoginButton();
                // Remove hash and reload to ensure clean state
                window.location.hash = '';
                this.buildPage('')
                ModalManager.notify('Successfully logged out.', { showClose: false, timeout: 3000 });
            } catch (error) {
                console.error('Logout failed:', error);
                ModalManager.alert('Logout failed. Please try again.');
            }
        };
        nav.appendChild(logoutButton);
    }
}
