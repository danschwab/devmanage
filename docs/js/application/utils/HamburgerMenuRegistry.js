import { html, DashboardToggleComponent } from '../index.js';

const { reactive } = Vue;

// Hamburger Menu Registry
export class HamburgerMenuRegistry {
    constructor() {
        this.menus = reactive(new Map());
        this.setupDefaultMenus();
    }

    setupDefaultMenus() {
        // Default fallback for containers
        this.defaultMenu = {
            components: [DashboardToggleComponent],
            props: {}
        };
    }

    registerMenu(containerType, menuConfig) {
        // Ensure all components from defaultMenu are included
        this.defaultMenu.components.forEach(component => {
            if (!menuConfig.components.includes(component)) {
                menuConfig.components = [...menuConfig.components, component];
            }
        });
        this.menus.set(containerType, menuConfig);
    }

    getMenuComponent(containerType, containerPath = '') {
        // Check for exact container type match first
        if (this.menus.has(containerType)) {
            const menu = this.menus.get(containerType);
            return {
                components: menu.components,
                props: {
                    ...menu.props,
                    containerPath,
                    currentView: this.getCurrentView(containerPath)
                }
            };
        }

        // Check for path-based matches
        if (containerPath) {
            const segments = containerPath.split('/').filter(s => s.length > 0);
            const basePath = segments[0];
            
            if (this.menus.has(basePath)) {
                const menu = this.menus.get(basePath);
                return {
                    components: menu.components,
                    props: {
                        ...menu.props,
                        containerPath,
                        currentView: this.getCurrentView(containerPath)
                    }
                };
            }
        }

        // Return default menu for all containers
        return {
            components: this.defaultMenu.components,
            props: {
                ...this.defaultMenu.props,
                containerPath: containerPath || containerType,
                title: containerType.charAt(0).toUpperCase() + containerType.slice(1)
            }
        };
    }

    getCurrentView(containerPath) {
        if (!containerPath) return '';
        const segments = containerPath.split('/').filter(s => s.length > 0);
        return segments.length > 0 ? segments[segments.length - 1] : '';
    }
}

// Create global instance
export const hamburgerMenuRegistry = new HamburgerMenuRegistry();
