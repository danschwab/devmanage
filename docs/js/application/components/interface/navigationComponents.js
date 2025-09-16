import { html, NavigationRegistry } from '../../index.js';

export const PrimaryNavComponent = {
    props: {
        isMenuOpen: {
            type: Boolean,
            default: false
        },
        navigationItems: {
            type: Array,
            default: () => []
        },
        currentPage: {
            type: String,
            default: 'dashboard'
        },
        isAuthenticated: {
            type: Boolean,
            default: false
        },
        isAuthLoading: {
            type: Boolean,
            default: false
        },
        currentUser: {
            type: Object,
            default: () => null
        }
    },
    emits: [
        'toggle-menu',
        'navigate-to-path',
        'login',
        'logout'
    ],
    methods: {
        handleNavClick(item) {
            if (this.currentPage === item.path) {
                this.$emit('toggle-menu');
            } else {
                this.$emit('navigate-to-path', item.path);
            }
        },
        handleClickOutside(event) {
            if (!this.isMenuOpen) return;
            const nav = this.$el.querySelector('nav');
            if (nav && !nav.contains(event.target)) {
                this.$emit('toggle-menu');
            }
        }
    },
    mounted() {
        document.addEventListener('mouseup', this.handleClickOutside);
    },
    beforeUnmount() {
        document.removeEventListener('mouseup', this.handleClickOutside);
    },
    template: html`
        <header>
            <nav :class="{ 'open': isMenuOpen }">
                <a @click.prevent="$emit('navigate-to-path', 'dashboard');"><img src="images/logo.png" alt="Top Shelf Exhibits" /></a>

                <span id="navbar">
                    <template v-if="isAuthenticated">
                        <a v-for="item in navigationItems" 
                           :key="item.path"
                           :class="{ 'active': currentPage === item.path }"
                           @click.prevent="handleNavClick(item)">
                            {{ item.title }}
                        </a>
                    </template>
                    
                    <button v-if="!isAuthenticated" 
                            @click="$emit('login')" 
                            :disabled="isAuthLoading"
                            class="login-out-button active">
                        {{ isAuthLoading ? 'Loading...' : 'Login' }}
                    </button>
                    <button v-else 
                            @click="$emit('logout')" 
                            :disabled="isAuthLoading"
                            class="login-out-button">
                        {{ isAuthLoading ? 'Logging out...' : 'Logout (' + (currentUser?.name || '') + ')' }}
                    </button>
                </span>
                
                <button class="button-symbol white" @click="$emit('toggle-menu')">
                    {{ isMenuOpen ? '×' : '≡' }}
                </button>
            </nav>
        </header>
    `
};


export const BreadcrumbComponent = {
    props: {
        containerPath: {
            type: String,
            default: ''
        },
        title: {
            type: String,
            default: ''
        },
        cardStyle: {
            type: Boolean,
            default: false
        },
        navigationMap: {
            type: Object,
            default: () => ({})
        },
        containerId: {
            type: String,
            required: true
        }
    },
    data() {
        return {
            // Local navigation map that can be extended at runtime
            localNavigationMap: {},
            showHoverPath: false
        };
    },
    mounted() {
        // Initialize local navigation map with props
        this.localNavigationMap = { ...this.navigationMap };
        
        // Add any segments from current path that aren't already mapped
        this.pathSegments.forEach(segment => {
            if (!this.localNavigationMap[segment]) {
                this.addNavigationMapping(segment);
            }
        });
    },
    computed: {
        pathSegments() {
            if (!this.containerPath) return [];
            return this.containerPath.split('/').filter(segment => segment.length > 0);
        },
        pathSegmentsWithNames() {
            if (!this.pathSegments.length) return [];
            
            return this.pathSegments.map((segment, index) => {
                // Build the cumulative path up to this segment
                const cumulativePath = this.pathSegments.slice(0, index + 1).join('/');
                
                return {
                    id: segment,
                    name: this.getSegmentName(segment, cumulativePath),
                    index: index,
                    path: cumulativePath
                };
            });
        },
        displayTitle() {
            if (this.containerPath) {
                // For dashboard cards, use dashboard title; for regular breadcrumbs, use display name
                if (this.cardStyle) {
                    return NavigationRegistry.getDisplayName(this.containerPath,true);
                } else {
                    if (this.pathSegmentsWithNames.length === 0) return this.title;
                    return this.pathSegmentsWithNames[this.pathSegmentsWithNames.length - 1].name;
                }
            }
            return this.title;
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
        /**
         * Get human-readable name for a segment, building it if not found
         * @param {string} segmentId - The segment identifier
         * @param {string} fullPath - The full path to this segment (for better context)
         */
        getSegmentName(segmentId, fullPath = null) {
            // Check local navigation map first
            if (this.localNavigationMap[segmentId]) {
                return this.localNavigationMap[segmentId];
            }
            
            // Try to get from NavigationRegistry using full path if available
            let registryName = 'Unknown';
            if (fullPath) {
                registryName = NavigationRegistry.getDisplayName(fullPath);
            }
            
            // If full path didn't work, try just the segment
            if (registryName === 'Unknown') {
                registryName = NavigationRegistry.getDisplayName(segmentId);
            }
            
            if (registryName !== 'Unknown') {
                this.addNavigationMapping(segmentId, registryName);
                return registryName;
            }
            
            // Auto-generate name if not found
            const generatedName = segmentId.charAt(0).toUpperCase() + segmentId.slice(1);
            this.addNavigationMapping(segmentId, generatedName);
            return generatedName;
        },
        /**
         * Add a new navigation mapping
         */
        addNavigationMapping(segmentId, displayName = null) {
            if (!displayName) {
                displayName = NavigationRegistry.getDisplayName(segmentId);
                if (displayName === 'Unknown') {
                    displayName = segmentId.charAt(0).toUpperCase() + segmentId.slice(1);
                }
            }
            this.localNavigationMap[segmentId] = displayName;
            
            // Emit event to parent to share this mapping
            this.$emit('navigation-mapping-added', {
                containerId: this.containerId,
                segmentId: segmentId,
                displayName: displayName
            });
        },
        navigateToBreadcrumb(index) {
            if (index < this.pathSegments.length - 1) {
                const targetPath = this.pathSegments.slice(0, index + 1).join('/');
                
                // Ensure all segments in target path have mappings
                this.pathSegments.slice(0, index + 1).forEach(segment => {
                    if (!this.localNavigationMap[segment]) {
                        this.addNavigationMapping(segment);
                    }
                });
                
                this.$emit('navigate-to-path', {
                    containerId: this.containerId,
                    targetPath: targetPath,
                    currentPath: this.containerPath,
                    navigationMap: this.localNavigationMap
                });
            }
        },
        showHoverBreadcrumb() {
            this.showHoverPath = true;
        },
        hideHoverBreadcrumb() {
            this.showHoverPath = false;
        }
    },
    template: html`
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
            <!-- Current location with hover overlay for dashboard cards -->
            <div v-else class="breadcrumb-card-container">
                <span v-if="!showHoverPath" class="breadcrumb-current" 
                    @mouseenter="showHoverBreadcrumb" 
                    @mouseleave="hideHoverBreadcrumb">
                    {{ displayTitle }}
                </span>

                <!-- Hover overlay with full breadcrumb path -->
                <div v-else-if="showHoverPath" class="breadcrumb-hover-overlay"
                     @mouseenter="showHoverBreadcrumb" 
                     @mouseleave="hideHoverBreadcrumb">
                    <div class="breadcrumb-path">
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
                </div>
            </div>
        </div>
        <!-- Traditional Title (fallback) -->
        <h2 v-else-if="title">{{ displayTitle }}</h2>
    `
};