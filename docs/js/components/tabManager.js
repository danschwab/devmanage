import { PageBuilder, ModalManager } from '../index.js';

export class TabManager {
    static tabCounter = 1;
    static handlers = {
        outsideClick: null,
        tabEvents: null,
        resize: null
    };
    
    static cleanup() {
        // Remove all event listeners
        if (this.handlers.outsideClick) {
            document.removeEventListener('click', this.handlers.outsideClick);
        }
        if (this.handlers.tabEvents) {
            document.removeEventListener('click', this.handlers.tabEvents);
        }
        if (this.handlers.resize) {
            window.removeEventListener('resize', this.handlers.resize);
        }
    }

    static buildTabSystem(tabNavigationWrapper, newTabHandler = null, dependencies = {}) {
        // Get the element if a string was passed in
        if (typeof tabNavigationWrapper === 'string') {
            tabNavigationWrapper = document.getElementById(tabNavigationWrapper);
        }
        if (!tabNavigationWrapper) return;

        // Create tab structure if it doesn't exist
        let tabs = tabNavigationWrapper.querySelector('.tabs');
        if (!tabs) {
            tabs = document.createElement('div');
            tabs.className = 'tabs';

            const hamburger = document.createElement('button');
            hamburger.className = 'hamburger-menu';
            hamburger.innerHTML = '<span></span><span></span><span></span>';
            tabs.appendChild(hamburger);

            if (newTabHandler) {
                const newTabBtn = document.createElement('button');
                newTabBtn.className = 'new-tab-button';
                newTabBtn.textContent = '+';
                // Store handler and dependencies
                newTabBtn.dataset.handler = JSON.stringify({
                    fn: newTabHandler.toString(),
                    dependencies
                });
                tabs.appendChild(newTabBtn);
            }

            tabNavigationWrapper.appendChild(tabs);
        }

        if (!tabNavigationWrapper.querySelector('.tab-container')) {
            const tabContainer = document.createElement('div');
            tabContainer.className = 'tab-container';
            tabNavigationWrapper.appendChild(tabContainer);
        }

        return tabNavigationWrapper;
    }

    static init() {
        // Clean up existing handlers
        this.cleanup();

        // Handle outside clicks to close menus
        this.handlers.outsideClick = (e) => {
            document.querySelectorAll('.tabs').forEach(tabs => {
                if (!tabs.contains(e.target)) {
                    tabs.classList.remove('menu-open');
                }
            });
        };
        
        // Handle window resizing
        this.handlers.resize = () => this.checkOverflow();

        // Handle tab system events
        this.handlers.tabEvents = (event) => {
            const target = event.target;
            
            if (target.matches('.tab-button')) {
                const tabName = target.getAttribute('data-tab');
                if (tabName) this.openTab(target, tabName);
            }
            else if (target.matches('.tab-close')) {
                event.stopPropagation();
                const tabName = target.parentElement.getAttribute('data-tab');
                if (tabName) this.closeTab(target, tabName);
            }
            else if (target.matches('.hamburger-menu, .hamburger-menu span')) {
                const menuButton = target.closest('.hamburger-menu');
                if (menuButton) {
                    menuButton.closest('.tabs').classList.toggle('menu-open');
                }
            }
            else if (target.matches('.new-tab-button')) {
                const handlerData = JSON.parse(target.dataset.handler);
                const handlerFn = new Function('deps', 
                    `return (${handlerData.fn}).call(this, deps)`
                );
                handlerFn(handlerData.dependencies);
            }
        };

        // Add listeners with stored handlers
        document.addEventListener('click', this.handlers.outsideClick);
        window.addEventListener('resize', this.handlers.resize);
        document.addEventListener('click', this.handlers.tabEvents);

        // Initialize overflow checking for all tab systems
        this.checkOverflow();
    }
    
    static checkOverflow(openMenu = false) {
        // this may behave strangely if there is more than one tab container in the document
        const tabsContainer = document.querySelector('.tabs');
        if (!tabsContainer) return;

        tabsContainer.classList.remove('dropdown-mode');
        // Force reflow to ensure accurate measurements
        void tabsContainer.offsetWidth;
        
        const isOverflowing = tabsContainer.scrollWidth > tabsContainer.clientWidth;
        if (isOverflowing) {
            tabsContainer.classList.add('dropdown-mode');
            if (openMenu) tabsContainer.classList.add('menu-open');
        }
        else {
            tabsContainer.classList.remove('menu-open');
        }
    }

    static openTab(button, tabName, closeMenu = true) {
        // Find the next sibling that is a tab-container
        const container = button.parentElement.nextElementSibling;
        if (!container || !container.classList.contains('tab-container')) return;
        
        // Close dropdown menu
        if (closeMenu) button.parentElement.classList.remove('menu-open');
        
        const tabContents = container.getElementsByClassName('tab-content');
        const tabButtons = button.parentElement.getElementsByClassName('tab-button');
        
        Array.from(tabContents).forEach(tab => tab.classList.remove('active'));
        Array.from(tabButtons).forEach(btn => btn.classList.remove('active'));
        
        const targetTab = container.querySelector(`#${tabName}`);
        if (targetTab) {
            targetTab.classList.add('active');
            button.classList.add('active');
        }
    }
    
    static closeTab(closeButton, tabName) {
        const tab = document.getElementById(tabName);
        if (!tab) return;
        
        const button = closeButton.parentElement;
        const allButtons = Array.from(document.getElementsByClassName('tab-button'));
        const currentIndex = allButtons.indexOf(button);
        
        tab.remove();
        button.remove();
        
        const remainingButtons = document.getElementsByClassName('tab-button');
        if (remainingButtons.length > 0) {
            const nextButton = remainingButtons[currentIndex] || 
                             remainingButtons[currentIndex - 1] || 
                             remainingButtons[0];
            
            const nextTabName = nextButton.getAttribute('data-tab');
            this.openTab(nextButton, nextTabName, false);
        }

        this.checkOverflow();
    }
    
    static addNewTab(tabNavigationWrapper, tabTitle, content, allowClose = true, tabTitleIsName = false) {
        if (typeof tabNavigationWrapper == 'string') {
            tabNavigationWrapper = document.getElementById(tabNavigationWrapper);
        }
        
        let tabName = '';
        if (tabTitleIsName) {
            // Ensure the tab name is a valid id string
            tabName = tabTitle.replace(/[^a-zA-Z0-9-_]/g, '_');
            // Check if the tab already exists
            const existingTab = document.getElementById(tabName + '-button');
            if (existingTab) {
                this.openTab(existingTab, tabName, false);
                return;
            }
        } else {
            tabName = `tab${this.tabCounter++}`;
        }
        
        // add the new tab button to the tab navigation
        const newTabButton = tabNavigationWrapper.querySelector('.new-tab-button');
        
        const tabButton = document.createElement('button');
        tabButton.className = 'tab-button';
        tabButton.setAttribute('data-tab', tabName);
        tabButton.innerHTML = `${tabTitle}${allowClose ? ' <span class="tab-close">×</span>' : ''}`;
        tabButton.id = tabName + '-button';
        
        newTabButton.parentNode.insertBefore(tabButton, newTabButton);
        
        const tabContent = document.createElement('div');
        tabContent.id = tabName;
        tabContent.className = 'tab-content';

        
        PageBuilder.buildPage(tabContent, tabNavigationWrapper.querySelector('.tab-container'), false);
        PageBuilder.buildPage(content, tabContent);
        
        this.checkOverflow(true);

        this.openTab(tabButton, tabName, false);
        
        return { tabName, tabButton, tabContent };
    }
}
