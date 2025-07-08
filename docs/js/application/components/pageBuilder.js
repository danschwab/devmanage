import { Auth, ModalManager, navigationItems } from '../../index.js';

export class PageBuilder {


    // Function to load content dynamically into the dom
    static async loadContent(pageName, template = 'container') {
        try {
            // Show loading notification
            const loadingModal = ModalManager.showLoadingIndicator();
            
            // Get the new page name for URL hash
            const pageNameWithoutExt = pageName.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
            
            try {
                const html = await this.fetchHtmlFile(pageName);
                await this.buildPage(html);
                
                // Update the URL hash on success
                window.location.hash = pageNameWithoutExt;
            } catch (fetchError) {
                console.error('Fetch error:', fetchError);
                // Redirect to 404 page but don't recurse if 404 itself fails
                if (!pageName.includes('404')) {
                    await this.loadContent('404');
                } else {
                    await ModalManager.alert('Error loading content');
                    window.location.hash = "";
                }
            }
            
            loadingModal.hide();
        } catch (error) {
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
        if (!contentDiv) contentDiv = document.getElementById('app');
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
        loginButton.className = 'login-out-button';
        loginButton.onclick = async () => {
            try {
                nav.innerHTML = `<div class="loading-message">Loading authentication...</br>A pop up blocker may have prevented google authentication from loading.</div>`;

                const success = await Auth.signIn();
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
                this.loadContent(item.file);
            };
            nav.appendChild(link);
        });
        
        // Add logout button
        const logoutButton = document.createElement('button');
        logoutButton.textContent = 'Log out';
        logoutButton.className = 'login-out-button';
        logoutButton.onclick = async () => {
            try {
                // Clear tokens and user state
                await Auth.signOut();
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


    // Helper function to fetch HTML content from a page
    static async fetchHtmlFile(pageName, source = 'pages') {
        // Ensure pageName ends with .html
        if (!pageName.endsWith('.html')) {
            pageName = `${pageName}.html`;
        }
        const page = `html/${source}/${pageName}`;
        
        const cacheBuster = `?v=${new Date().getTime()}`;
        const response = await fetch(page + cacheBuster);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${page} (${response.status})`);
        }
        
        return await response.text();
    }
}
