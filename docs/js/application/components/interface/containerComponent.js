import { html, BreadcrumbComponent, modalManager } from '../../index.js';

// Container component functionality
export const ContainerComponent = {
    components: {
        BreadcrumbComponent
    },
    props: {
        containerId: {
            type: String,
            required: true
        },
        containerType: {
            type: String,
            default: 'default'
        },
        title: {
            type: String,
            default: ''
        },
        containerPath: {
            type: String,
            default: ''
        },
        cardStyle: {
            type: Boolean,
            default: false
        },
        showCloseButton: {
            type: Boolean,
            default: true
        },
        showHamburgerMenu: {
            type: Boolean,
            default: false
        },
        showExpandButton: {
            type: Boolean,
            default: false
        },
        pageLocation: {
            type: String,
            default: ''
        },
        containerData: {
            type: Object,
            default: () => ({})
        },
        navigationMap: {
            type: Object,
            default: () => ({})
        },
        appContext: {
            type: Object,
            default: () => ({})
        }
    },
    inject: ['hamburgerMenuRegistry'],
    data() {
        return {
            isLoading: false // now managed reactively by this component
        };
    },
    mounted() {
        console.log('ContainerComponent: Mounted container', this.containerId, 'type:', this.containerType);
    },
    computed: {
        canGoBack() {
            if (!this.containerPath) return false;
            const pathSegments = this.containerPath.split('/').filter(segment => segment.length > 0);
            if (pathSegments.length <= 1) return false;
            
            const parentSegments = pathSegments.slice(0, -1);
            if (parentSegments.length === 1 && parentSegments[0] === 'dashboard') {
                return false;
            }
            
            return true;
        },
        parentPath() {
            if (!this.containerPath) return '';
            const pathSegments = this.containerPath.split('/').filter(segment => segment.length > 0);
            if (pathSegments.length <= 1) return '';
            return pathSegments.slice(0, -1).join('/');
        },
        // Get hamburger menu component from registry
        hamburgerMenuComponent() {
            return this.hamburgerMenuRegistry.getMenuComponent(this.containerType, this.containerPath);
        },
        backButtonIcon() {
            return this.canGoBack ? 'arrow_back' : '×';
        },
        backButtonTitle() {
            return this.canGoBack ? 'Go back' : 'Close to dashboard';
        }
    },
    methods: {
        setLoading(val) {
            this.isLoading = val;
        },
        closeContainer() {
            this.$emit('close-container', this.containerId);
        },
        openHamburgerMenu() {
            console.log('ContainerComponent: Opening hamburger menu for', this.containerType);
            
            if (this.hamburgerMenuComponent) {
                /*const menuData = {
                    containerId: this.containerId,
                    title: `${this.title} Menu`,
                    containerPath: this.containerPath,
                    components: this.hamburgerMenuComponent.components,
                    props: this.hamburgerMenuComponent.props
                };
                this.$emit('show-hamburger-menu', menuData);
                console.log('showHamburgerMenuModal called with:', menuData);*/
                
                const modal = modalManager.createModal(
                    `${this.title} Menu`,
                    this.hamburgerMenuComponent.components,
                    {
                        componentProps: this.hamburgerMenuComponent.props || {}
                    }
                );
                console.log('Modal created:', modal);
                modalManager.showModal(modal.id);
            }
        },
        expandContainer() {
            this.$emit('expand-container', {
                containerId: this.containerId,
                title: this.title,
                containerType: this.containerType,
                pageLocation: this.pageLocation,
                containerPath: this.containerPath
            });
        },
        goBack() {
            if (this.canGoBack) {
                this.$emit('navigate-back', {
                    containerId: this.containerId,
                    parentPath: this.parentPath,
                    currentPath: this.containerPath
                });
            } else {
                this.$emit('navigate-to-path', {
                    containerId: this.containerId,
                    targetPath: 'dashboard',
                    currentPath: this.containerPath
                });
            }
        },
        onNavigationMappingAdded(event) {
            this.$emit('navigation-mapping-added', event);
        },
        onNavigateToPath(event) {
            this.$emit('navigate-to-path', event);
        }
    },
    template: html `
        <div class="container" :class="{ 'dashboard-card': cardStyle }">
            <div v-if="containerPath || title || cardStyle || shouldShowHamburgerMenu || showExpandButton || !cardStyle" class="container-header">
                <BreadcrumbComponent
                    :container-path="containerPath"
                    :title="title"
                    :card-style="cardStyle"
                    :navigation-map="navigationMap"
                    :container-id="containerId"
                    @navigation-mapping-added="onNavigationMappingAdded"
                    @navigate-to-path="onNavigateToPath" />
                
                <div v-if="!!this.hamburgerMenuComponent || showExpandButton || (!cardStyle && canGoBack)" class="header-buttons">
                    <button v-if="!!this.hamburgerMenuComponent" 
                            class="button-symbol white" 
                            @click="openHamburgerMenu" 
                            title="Menu">☰</button>
                    <button v-if="showExpandButton" 
                            class="button-symbol white" 
                            @click="expandContainer" 
                            title="Expand to page"><span class="material-symbols-outlined">expand_content</span></button>
                    <button v-if="!cardStyle" 
                            class="button-symbol white back-button" 
                            @click="goBack" 
                            :title="backButtonTitle">
                        <span v-if="canGoBack" class="material-symbols-outlined">{{ backButtonIcon }}</span>
                        <span v-else>{{ backButtonIcon }}</span>
                    </button>
                </div>
            </div>
            
            
            <div class="content">
                <div v-if="isLoading" class="loading-message" style="text-align:center; padding:2rem;">
                    <img src="images/loading.gif" alt="..."/>
                    <p>Loading data...</p>
                </div>
                <slot v-else name="content">
                    <div>
                        <p>Container {{ containerId }} loaded successfully!</p>
                        <p>Type: {{ containerType }}</p>
                        <p>Path: {{ containerPath || 'No path' }}</p>
                    </div>
                </slot>
            </div>
        </div>
    `
};

// Container Manager - handles multiple containers
export class ContainerManager {
    constructor() {
        this.containers = new Map();
        this.nextId = 1;
        // Shared navigation mappings across all containers
        this.globalNavigationMap = {};
    }

    createContainer(type = 'default', title = '', options = {}) {
        const containerId = options.id || `container-${this.nextId++}`;
        
        const containerData = {
            id: containerId,
            type: type,
            title: title,
            options: options,
            cardStyle: options.cardStyle || false,
            showCloseButton: options.showCloseButton !== false,
            showHamburgerMenu: options.showHamburgerMenu || false,
            showExpandButton: options.showExpandButton || false,
            pageLocation: options.pageLocation || '',
            // Pass current global navigation map to new container
            navigationMap: { ...this.globalNavigationMap, ...(options.navigationMap || {}) },
            created: new Date()
        };

        this.containers.set(containerId, containerData);
        return containerData;
    }

    /**
     * Add navigation mapping to global map and propagate to all containers
     */
    addGlobalNavigationMapping(segmentId, displayName) {
        this.globalNavigationMap[segmentId] = displayName;
        
        // Propagate to all existing containers
        this.containers.forEach(container => {
            if (container.navigationMap) {
                container.navigationMap[segmentId] = displayName;
            }
        });
    }

    removeContainer(containerId) {
        return this.containers.delete(containerId);
    }

    getContainer(containerId) {
        return this.containers.get(containerId);
    }

    getAllContainers() {
        return Array.from(this.containers.values());
    }

    clearAllContainers() {
        this.containers.clear();
        this.nextId = 1;
    }
}

// Create a global instance
export const containerManager = new ContainerManager();