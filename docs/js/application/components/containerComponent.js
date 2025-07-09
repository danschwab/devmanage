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
        }
    },
    data() {
        return {
            template: null,
            isLoading: true,
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
                <button class="button-symbol gray" @click="closeContainer" title="Close container">×</button>
                <div v-if="content.header" class="header-content" v-html="content.header"></div>
            </div>
            <div v-else class="container-header">
                <button class="button-symbol gray" @click="closeContainer" title="Close container">×</button>
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
