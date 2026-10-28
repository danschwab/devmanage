import { html, Requests, TableComponent, CardsComponent, ItemImageComponent, getReactiveStore, ProposalUtils, PROPOSAL_LOCK_NAMESPACE, parseDate, todayISOString, getInventoryNoteMaxLength } from '../../index.js';
import { sheetLockMixin } from '../../utils/sheetLockMixin.js';
import { getProposalsStore, reloadProposals, proposalPath, commitInventoryProposal } from '../../utils/inventoryProposals.js';
import { escapeHtml } from '../../utils/useSearch.js';
import { InventorySaveModal } from './InventoryTable.js';

/**
 * Inventory proposals pages (Reports → Inventory Proposals).
 * Plan: docs/notes/inventory-proposals-plan.md
 */

const formatDay = (deciseconds) => (deciseconds
    ? new Date(deciseconds * 100).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '');
const titleCase = (tab) => tab.charAt(0).toUpperCase() + tab.slice(1).toLowerCase();

/** reports/inventory-proposals — one card per proposal, active first, committed (gray) last */
export const InventoryProposalsGrid = {
    components: { 'cards-grid': CardsComponent },
    props: {
        containerPath: { type: String, default: 'reports/inventory-proposals' },
        navigateToPath: Function
    },
    data() {
        return { proposalsStore: getProposalsStore() };
    },
    computed: {
        proposals() {
            return ProposalUtils.groupProposals(this.proposalsStore.data || []);
        },
        cards() {
            return this.proposals.map(proposal => ({
                id: proposal.slug,
                title: proposal.name,
                content: escapeHtml(`${proposal.itemCount} item${proposal.itemCount === 1 ? '' : 's'} in ${proposal.categories.map(titleCase).join(', ')}`),
                contentFooter: escapeHtml(proposal.committed
                    ? `Committed by ${proposal.committedBy} on ${formatDay(proposal.committed)}`
                    : `Updated by ${proposal.updatedBy} on ${formatDay(proposal.updated)}`),
                cardClass: proposal.committed ? 'gray' : 'button purple',
                onClick: () => this.navigateToPath?.(proposalPath(proposal.name))
            }));
        }
    },
    template: html`
        <cards-grid
            :items="cards"
            :on-item-click="() => {}"
            :is-loading="proposalsStore.isLoading"
            empty-message="No proposals yet. Save inventory edits as a proposal from a category's Save dialog."
            :container-path="containerPath"
            :navigate-to-path="navigateToPath"
        />
    `
};

/**
 * reports/inventory-proposals/<slug> — one table of the proposal's item changes.
 * Editable with the standard lock and Save/Discard; Commit applies it to inventory.
 */
export const InventoryProposalTable = {
    mixins: [sheetLockMixin],
    components: { TableComponent, ItemImageComponent },
    inject: ['appContext', '$modal', '$notify'],
    props: {
        proposalSlug: { type: String, required: true },
        containerPath: String,
        navigateToPath: Function
    },
    data() {
        return {
            proposalsStore: getProposalsStore(),
            tableStore: null,
            lockNamespace: PROPOSAL_LOCK_NAMESPACE,
            projectionDate: todayISOString(),
            todayISO: todayISOString(),
            committing: false
        };
    },
    computed: {
        // Reads every entry, so it also tracks in-place updates to the store's array
        proposals() {
            return ProposalUtils.groupProposals(this.proposalsStore.data || []);
        },
        proposal() {
            return this.proposals.find(proposal => proposal.slug === this.proposalSlug) || null;
        },
        proposalName() {
            return this.proposal?.name || null;
        },
        isCommitted() {
            return !!this.proposal?.committed;
        },
        notFound() {
            return !this.proposal && !this.proposalsStore.isLoading && !this.proposalsStore.initialLoad;
        },
        // sheetLockMixin contract
        lockKey() {
            return this.proposalName;
        },
        activeStore() {
            return this.tableStore;
        },
        isDirty() {
            return this.tableStore?.isModified || false;
        },
        editMode() {
            return !this.isCommitted;
        },
        allowEdit() {
            return !this.isCommitted && !this.lockedByOther && this.lockCheckComplete;
        },
        tableData() {
            return this.tableStore ? this.tableStore.data : [];
        },
        originalData() {
            return this.tableStore ? JSON.parse(JSON.stringify(this.tableStore.originalData)) : [];
        },
        projectionDeciseconds() {
            const date = parseDate(this.projectionDate) || new Date();
            return Math.floor(date.getTime() / 100);
        },
        columns() {
            const changedFrom = (currentKey) => (value, row) => (
                row && String(value ?? '') !== String(row[currentKey] ?? '') ? 'proposal-changed' : ''
            );
            return [
                // Read-only thumbnail, as on the inventory overview table
                {
                    key: 'image',
                    labelHtml: '<span class="material-symbols-outlined">imagesmode</span>',
                    label: 'I',
                    width: 1,
                    sortable: false,
                    sticky: 'start'
                },
                { key: 'category', label: 'Category', width: 130, sortable: true },
                { key: 'itemNumber', label: 'Item#', type: 'item', width: 120, sortable: true },
                { key: 'currentQuantity', label: 'Current Qty', width: 90, sortable: true },
                {
                    key: 'quantityChange',
                    label: 'Change',
                    format: 'number',
                    editable: this.allowEdit,
                    autoColor: false,
                    width: 100,
                    sortable: true,
                    cellClass: (value) => {
                        const delta = parseFloat(value) || 0;
                        return delta > 0 ? 'proposal-increase' : delta < 0 ? 'proposal-decrease' : '';
                    }
                },
                // Committed changes are already in Current Qty, so only active proposals project
                ...(this.isCommitted ? [] : [{ key: '_projected', label: 'Projected Qty', width: 110, sortable: false }]),
                { key: 'description', label: 'Description', editable: this.allowEdit, sortable: true, cellClass: changedFrom('currentDescription') },
                { key: 'notes', label: 'Notes', editable: this.allowEdit, sortable: false, cellClass: changedFrom('currentNotes') },
                ...(this.isCommitted ? [] : [{ key: '_remove', label: '', width: 36, sortable: false, sticky: 'end' }])
            ];
        },
        banners() {
            return [
                {
                    key: 'lock',
                    color: '',
                    message: this.lockedBySelf
                        ? 'You have this proposal open for editing on another device.'
                        : `Locked for edit by: ${this.lockOwnerDisplay}`,
                    visible: this.lockedByOther,
                    dismissible: false,
                    action: this.lockedBySelf ? { label: 'Claim this device', fn: () => this.claimLock() } : null
                },
                {
                    key: 'conflict',
                    color: 'red',
                    message: 'Another session changed this proposal while you have unsaved edits. Save to keep your changes or discard them.',
                    visible: !!this.tableStore?.externalConflict,
                    action: { label: 'Discard', fn: () => this.handleRefresh() }
                },
                {
                    key: 'committed',
                    color: '',
                    message: `Committed by ${this.proposal?.committedBy} on ${formatDay(this.proposal?.committed)}. Committed proposals are read-only.`,
                    visible: this.isCommitted,
                    dismissible: false
                }
            ];
        },
        canCommit() {
            return !!this.proposal && !this.isCommitted && !this.isDirty && !this.lockedByOther
                && !this.committing && this.tableData.length > 0;
        }
    },
    watch: {
        proposalName: {
            handler(name) {
                if (!name || this.tableStore) return;
                this.tableStore = getReactiveStore(Requests.getInventoryProposalTable, Requests.saveInventoryProposalTable, [name]);
                this.checkLockStatus();
            },
            immediate: true
        },
        isDirty(value) {
            this.handleLockState(value);
        },
        banners: {
            handler(banners) {
                this.$notify.setBanners(this.containerPath, banners);
            },
            immediate: true
        }
    },
    beforeUnmount() {
        this.$notify.clearBanners(this.containerPath);
    },
    methods: {
        projected(row) {
            return ProposalUtils.projectQuantity(row, this.projectionDeciseconds);
        },
        async handleCellEdit(rowIdx, colIdx, value) {
            const key = this.columns[colIdx]?.key;
            const row = this.tableStore?.data[rowIdx];
            if (!key || !row) return;
            const previous = row[key];
            row[key] = value;
            if (!await this.acquireLockForEdit()) row[key] = previous;
        },
        async removeRow(row) {
            if (!await this.acquireLockForEdit()) return;
            const index = this.tableStore.data.indexOf(row);
            if (index !== -1) this.tableStore.data.splice(index, 1);
        },
        async handleSave() {
            await this.tableStore.save('Saving proposal...');
            await reloadProposals();
        },
        handleRefresh() {
            this.$modal.confirm(
                'This clears unsaved changes to the proposal.',
                () => this.tableStore?.load('Refreshing proposal...'),
                null,
                'Refresh Data',
                'Refresh Data',
                'Cancel'
            );
        },
        handleCommit() {
            if (!this.canCommit) return;
            const name = this.proposalName;
            this.$modal.custom(InventorySaveModal, {
                hasQtyChanges: true,
                initialNote: ProposalUtils.commitNote(name, getInventoryNoteMaxLength()),
                initialDate: this.projectionDate,
                onConfirm: async (scheduledDate, note) => {
                    this.committing = true;
                    try {
                        const { committed, failed } = await commitInventoryProposal(name, scheduledDate, note);
                        if (failed.length > 0) {
                            this.$modal.alert(
                                `Committed ${committed.join(', ') || 'nothing'}. Could not save ${failed.join(', ')}; those items stay in the proposal so you can commit again.`,
                                'Partially Committed'
                            );
                        }
                        await this.tableStore.load('Loading proposal...');
                    } catch (error) {
                        this.$modal.alert(error.message, 'Commit Failed');
                    } finally {
                        this.committing = false;
                    }
                }
            }, `Commit ${name}`);
        }
    },
    template: html`
        <div v-if="notFound" class="card red">
            <h3>Proposal Not Found</h3>
            <p>There is no proposal named "{{ proposalSlug }}".</p>
        </div>
        <TableComponent
            v-else
            theme="purple"
            :title="proposalName ? proposalName + (isCommitted ? ' (committed)' : ' proposal') : 'Proposal'"
            :data="tableData"
            :originalData="originalData"
            :columns="columns"
            default-sort-column="category"
            :isLoading="!tableStore || tableStore.isLoading || committing"
            :loading-message="committing ? 'Committing proposal...' : (tableStore?.loadingMessage || 'Loading proposal...')"
            :showRefresh="true"
            :showSearch="true"
            :sync-search-with-url="true"
            :container-path="containerPath"
            :navigate-to-path="navigateToPath"
            :external-dirty-state="isDirty"
            emptyMessage="This proposal has no items."
            class="mark-dirty"
            @cell-edit="handleCellEdit"
            @on-save="handleSave"
            @refresh="handleRefresh"
        >
            <template #header-area>
                <div v-if="!isCommitted" class="button-bar">
                    <div class="card white">
                        Projected on:
                    </div>
                    <input type="date" v-model="projectionDate" :min="todayISO" />
                    <button
                        class="purple"
                        :disabled="!canCommit"
                        :title="isDirty ? 'Save or discard your edits before committing' : 'Apply this proposal to inventory'"
                        @click="handleCommit"
                    >Commit</button>
                </div>
            </template>
            <template #default="{ row, column }">
                <ItemImageComponent
                    v-if="column.key === 'image'"
                    :imageSize="32"
                    :itemNumber="row.itemNumber"
                />
                <span v-else-if="column.key === '_projected'">{{ projected(row) }}</span>
                <span v-else-if="column.key === 'currentQuantity' && row.missing" class="red" title="This item no longer exists in inventory">missing</span>
                <button
                    v-else-if="column.key === '_remove' && allowEdit"
                    class="button-symbol white"
                    @click.stop="removeRow(row)"
                    title="Remove this item from the proposal"
                >×</button>
            </template>
        </TableComponent>
    `
};
