import { PageBuilder } from '../index.js';

export class TabManager {
    static tabCounter = 1;
    
    static init() {
        const tabsContainer = document.querySelector('.tabs');
        if (!tabsContainer) return;

        // Add click handler to close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!tabsContainer.contains(e.target)) {
                tabsContainer.classList.remove('menu-open');
            }
        });

        // Check for overflow and switch to dropdown if needed
        this.checkOverflow();
        window.addEventListener('resize', () => this.checkOverflow());

        // Set up event delegation for tab container
        document.addEventListener('click', (event) => {
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
                    tabsContainer.classList.toggle('menu-open');
                }
            }
        });
    }
    
    static checkOverflow(openMenu = false) {
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
    
    static addNewTab(tabTitle, content, allowClose = true, tabName = null) {
        // Remember: if multiple tab navigations are in one dom, passing tab names into this function may yeild unexpected results.
        
        if (!tabName) {
            tabName = `tab${this.tabCounter++}`;
        } else {
            // Ensure the tab name is a valid id string
            tabName = tabName.replace(/[^a-zA-Z0-9-_]/g, '_');
            // Check if the tab already exists
            const existingTab = document.getElementById(tabName);
            if (existingTab) {
                this.openTab(existingTab, tabName + '-button', false);
                return;
            }
        }
        
        // add the new tab button to the tab navigation
        const newTabButton = document.querySelector('.new-tab-button');
        
        const tabButton = document.createElement('button');
        tabButton.className = 'tab-button';
        tabButton.setAttribute('data-tab', tabName);
        tabButton.innerHTML = `${tabTitle}${allowClose ? ' <span class="tab-close">×</span>' : ''}`;
        tabButton.id = tabName + '-button';
        
        newTabButton.parentNode.insertBefore(tabButton, newTabButton);
        
        const tabContent = document.createElement('div');
        tabContent.id = tabName;
        tabContent.className = 'tab-content';
        
        PageBuilder.buildPage(content, document.querySelector('.tab-container'));
        
        this.checkOverflow(true);

        this.openTab(tabButton, tabName, false);
        
        return { tabName, tabButton, tabContent };
    }

    static addTabNavigation(elementId, allowNewTabs = true) {
        const structure = `
        <div class="tabs">
        <button class="hamburger-menu"><span></span><span></span><span></span></button>
        ${allowNewTabs ? '<button class="new-tab-button">+</button>' : ''}
        </div>
        <div class="tab-container"></div>
        `;

        PageBuilder.buildPage(structure, elementId, false);

        this.init();
        return container;
    }
}
