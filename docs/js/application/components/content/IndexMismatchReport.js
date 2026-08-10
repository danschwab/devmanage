import { html, TableComponent, Requests, getReactiveStore, invalidateCache, NavigationRegistry } from '../../index.js';
import { IndexResolutionComponent } from '../interface/IndexResolutionModal.js';

export const IndexMismatchReport = {
    components: { TableComponent },
    inject: ['$modal', 'appContext'],
    props: {
        containerPath: { type: String, default: 'reports/index-mismatches' },
        navigateToPath: Function
    },
    data() {
        return {
            reportStore: null
        };
    },
    computed: {
        isLoading() {
            return this.reportStore?.isLoading || false;
        },
        isAnalyzing() {
            return this.reportStore?.isAnalyzing || false;
        },
        loadingMessage() {
            return this.reportStore?.loadingMessage || 'Scanning index references...';
        },
        tableColumns() {
            return [
                { key: 'rawValue', label: 'Name', sortable: true },
                { key: 'typeLabel', label: 'Type', sortable: true, width: 80 },
                { key: 'sourcesSummary', label: 'Sources', sortable: false },
                { key: 'resolution', label: 'Resolution', sortable: false, editable: true, format: 'external-edit' },
                { key: '_resolve', label: '', sortable: false, width: 90 }
            ];
        },
        tableData() {
            if (!this.reportStore?.data) return [];
            return this.reportStore.data.map(row => ({
                ...row,
                typeLabel: row.referenceType === 'client' ? 'Client' : 'Show',
                sourcesSummary: row.sources.map(s => `[${s.sourceType}] ${s.identifier}`).join(', ')
            }));
        },
        emptyMessage() {
            if (!this.isLoading && !this.isAnalyzing) {
                return 'No index mismatches found. All client and show names resolve correctly.';
            }
            return '';
        }
    },
    methods: {
        handleRefresh() {
            if (this.reportStore) {
                this.reportStore.load();
            }
        },
        clearResolution(row) {
            const originalRow = this.reportStore.data.find(
                r => r.rawValue === row.rawValue && r.referenceType === row.referenceType
            );
            if (originalRow) {
                originalRow.resolution = '';
                if (originalRow.AppData) {
                    delete originalRow.AppData.pendingResolution;
                }
            }
        },
        async saveResolutions() {
            const rowsWithResolutions = this.reportStore.data.filter(row => row.AppData?.pendingResolution);
            if (!rowsWithResolutions.length) return true;
            
            for (const row of rowsWithResolutions) {
                const option = row.AppData.pendingResolution;
                try {
                    if (option.actionType === 'add-new') {
                        await Requests.addScheduleReferenceName(row.referenceType, option.canonicalName);
                    } else if (option.actionType === 'add-abbreviation') {
                        await Requests.appendScheduleReferenceAbbreviation(row.referenceType, option.canonicalName, option.abbreviation);
                    } else if (option.actionType === 'add-custom') {
                        const result = await Requests.addCustomScheduleReferenceEntry(row.referenceType, option.canonicalName, option.abbreviation);
                        if (!result?.applied) {
                            // If name conflicts, add as abbreviation to the existing entry instead
                            if (result?.conflict?.field === 'name' && result?.conflict?.existingName) {
                                await Requests.appendScheduleReferenceAbbreviation(
                                    row.referenceType,
                                    result.conflict.existingName,
                                    option.abbreviation
                                );
                            } else {
                                const conflictValue = result?.conflict?.value || option.canonicalName;
                                const fieldLabel = result?.conflict?.field === 'abbreviation' ? 'abbreviation' : 'name';
                                throw new Error(`The ${fieldLabel} "${conflictValue}" already exists in the index.`);
                            }
                        }
                    }
                } catch (error) {
                    throw new Error(`Failed to apply resolution for "${row.rawValue}": ${error.message}`);
                }
            }
            
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['CACHE', 'Clients'] },
                { namespace: 'database', methodName: 'getData', args: ['CACHE', 'Shows'] }
            ], true);
            
            // Immediately reload the report to clear resolved rows
            await this.reportStore.load();
            
            return true;
        },
        initializeStore() {
            const self = this;
            this.reportStore = getReactiveStore(
                Requests.getIndexMismatches,
                async () => await self.saveResolutions(),
                [],
                [],
                true
            );
        },
        async openResolutionModal(row, includeAllCandidates = false) {
            try {
                const resolutionData = await Requests.getScheduleReferenceResolutionOptions(
                    row.referenceType,
                    row.rawValue,
                    includeAllCandidates
                );
                const options = resolutionData?.options || [];
                if (options.length === 0) {
                    this.$modal.alert('No resolution options available for this value.', 'Missing');
                    return;
                }
                const modalTitle = includeAllCandidates
                    ? `Select ${row.referenceType}`
                    : `${row.referenceType === 'show' ? 'Show' : 'Client'} Missing`;
                const issue = { referenceType: row.referenceType, rawValue: row.rawValue };
                const self = this;
                this.$modal.custom(IndexResolutionComponent, {
                    issue,
                    options,
                    includeAllCandidates,
                    showDescription: false,
                    onSelectOption: async (option) => {
                        if (option.actionType === 'browse-all') {
                            await self.openResolutionModal(row, true);
                            return { applied: false, browsedAll: true };
                        }
                        // Find the original row in reportStore.data and write resolution directly
                        const originalRow = self.reportStore.data.find(
                            r => r.rawValue === row.rawValue && r.referenceType === row.referenceType
                        );
                        if (originalRow) {
                            originalRow.resolution = option.label;
                            if (!originalRow.AppData) originalRow.AppData = {};
                            originalRow.AppData.pendingResolution = option;
                        }
                        return { applied: true };
                    },
                    modalClass: 'hamburger-menu'
                }, modalTitle);
            } catch (error) {
                console.error('[IndexMismatchReport] Failed to open resolution modal:', error);
                this.$modal.error(`Failed to load resolution options: ${error.message}`, 'Resolution Error');
            }
        },
    },
    mounted() {
        this.initializeStore();
    },
    template: html`
        <TableComponent
            theme="blue"
            :data="tableData"
            :columns="tableColumns"
            :original-data="reportStore?.originalData || []"
            :is-loading="isLoading"
            :is-analyzing="isAnalyzing"
            :loading-message="loadingMessage"
            :empty-message="emptyMessage"
            :show-search="true"
            :sync-search-with-url="true"
            :container-path="containerPath || 'reports/index-mismatches'"
            :navigate-to-path="navigateToPath"
            :readonly="false"
            :allowDetails="false"
            @refresh="handleRefresh"
            @on-save="() => reportStore.save()"
        >
            <template #default="{ row, column }">
                <button
                    v-if="column.key === '_resolve'"
                    @click="openResolutionModal(row)"
                >
                    Resolve
                </button>
                <div v-else-if="column.key === 'resolution'">
                    <span>{{ row.resolution || '—' }}</span>
                    <button
                        v-if="row.resolution"
                        @click="clearResolution(row)"
                        class="red column-button"
                        title="Clear resolution"
                    >
                        ✕
                    </button>
                </div>
                <span v-else>{{ row[column.key] !== null && row[column.key] !== undefined ? row[column.key] : '—' }}</span>
            </template>
        </TableComponent>
    `
};
