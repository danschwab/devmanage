import { html } from '../utils/template-helpers.js';

// Container component functionality
export const ContainerComponent = {
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
        hamburgerMenuContent: {
            type: String,
            default: ''
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
        }
    },
    data() {
        return {
            isLoading: false,
            content: {
                header: '',
                main: '',
                footer: ''
            }
        };
    },
    computed: {
        pathSegments() {
            if (!this.containerPath) return [];
            return this.containerPath.split('/').filter(segment => segment.length > 0);
        },
        pathSegmentsWithNames() {
            if (!this.pathSegments.length) return [];
            
            // Map of segment IDs to human-readable names
            const segmentNames = {
                // Main pages
                'dashboard': 'Dashboard',
                'inventory': 'Inventory',
                'packlist': 'Pack Lists',
                'interfaces': 'Test Interface',
                
                // Dashboard sections
                'overview': 'Overview',
                'stats': 'Quick Stats',
                'actions': 'Quick Actions',
                
                // Inventory sections
                'categories': 'Categories',
                'search': 'Search',
                'reports': 'Reports',
                
                // Categories
                'furniture': 'Furniture',
                'electronics': 'Electronics',
                'signage': 'Signage',
                
                // Generic
                'main': 'Overview'
            };
            
            return this.pathSegments.map((segment, index) => ({
                id: segment,
                name: segmentNames[segment] || segment.charAt(0).toUpperCase() + segment.slice(1),
                index: index
            }));
        },
        breadcrumbTitle() {
            if (this.pathSegmentsWithNames.length === 0) return this.title;
            return this.pathSegmentsWithNames[this.pathSegmentsWithNames.length - 1].name;
        },
        displayTitle() {
            // Always use breadcrumb title if containerPath exists, otherwise fallback to title
            return this.containerPath ? this.breadcrumbTitle : this.title;
        },
        currentPage() {
            if (this.pathSegments.length === 0) return '';
            return this.pathSegments[0];
        },
        canGoBack() {
            if (this.pathSegments.length <= 1) return false;
            
            // Don't allow going back if the parent path would be 'dashboard'
            const parentSegments = this.pathSegments.slice(0, -1);
            if (parentSegments.length === 1 && parentSegments[0] === 'dashboard') {
                return false;
            }
            
            return true;
        },
        parentPath() {
            if (this.pathSegments.length <= 1) return '';
            return this.pathSegments.slice(0, -1).join('/');
        }
    },
    methods: {
        updateContent(section, content) {
            this.content[section] = content;
        },
        setHeaderContent(content) {
            this.content.header = content;
        },
        setMainContent(content) {
            this.content.main = content;
        },
        setFooterContent(content) {
            this.content.footer = content;
        },
        closeContainer() {
            // Emit an event to parent component to handle container removal
            this.$emit('close-container', this.containerId);
        },
        openHamburgerMenu() {
            // Check if container has custom hamburger content, otherwise use default
            const customContent = this.containerData?.customHamburgerContent || this.hamburgerMenuContent;
            
            // Emit event to parent to show modal in centralized modal-space
            this.$emit('show-hamburger-menu', {
                containerId: this.containerId,
                title: `${this.title} Menu`,
                content: customContent
            });
        },
        expandContainer() {
            // Emit event to parent to open container as a page
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
                // If no parent path, close the container
                this.closeContainer();
            }
        },
        navigateToBreadcrumb(index) {
            if (index < this.pathSegments.length - 1) {
                const targetPath = this.pathSegments.slice(0, index + 1).join('/');
                this.$emit('navigate-to-path', {
                    containerId: this.containerId,
                    targetPath: targetPath,
                    currentPath: this.containerPath
                });
            }
        }
    },
    template: html `
        <div v-if="!isLoading" 
             class="container" 
             :class="{ 'dashboard-card': cardStyle }"
             :data-container-id="containerId" 
             :data-container-type="containerType"
             :data-container-path="containerPath">
            <div v-if="containerPath || title || showCloseButton || showHamburgerMenu || showExpandButton" class="container-header">
                <!-- Breadcrumb Navigation -->
                <div v-if="containerPath" class="breadcrumb-nav">
                    <!-- Full breadcrumb path for non-card containers -->
                    <div v-if="!cardStyle" class="breadcrumb-path">
                        <template v-for="(segment, index) in pathSegmentsWithNames" :key="segment.id">
                            <span 
                                class="breadcrumb-segment"
                                :class="{ 
                                    'active': index === pathSegmentsWithNames.length - 1,
                                    'page-highlight': index === 0 
                                }"
                                @click="navigateToBreadcrumb(index)">
                                {{ segment.name }}
                            </span>
                            <span v-if="index < pathSegmentsWithNames.length - 1" class="breadcrumb-separator">/</span>
                        </template>
                    </div>
                    <!-- Current location only for dashboard cards -->
                    <h2 v-else class="breadcrumb-current">{{ displayTitle }}</h2>
                </div>
                <!-- Traditional Title (fallback) -->
                <h2 v-else-if="title">{{ displayTitle }}</h2>
                
                <div v-if="showHamburgerMenu || showExpandButton || showCloseButton || containerPath" class="header-buttons">
                    <button v-if="showHamburgerMenu" 
                            class="button-symbol gray" 
                            @click="openHamburgerMenu" 
                            title="Menu">☰</button>
                    <button v-if="showExpandButton" 
                            class="button-symbol gray" 
                            @click="expandContainer" 
                            title="Expand to page"><span class="material-symbols-outlined">expand_content</span></button>
                    <button v-if="(containerPath && canGoBack) || showCloseButton" 
                        class="button-symbol gray back-button" 
                        @click="goBack" 
                        :title="canGoBack ? 'Go back' : 'Close container'">
                        <span v-if="canGoBack" class="material-symbols-outlined">arrow_back</span>
                        <span v-else>×</span>
                    </button>
                </div>
                <div v-if="content.header" class="header-content" v-html="content.header"></div>
            </div>
            <div class="content">
                <slot name="content">
                    <div v-if="content.main" v-html="content.main"></div>
                    <div v-else>
                        <p>Container {{ containerId }} loaded successfully!</p>
                        <p>Type: {{ containerType }}</p>
                        <p>Path: {{ containerPath || 'No path' }}</p>
                    </div>
                </slot>
                <div v-if="content.footer" class="footer-content" v-html="content.footer"></div>
            </div>
        </div>
        <div v-else class="container" :class="{ 'dashboard-card': cardStyle }">
            <div class="content">
                <div class="loading-message">Loading container...</div>
            </div>
        </div>
    `
};

// Container Manager - handles multiple containers
export class ContainerManager {
    constructor() {
        this.containers = new Map();
        this.nextId = 1;
    }

    createContainer(type = 'default', title = '', options = {}) {
        const containerId = options.id || `container-${this.nextId++}`;
        
        const containerData = {
            id: containerId,
            type: type,
            title: title,
            options: options,
            cardStyle: options.cardStyle || false,
            showCloseButton: options.showCloseButton !== false, // default true
            showHamburgerMenu: options.showHamburgerMenu || false,
            hamburgerMenuContent: options.hamburgerMenuContent || '',
            showExpandButton: options.showExpandButton || false,
            pageLocation: options.pageLocation || '',
            created: new Date()
        };

        this.containers.set(containerId, containerData);
        return containerData;
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