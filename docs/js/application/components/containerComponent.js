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
                pageLocation: this.pageLocation
            });
        }
    },
    template: html `
        <div v-if="!isLoading" 
             class="container" 
             :class="{ 'dashboard-card': cardStyle }"
             :data-container-id="containerId" 
             :data-container-type="containerType">
            <div v-if="title || showCloseButton || showHamburgerMenu || showExpandButton" class="container-header">
                <h2 v-if="title">{{ title }}</h2>
                <div v-if="showHamburgerMenu || showExpandButton || showCloseButton" class="header-buttons">
                    <button v-if="showHamburgerMenu" 
                            class="button-symbol gray" 
                            @click="openHamburgerMenu" 
                            title="Menu">☰</button>
                    <button v-if="showExpandButton" 
                            class="button-symbol gray" 
                            @click="expandContainer" 
                            title="Expand to page">⤴</button>
                    <button v-if="showCloseButton" 
                            class="button-symbol gray" 
                            @click="closeContainer" 
                            title="Close container">×</button>
                </div>
                <div v-if="content.header" class="header-content" v-html="content.header"></div>
            </div>
            <div class="content">
                <slot name="content">
                    <div v-if="content.main" v-html="content.main"></div>
                    <div v-else>
                        <p>Container {{ containerId }} loaded successfully!</p>
                        <p>Type: {{ containerType }}</p>
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