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
        }
    },
    data() {
        return {
            template: null,
            isLoading: true,
            showModal: false,
            content: {
                header: '',
                main: '',
                footer: ''
            }
        };
    },
    async created() {
        await this.loadContainerTemplate();
    },
    methods: {
        async loadContainerTemplate() {
            try {
                const response = await fetch('html/templates/container.html');
                if (!response.ok) {
                    throw new Error(`Failed to load container template: ${response.status}`);
                }
                this.template = await response.text();
                this.isLoading = false;
            } catch (error) {
                console.error('Error loading container template:', error);
                this.template = '<div class="container"><div class="content">Error loading container</div></div>';
                this.isLoading = false;
            }
        },
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
            this.showModal = true;
        },
        closeModal() {
            this.showModal = false;
        }
    },
    template: `
        <div v-if="!isLoading" 
             class="container" 
             :class="{ 'dashboard-card': cardStyle }"
             :data-container-id="containerId" 
             :data-container-type="containerType">
            <div v-if="title" class="container-header">
                <h2>{{ title }}</h2>
                <div class="header-buttons">
                    <button v-if="showHamburgerMenu" 
                            class="button-symbol gray" 
                            @click="openHamburgerMenu" 
                            title="Menu">☰</button>
                    <button v-if="showCloseButton" 
                            class="button-symbol gray" 
                            @click="closeContainer" 
                            title="Close container">×</button>
                </div>
                <div v-if="content.header" class="header-content" v-html="content.header"></div>
            </div>
            <div v-else-if="showCloseButton || showHamburgerMenu" class="container-header">
                <div class="header-buttons">
                    <button v-if="showHamburgerMenu" 
                            class="button-symbol gray" 
                            @click="openHamburgerMenu" 
                            title="Menu">☰</button>
                    <button v-if="showCloseButton" 
                            class="button-symbol gray" 
                            @click="closeContainer" 
                            title="Close container">×</button>
                </div>
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
            
            <!-- Modal for hamburger menu -->
            <div v-if="showModal" class="modal-overlay" @click="closeModal">
                <div class="modal-content" @click.stop>
                    <div class="modal-header">
                        <h3>Menu</h3>
                        <button class="button-symbol gray" @click="closeModal" title="Close">×</button>
                    </div>
                    <div class="modal-body">
                        <div v-if="hamburgerMenuContent" v-html="hamburgerMenuContent"></div>
                        <div v-else>
                            <p>No menu content provided</p>
                        </div>
                    </div>
                </div>
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
