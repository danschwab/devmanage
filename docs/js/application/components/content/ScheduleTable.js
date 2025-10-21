import { html, Requests, parseDate, TableComponent, getReactiveStore } from '../../index.js';

export const ScheduleTableComponent = {
    components: {
        TableComponent
    },
    props: {
        filter: {
            type: [Object, String],
            default: null
        }
    },
    inject: ['$modal'],
    data() {
        return {
            scheduleTableStore: null
        };
    },
    computed: {
        columns() {
            const rawData = this.scheduleTableStore ? this.scheduleTableStore.data : [];
            if (!rawData || rawData.length === 0) {
                // Return a basic set of columns if no data yet (for loading state)
                return [
                    { key: 'Show', label: 'Show' },
                    { key: 'Client', label: 'Client' },
                    { key: 'packlist', label: 'Packlist' }
                ];
            }

            // Get headers from the first row of data
            const firstRow = rawData[0];
            const headers = Object.keys(firstRow).filter(header => header !== 'AppData'); // Exclude AppData from columns

            // Generate columns with rational formatting based on column names
            const dynamicColumns = headers.map(header => {
                const column = {
                    key: header,
                    label: this.formatColumnLabel(header)
                };

                // Mark columns as details if they're not Show, Client, or Ship
                if (!['Show', 'Client', 'Ship', 'City', 'Size'].includes(header)) {
                    column.details = true;
                }

                // Apply rational formatting based on column name patterns
                this.applyColumnFormatting(column, header);

                return column;
            });

            // Always add the packlist column at the end
            dynamicColumns.push({
                key: 'packlist',
                label: 'Packlist',
                width: 120
            });

            return dynamicColumns;
        },
        tableData() {
            const rawData = this.scheduleTableStore ? this.scheduleTableStore.data : [];
            // Add reactive packlist information to AppData for each row
            return rawData.map((row, index) => ({
                ...row,
                AppData: {
                    ...row.AppData,
                    packlist: {
                        loading: row.AppData?.packlist?.loading !== false,
                        exists: row.AppData?.packlist?.exists || false,
                        identifier: row.AppData?.packlist?.identifier || null
                    }
                }
            }));
        },
        originalData() {
            return this.scheduleTableStore && Array.isArray(this.scheduleTableStore.originalData)
                ? JSON.parse(JSON.stringify(this.scheduleTableStore.originalData))
                : [];
        },
        error() {
            return this.scheduleTableStore ? this.scheduleTableStore.error : null;
        },
        loadingMessage() {
            return this.scheduleTableStore ? (this.scheduleTableStore.loadingMessage || 'Loading schedule...') : 'Loading schedule...';
        },
        isLoading() {
            return this.scheduleTableStore ? this.scheduleTableStore.isLoading : false;
        },
        tableTitle() {
            // Helper to format date as 'mmm d, yyyy'
            function formatDate(dateStr) {
                if (!dateStr) return '';
                const date = parseDate(dateStr);
                if (!date || isNaN(date)) return dateStr;
                return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
            if (this.filter && typeof this.filter === 'object' && this.filter.startDate && this.filter.endDate) {
                const start = formatDate(this.filter.startDate);
                const end = formatDate(this.filter.endDate);
                return `Shows between ${start} and ${end}`;
            }
            if (this.filter && (typeof this.filter === 'string' || this.filter.identifier)) {
                const id = typeof this.filter === 'string' ? this.filter : this.filter.identifier;
                return `Shows during ${id}`;
            }
            return 'Production Schedule';
        }
    },
    watch: {
        // Watch for data changes and enrich with packlist information
        'scheduleTableStore.data': {
            handler(newData) {
                if (newData && newData.length > 0) {
                    this.enrichWithPacklistData();
                }
            },
            immediate: true
        },
        // Watch for filter changes and recreate store with new parameters
        filter: {
            handler(newFilter, oldFilter) {
                if (JSON.stringify(newFilter) !== JSON.stringify(oldFilter)) {
                    // Create a new reactive store with the updated filter
                    this.scheduleTableStore = getReactiveStore(
                        Requests.getProductionScheduleData,
                        null,
                        [newFilter]
                    );
                }
            },
            deep: true,
            immediate: false
        }
    },
    async mounted() {
        this.scheduleTableStore = getReactiveStore(
            Requests.getProductionScheduleData,
            null,
            [this.filter]
        );
    },
    methods: {
        async handleRefresh() {
            // Reload schedule data (cache will be automatically invalidated)
            if (this.scheduleTableStore) {
                await this.scheduleTableStore.load('Reloading schedule...');
            }
        },
        formatColumnLabel(header) {
            // Convert header to a more readable label
            const labelMap = {
                'S. Start': 'Start Date',
                'S. End': 'End Date',
                'Booth#': 'Booth #',
                'Year': 'Year',
                'Show': 'Show',
                'Client': 'Client',
                'City': 'City',
                'Location': 'Location',
                'Ship': 'Ship Date',
                'Production Manager': 'Production Manager',
                'Account Manager': 'Account Manager'
            };

            // Use mapped label if available
            if (labelMap[header]) {
                return labelMap[header];
            }

            // Auto-format common patterns
            let formatted = header
                // Handle camelCase and PascalCase
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                // Handle underscores and dashes
                .replace(/[_-]/g, ' ')
                // Handle dots followed by letters
                .replace(/\.([a-zA-Z])/g, '. $1')
                // Capitalize each word
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');

            return formatted;
        },
        applyColumnFormatting(column, header) {
            const key = header.toLowerCase();

            // Apply date formatting for date-related columns
            if (this.isDateColumn(key)) {
                column.format = 'date';
                column.width = 120;
                
                // Apply auto-coloring for ship dates and other time-sensitive dates
                if (key === 'ship' || key.includes('ship') || key.includes('due') || key.includes('deadline')) {
                    column.autoColor = true;
                }
            }
            // Apply number formatting for numeric columns
            else if (this.isNumberColumn(key)) {
                column.format = 'number';
                column.width = 80;
            }
            // Apply currency formatting for monetary columns
            else if (this.isCurrencyColumn(key)) {
                column.format = 'currency';
                column.width = 120;
            }
            // Apply specific widths for common columns
            else {
                column.width = this.getColumnWidth(key);
            }
        },
        isDateColumn(key) {
            const dateKeywords = ['date', 'start', 'end', 'ship', 'due', 'deadline', 'created', 'updated', 'modified', 's.', 'time'];
            return dateKeywords.some(keyword => key.includes(keyword));
        },
        isNumberColumn(key) {
            const numberKeywords = ['year', 'count', 'quantity', 'id'];
            return numberKeywords.some(keyword => key.includes(keyword)) || /^\d+$/.test(key);
        },
        isCurrencyColumn(key) {
            const currencyKeywords = ['price', 'cost', 'amount', 'fee', 'rate', 'budget', 'expense', 'revenue', 'total'];
            return currencyKeywords.some(keyword => key.includes(keyword));
        },
        getColumnWidth(key) {
            // Apply specific widths based on column content type
            if (key === 'show' || key.includes('title') || key.includes('name')) {
                return 200;
            }
            else if (key === 'client' || key.includes('company')) {
                return 150;
            }
            else if (key === 'city' || key === 'location' || key.includes('address')) {
                return 150;
            }
            else if (key.includes('manager') || key.includes('contact') || key.includes('person')) {
                return 180;
            }
            else if (key.includes('booth') || key.includes('space')) {
                return 100;
            }
            else if (key.includes('email')) {
                return 200;
            }
            else if (key.includes('phone')) {
                return 140;
            }
            else if (key.includes('status') || key.includes('type')) {
                return 120;
            }
            else if (key.includes('notes') || key.includes('description') || key.includes('comment')) {
                return 250;
            }
            // Default width for other columns
            else {
                return 140;
            }
        },
        async enrichWithPacklistData() {
            if (!this.scheduleTableStore?.data) return;
            
            const data = this.scheduleTableStore.data;
            
            // Enrich each row with packlist information in parallel
            const enrichmentPromises = data.map(async (row, index) => {
                try {
                    const identifier = await Requests.computeIdentifier(
                        row.Show, 
                        row.Client, 
                        parseInt(row.Year)
                    );
                    
                    // Get available tabs and check if packlist exists
                    const availableTabs = await Requests.getAvailableTabs('PACK_LISTS');
                    const tab = availableTabs.find(tab => tab.title === identifier);
                    
                    // Update the row's AppData with packlist information (Vue 3 compatible)
                    row.AppData = {
                        ...row.AppData,
                        packlist: {
                            loading: false,
                            exists: !!tab,
                            identifier: identifier
                        }
                    };
                } catch (error) {
                    console.warn(`Failed to enrich packlist data for row ${index}:`, error);
                    row.AppData = {
                        ...row.AppData,
                        packlist: {
                            loading: false,
                            exists: false,
                            identifier: null
                        }
                    };
                }
            });
            
            await Promise.all(enrichmentPromises);
        },
        async handlePacklistClick(packlistInfo) {
            if (!packlistInfo.exists || !packlistInfo.identifier) {
                this.$modal.alert('No packlist available for this show', 'Info');
                return;
            }
            
            this.$emit('navigate-to-path', { targetPath: `packlist/${packlistInfo.identifier}` });
        },
        getPacklistCards(row, columnKey) {
            // Only show packlist cards in the packlist column
            if (columnKey !== 'packlist') {
                return [];
            }
            
            const packlistInfo = row.AppData?.packlist;
            if (!packlistInfo) {
                return [];
            }
            
            // Create a card based on packlist status
            if (packlistInfo.loading) {
                return [{
                    message: 'Loading...',
                    disabled: true
                }];
            }
            
            if (packlistInfo.exists) {
                return [{
                    message: 'View Packlist',
                    disabled: false,
                    action: () => this.handlePacklistClick(packlistInfo)
                }];
            } else {
                return [{
                    message: 'No Packlist',
                    disabled: true
                }];
            }
        }
    },
    template: html`
        <TableComponent
            ref="tableComponent"
            :data="tableData"
            :originalData="originalData"
            :columns="columns"
            :isLoading="isLoading"
            :error="error"
            :showRefresh="true"
            :title="tableTitle"
            emptyMessage="No shows found."
            :loading-message="loadingMessage"
            :showSearch="true"
            :sortable="true"
            :allowDetails="true"
            @refresh="handleRefresh"
        >
            <template #table-header-area>
                <slot name="table-header-area"></slot>
            </template>
            <template #default="{ row, column }">
                <!-- Add packlist cards based on AppData -->
                <template v-for="card in getPacklistCards(row, column.key)" :key="card.message">
                    <button 
                        class="card"
                        :disabled="card.disabled"
                        @click="!card.disabled ? card.action() : null"
                        v-html="card.message"
                    ></button>
                </template>
            </template>
        </TableComponent>
    `
};
