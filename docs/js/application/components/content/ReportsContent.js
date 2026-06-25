import { html, CardsComponent, hamburgerMenuRegistry, NavigationRegistry, DashboardToggleComponent } from '../../index.js';
import { ShowInventoryReport } from './ShowInventoryReport.js';
import { InventoryItemReport } from './InventoryItemReport.js';

export const ReportsContent = {
    components: {
        'cards-grid': CardsComponent,
        'show-inventory-report': ShowInventoryReport,
        'inventory-item-report': InventoryItemReport
    },
    props: {
        containerPath: {
            type: String,
            default: 'reports'
        },
        navigateToPath: Function,
    },
    data() {
        return {
            items: [
                { id: 'show-usage', title: 'Show Usage', content: 'View inventory quantities across shows in a matrix.', cardClass: 'purple' },
                { id: 'item-shortages', title: 'Item Shortages', content: 'View items with quantities that drop below a set threshold.', cardClass: 'purple' }
            ]
        };
    },
    computed: {
        cleanContainerPath() {
            return this.containerPath.split('?')[0];
        }
    },
    methods: {
        handleReportSelect(reportTitle) {
            // Map title to report id for navigation
            const reportId = reportTitle.toLowerCase().replace(/\s+/g, '-');
            this.navigateToPath(`reports/${reportId}`);
        }
    },
    mounted() {
        // Register reports navigation route
        NavigationRegistry.registerNavigation('reports', {
            routes: {}
        });

        // Register hamburger menu for reports
        hamburgerMenuRegistry.registerMenu('reports', {
            components: [DashboardToggleComponent],
            props: {
                navigateToPath: this.navigateToPath
            }
        });
    },
    template: html`
        
        <slot>
            <!-- Reports Landing -->
            <cards-grid
                v-if="cleanContainerPath === 'reports'"
                :items="items"
                :on-item-click="handleReportSelect"
                container-path="reports"
                :navigate-to-path="navigateToPath"
            />

            <!-- Show Inventory Report View -->
            <show-inventory-report
                v-else-if="cleanContainerPath === 'reports/show-usage'"
                :container-path="containerPath"
                :navigate-to-path="navigateToPath"
            />

            <!-- Item-centric Inventory Report View -->
            <inventory-item-report
                v-else-if="cleanContainerPath === 'reports/item-shortages'"
                :container-path="containerPath"
                :navigate-to-path="navigateToPath"
            />

            <!-- 404 state when item not found (aka when the store returns null) -->
            <div v-else>
                <div class="card red">
                    <h3>Report Not Found</h3>
                    <p>The report you are looking for could not be found.</p>
                </div>
            </div>
        </slot>
    `
};
