import { html, BreadcrumbComponent, NavigationRegistry } from '../../index.js';

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
        cardClasses: {
            type: String,
            default: ''
        },
        // Show expand button to open in full page
        showExpandButton: {
            type: Boolean,
            default: false
        },
        pinnedToDashboard: {
            type: Boolean,
            default: false
        }
    },
    inject: ['hamburgerMenuRegistry', '$modal'],
    provide() {
        return {
            // Provide navigation parameters to child components
            navigationParameters: () => this.navigationParameters
        };
    },
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
        },
        // Get navigation parameters from NavigationRegistry
        navigationParameters() {
            return NavigationRegistry.getNavigationParameters(this.containerPath);
        }
    },
    methods: {
        setLoading(val) {
            this.isLoading = val;
        },
        closeContainer() {
            this.$emit('navigate-to-path', 'dashboard');
        },
        openHamburgerMenu() {
            if (this.hamburgerMenuComponent) {
                this.$modal.custom(
                    this.hamburgerMenuComponent.components,
                    this.hamburgerMenuComponent.props || {},
                    this.title
                );
            }
        },
        toggleDashboardState() {
            this.$emit('toggle-dashboard-state', {
                containerPath: this.containerPath,
                pinned: !this.pinnedToDashboard
            });
        },
        expandContainer() {
            this.$emit('expand-container', {
                path: this.containerPath,
                containerPath: this.containerPath,
                title: this.title
            });
        }
    },
    template: html `
        <div class="container" :class="(cardStyle ? 'dashboard-card' + cardClasses : '')">
            <div v-if="containerPath || title || cardStyle" class="container-header">
                <BreadcrumbComponent
                    :container-path="containerPath"
                    :title="title"
                    :card-style="cardStyle"
                    :container-id="containerId"
                    @navigate-to-path="(event) => $emit('navigate-to-path', event)" />
                
                <div v-if="hamburgerMenuComponent || showExpandButton || !cardStyle" class="button-group">
                    <button v-if="!cardStyle"
                            class="button-symbol white"
                            @click="toggleDashboardState" 
                            title="Pin to dashboard">
                        <span class="material-symbols-outlined">{{ pinnedToDashboard ? 'keep_off' : 'keep' }}</span>
                    </button>
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
            
            <div class="container-content">
                <div v-if="isLoading" class="loading-message" style="text-align:center; padding:2rem;">
                    <img src="images/loading.gif" alt="..."/>
                    <p>Loading data...</p>
                </div>
                <slot v-else name="content">
                    <div class="content-footer red">
                        <p>nothing found at "{{ containerPath }}"</p>
                    </div>
                </slot>
            </div>
        </div>
    `
};

