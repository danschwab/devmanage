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
        showExpandButton: {
            type: Boolean,
            default: false
        }
    },
    inject: ['hamburgerMenuRegistry'],
    data() {
        return {
            isLoading: false // now managed reactively by this component
        };
    },
    mounted() {
        // Component mounted
    },
    computed: {
        // Get hamburger menu component from registry
        hamburgerMenuComponent() {
            return this.hamburgerMenuRegistry.getMenuComponent(this.containerType, this.containerPath);
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
            if (this.hamburgerMenuComponent) {
                const modal = modalManager.createModal(
                    `${this.title}`,
                    this.hamburgerMenuComponent.components,
                    {
                        componentProps: this.hamburgerMenuComponent.props || {}
                    }
                );
                modalManager.showModal(modal.id);
            }
        },
        expandContainer() {
            this.$emit('expand-container', {
                containerId: this.containerId,
                title: this.title,
                containerType: this.containerType,
                containerPath: this.containerPath
            });
        }
    },
    template: html `
        <div class="container" :class="{ 'dashboard-card': cardStyle }">
            <div v-if="containerPath || title || cardStyle" class="container-header">
                <BreadcrumbComponent
                    :container-path="containerPath"
                    :title="title"
                    :card-style="cardStyle"
                    :container-id="containerId"
                    @navigate-to-path="(event) => $emit('navigate-to-path', event)" />
                
                <div v-if="hamburgerMenuComponent || showExpandButton || !cardStyle" class="header-buttons">
                    <button v-if="hamburgerMenuComponent" 
                            class="button-symbol white" 
                            @click="openHamburgerMenu" 
                            title="Menu">☰</button>
                    <button v-if="showExpandButton" 
                            class="button-symbol white" 
                            @click="expandContainer" 
                            title="Expand to page">
                        <span class="material-symbols-outlined">expand_content</span>
                    </button>
                    <button v-if="!cardStyle" 
                            class="button-symbol white" 
                            @click="closeContainer" 
                            title="Close">×</button>
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
    }

    createContainer(type = 'default', title = '', options = {}) {
        const containerId = options.id || `container-${this.nextId++}`;
        
        const containerData = {
            id: containerId,
            type: type,
            title: title,
            options: options,
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