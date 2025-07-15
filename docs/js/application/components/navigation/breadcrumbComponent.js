import { html } from '../../index.js';

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
            localNavigationMap: {}
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
            
            return this.pathSegments.map((segment, index) => ({
                id: segment,
                name: this.getSegmentName(segment),
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
        /**
         * Get human-readable name for a segment, building it if not found
         */
        getSegmentName(segmentId) {
            if (this.localNavigationMap[segmentId]) {
                return this.localNavigationMap[segmentId];
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
                displayName = segmentId.charAt(0).toUpperCase() + segmentId.slice(1);
            }
            this.localNavigationMap[segmentId] = displayName;
            
            // Emit event to parent to share this mapping
            this.$emit('navigation-mapping-added', {
                containerId: this.containerId,
                segmentId: segmentId,
                displayName: displayName
            });
        },
        /**
         * Update navigation mapping from external source
         */
        updateNavigationMapping(segmentId, displayName) {
            this.localNavigationMap[segmentId] = displayName;
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
            <!-- Current location only for dashboard cards -->
            <h2 v-else class="breadcrumb-current">{{ displayTitle }}</h2>
        </div>
        <!-- Traditional Title (fallback) -->
        <h2 v-else-if="title">{{ displayTitle }}</h2>
    `
};
