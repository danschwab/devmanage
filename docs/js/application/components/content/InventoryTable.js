import { html, Requests, TableComponent, getReactiveStore, createAnalysisConfig, NavigationRegistry, Priority, invalidateCache, authState } from '../../index.js';




// Image component for displaying item thumbnails
// Image URL should be provided via analysis step in reactive store
export const ItemImageComponent = {
    props: {
        imageUrl: {
            type: String,
            default: 'images/placeholder.png'
        },
        itemNumber: {
            type: String,
            default: ''
        },
        imageSize: {
            type: Number,
            default: 64
        }
    },
    inject: ['$modal'],
    computed: {
        displayUrl() {
            return this.imageUrl || 'images/placeholder.png';
        },
        imageFound() {
            return this.displayUrl !== 'images/placeholder.png';
        }
    },
    methods: {
        showImageModal() {
            if (this.imageFound) {
                this.$modal.image(this.displayUrl, `Image: ${this.itemNumber}`, this.itemNumber);
            }
        },
        handleError() {
            // If image fails to load, will fall back to placeholder via error handling in template
            console.warn(`Failed to load image for item ${this.itemNumber}`);
        }
    },
    template: html`
        <div class="item-image-container" :style="{ position: 'relative', width: imageSize + 'px', height: imageSize + 'px' }">
            <img 
                :src="displayUrl" 
                alt="Item Image" 
                :style="imageFound ? 'cursor: pointer;' : ''"
                @click="showImageModal"
                @error="handleError"
            />
        </div>
    `
};



export const InventoryTableComponent = {
    components: {
        TableComponent,
        ItemImageComponent
    },
    inject: ['appContext', 'globalLocksStore'],
    props: {
        containerPath: {
            type: String,
            default: 'inventory'
        },
        inventoryName: {
            type: String,
            default: 'Inventory'
        },
        tabTitle: {
            type: String,
            default: undefined
        },
        editMode: {
            type: Boolean,
            default: true
        }
    },
    data() {
        return {
            inventoryTableStore: null,
            lockedByOther: false, // Track if locked by another user
            lockOwner: null // Track who owns the lock
        };
    },
    computed: {
        columns() {
            // Dynamically set columns' editable property based on allowEdit
            return [
                { 
                    key: 'image', 
                    label: 'IMG',
                    width: 1,
                    sortable: false
                },
                { 
                    key: 'itemNumber', 
                    label: 'ITEM#',
                    width: 120,
                    sortable: true
                },
                { 
                    key: 'quantity', 
                    label: 'QTY',
                    format: 'number',
                    editable: this.allowEdit,
                    autoColor: true,
                    width: 120,
                    sortable: true
                },
                { 
                    key: 'description', 
                    label: 'Description (visible in pack lists)',
                    editable: this.allowEdit,
                    sortable: true
                },
                { 
                    key: 'notes', 
                    label: 'Notes (internal only)',
                    editable: this.allowEdit,
                    sortable: false
                }
            ];
        },
        tableData() {
            return this.inventoryTableStore ? this.inventoryTableStore.data : [];
        },
        originalData() {
            // Use the originalData from the store, not a copy of the reactive data
            return this.inventoryTableStore && Array.isArray(this.inventoryTableStore.originalData)
                ? JSON.parse(JSON.stringify(this.inventoryTableStore.originalData))
                : [];
        },
        error() {
            return this.inventoryTableStore ? this.inventoryTableStore.error : null;
        },
        loadingMessage() {
            return this.inventoryTableStore ? (this.inventoryTableStore.loadingMessage || 'Loading data...') : 'Loading data...';
        },
        isLoading() {
            return this.inventoryTableStore ? this.inventoryTableStore.isLoading : false;
        },
        isDirty() {
            return this.inventoryTableStore?.isModified || false;
        },
        myLock() {
            // Get this tab's lock from the global locks store
            const locks = this.globalLocksStore?.data;
            if (!locks || !this.tabTitle) return null;
            return locks.find(lock => 
                lock.Spreadsheet === 'INVENTORY' && 
                lock.Tab === this.tabTitle
            ) || null;
        },
        allowEdit() {
            // Allow editing only if editMode is true AND not locked by another user
            const user = authState.user?.email;
            const isLockedByOther = this.myLock && this.myLock.User !== user;
            return this.editMode && !isLockedByOther;
        }
    },
    async mounted() {
        // Create analysis config for image URLs
        const analysisConfig = [
            createAnalysisConfig(
                Requests.getItemImageUrl,
                'imageUrl',
                'Loading item images...',
                ['itemNumber'],
                [],
                null, // Store in AppData, not a column
                false,
                Priority.BACKGROUND // Images are visual enhancements, lowest priority
            )
        ];
        
        // Defensive: always set up the store before using it
        this.inventoryTableStore = getReactiveStore(
            Requests.getInventoryTabData,
            Requests.saveInventoryTabData,
            [this.tabTitle, undefined, undefined], // No filters needed - search is handled in UI
            analysisConfig
        );
        
        // Watch global locks store for this tab's lock status
        this.$watch(() => this.myLock, (lockInfo) => {
            const user = authState.user?.email;
            if (lockInfo && lockInfo.User) {
                this.lockedByOther = lockInfo.User !== user;
                this.lockOwner = lockInfo.User;
                console.log(`[InventoryTable] Lock status: lockedByOther=${this.lockedByOther}, owner=${lockInfo.User}`);
            } else {
                this.lockedByOther = false;
                this.lockOwner = null;
            }
        }, { immediate: true });
        
        // Watch editMode to acquire/release locks
        this.$watch(() => this.editMode, async (isEditMode) => {
            const user = authState.user?.email;
            if (!user || !this.tabTitle) return;
            
            if (isEditMode && !this.lockedByOther) {
                // Entering edit mode - acquire lock immediately
                console.log(`[InventoryTable] Acquiring lock for ${this.tabTitle}`);
                try {
                    await Requests.lockSheet('INVENTORY', this.tabTitle, user);
                    // Invalidate locks cache to refresh global store
                    invalidateCache([
                        { namespace: 'app_utils', methodName: 'getAllLocks', args: [] },
                        { namespace: 'api', methodName: 'getAllLocks', args: [] }
                    ]);
                } catch (error) {
                    console.error(`[InventoryTable] Failed to acquire lock:`, error);
                }
            } else if (!isEditMode && this.myLock && this.myLock.User === user) {
                // Exiting edit mode - release lock
                console.log(`[InventoryTable] Releasing lock for ${this.tabTitle}`);
                try {
                    await Requests.unlockSheet('INVENTORY', this.tabTitle, user);
                    // Invalidate locks cache to refresh global store
                    invalidateCache([
                        { namespace: 'app_utils', methodName: 'getAllLocks', args: [] },
                        { namespace: 'api', methodName: 'getAllLocks', args: [] }
                    ]);
                } catch (error) {
                    console.error(`[InventoryTable] Failed to release lock:`, error);
                }
            }
        }, { immediate: true });
        
        // Watch isDirty to release lock after successful save
        let previousDirty = false;
        this.$watch(() => this.isDirty, async (isDirty) => {
            const user = authState.user?.email;
            // If data was dirty and is now clean (save completed), release lock
            if (previousDirty && !isDirty && this.myLock && this.myLock.User === user) {
                console.log(`[InventoryTable] Data saved, releasing lock for ${this.tabTitle}`);
                try {
                    await Requests.unlockSheet('INVENTORY', this.tabTitle, user);
                    // Invalidate locks cache to refresh global store
                    invalidateCache([
                        { namespace: 'app_utils', methodName: 'getAllLocks', args: [] },
                        { namespace: 'api', methodName: 'getAllLocks', args: [] }
                    ]);
                } catch (error) {
                    console.error(`[InventoryTable] Failed to release lock after save:`, error);
                }
            }
            previousDirty = isDirty;
        });
    },
    methods: {
        async handleRefresh() {
            // Reload inventory data (cache will be automatically invalidated)
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['INVENTORY', this.tabTitle] }
            ], true);
        },
        handleCellEdit(rowIdx, colIdx, value) {
            const colKey = this.columns[colIdx]?.key;
            if (colKey && this.inventoryTableStore) {
                this.inventoryTableStore.data[rowIdx][colKey] = value;
            }
        },
        async handleSave() {
            // Only use the store's save method if this is called from the on-save event
            if (this.inventoryTableStore) {
                console.log('[InventoryTableComponent] Saving data:', JSON.parse(JSON.stringify(this.inventoryTableStore.data)));
                await this.inventoryTableStore.save('Saving inventory...');            }
        }
    },
    template: html `
        <slot>
            <div v-if="lockedByOther" class="card white">
                Locked for edit by: {{ lockOwner && lockOwner.includes('@') ? lockOwner.split('@')[0] : (lockOwner || 'Unknown') }}
            </div>

            <TableComponent
                ref="tableComponent"
                theme="purple"
                :data="tableData"
                :title="inventoryName || tabTitle"
                :originalData="originalData"
                :columns="columns"
                :isLoading="isLoading"
                :error="error"
                :showRefresh="true"
                :showSearch="true"
                :sync-search-with-url="true"
                :container-path="containerPath"
                :navigate-to-path="appContext.navigateToPath"
                emptyMessage="No inventory items found"
                :loading-message="loadingMessage"
                class="inventory-table-component mark-dirty"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @on-save="handleSave"
            >
                <template #default="{ row, column, rowIndex, cellRowIndex, cellColIndex }">
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :itemNumber="row.itemNumber"
                        :imageUrl="row.AppData && row.AppData.imageUrl"
                    />
                </template>
            </TableComponent>
        </slot>
    `
};