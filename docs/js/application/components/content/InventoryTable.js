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
    inject: ['appContext', '$modal'],
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
            isLocked: false, // Track lock state (owned by this component)
            lockingInProgress: false, // Prevent concurrent lock operations
            lockedByOther: false, // Track if locked by another user
            lockOwner: null, // Track who owns the lock
            lockCheckComplete: false // Track if initial lock check is done
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
        allowEdit() {
            // Allow editing only if editMode is true AND not locked by another user
            return this.editMode && !this.lockedByOther;
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
        
        // Check lock status when component mounts
        await this.checkLockStatus();
    },
    watch: {
        isDirty(newValue, oldValue) {
            console.log(`[InventoryTable.isDirty watcher] isDirty changed from ${oldValue} to ${newValue}, lockCheckComplete=${this.lockCheckComplete}, isLocked=${this.isLocked}, lockedByOther=${this.lockedByOther}`);
            
            // CRITICAL: Don't handle dirty state until lock check is complete
            // This prevents race condition where isDirty fires before we know lock status
            if (!this.lockCheckComplete) {
                console.log(`[InventoryTable] Skipping isDirty handling - lock check not complete yet`);
                return;
            }
            
            // CRITICAL: Only handle lock state if not locked by another user
            // This prevents infinite loop when there are unsaved changes but sheet is locked
            console.log(`[InventoryTable.isDirty watcher] Calling handleLockState with isDirty=${newValue}, lockedByOther=${this.lockedByOther}`);
            if (!this.lockedByOther) {
                this.handleLockState(newValue);
            } else {
                console.log(`[InventoryTable.isDirty watcher] NOT calling handleLockState - locked by ${this.lockOwner}`);
            }
        }
    },
    methods: {
        async checkLockStatus() {
            const user = authState.user?.email;
            console.log(`[InventoryTable.checkLockStatus] Checking lock for user: "${user}", tabTitle: "${this.tabTitle}"`);
            if (!user || !this.tabTitle) {
                console.log('[InventoryTable.checkLockStatus] Missing user or tabTitle, skipping check');
                return;
            }
            
            try {
                const lockInfo = await Requests.getInventoryLock(this.tabTitle, user);
                console.log(`[InventoryTable.checkLockStatus] Lock info for "${this.tabTitle}":`, lockInfo);
                if (lockInfo) {
                    this.lockedByOther = lockInfo.user !== user;
                    this.lockOwner = lockInfo.user;
                    
                    console.log(`[InventoryTable.checkLockStatus] Lock owner: "${lockInfo.user}", current user: "${user}", lockedByOther: ${this.lockedByOther}`);
                    if (this.lockedByOther) {
                        console.log(`[InventoryTable] Category locked by ${lockInfo.user}`);
                    }
                } else {
                    console.log(`[InventoryTable.checkLockStatus] No lock found for "${this.tabTitle}"`);
                    this.lockedByOther = false;
                    this.lockOwner = null;
                }
            } catch (error) {
                console.error('[InventoryTable] Failed to check lock status:', error);
            } finally {
                this.lockCheckComplete = true;
            }
        },
        
        async handleLockState(isDirty) {
            console.log(`[InventoryTable.handleLockState] CALLED with isDirty=${isDirty}, isLocked=${this.isLocked}, lockingInProgress=${this.lockingInProgress}, lockedByOther=${this.lockedByOther}`);
            
            if (this.lockingInProgress) {
                console.log(`[InventoryTable.handleLockState] RETURNING - lockingInProgress`);
                return;
            }
            
            // CRITICAL: Never attempt lock operations if locked by another user
            if (this.lockedByOther) {
                console.log(`[InventoryTable] Skipping lock operation - category locked by ${this.lockOwner}`);
                return;
            }
            
            const user = authState.user?.email;
            if (!user || !this.tabTitle) {
                console.log(`[InventoryTable.handleLockState] RETURNING - no user (${user}) or tabTitle (${this.tabTitle})`);
                return;
            }
            
            this.lockingInProgress = true;
            
            try {
                if (isDirty && !this.isLocked) {
                    console.log(`[InventoryTable.handleLockState] Branch: isDirty && !isLocked - attempting to acquire lock`);
                    const lockAcquired = await Requests.lockSheet('INVENTORY', this.tabTitle, user);
                    if (lockAcquired) {
                        this.isLocked = true;
                        this.lockedByOther = false;
                        this.lockOwner = user;
                        console.log(`[InventoryTable] Locked INVENTORY/${this.tabTitle} for ${user}`);
                    } else {
                        const lockInfo = await Requests.getInventoryLock(this.tabTitle, user);
                        if (lockInfo && lockInfo.user !== user) {
                            this.lockedByOther = true;
                            this.lockOwner = lockInfo.user;
                            console.warn(`[InventoryTable] Category locked by ${lockInfo.user}`);
                            
                            // Refresh page to show newly identified lock information
                            await this.handleRefresh();
                        }
                    }
                } else if (!isDirty && this.isLocked) {
                    console.log(`[InventoryTable.handleLockState] Branch: !isDirty && isLocked - attempting to release lock`);
                    console.log(`[InventoryTable.handleLockState] About to call unlockSheet for ${this.tabTitle}`);
                    const unlocked = await Requests.unlockSheet('INVENTORY', this.tabTitle, user);
                    console.log(`[InventoryTable.handleLockState] unlockSheet returned:`, unlocked);
                    if (unlocked) {
                        this.isLocked = false;
                        this.lockedByOther = false;
                        this.lockOwner = null;
                        console.log(`[InventoryTable] Unlocked INVENTORY/${this.tabTitle} for ${user}`);
                    } else {
                        console.warn(`[InventoryTable] unlockSheet returned false - lock NOT released`);
                    }
                } else {
                    console.log(`[InventoryTable.handleLockState] No action taken - isDirty=${isDirty}, isLocked=${this.isLocked}`);
                }
            } catch (error) {
                console.error('[InventoryTable] Lock operation failed:', error);
                // Show error to user if lock acquisition timeout or other critical failure
                if (error.message && error.message.includes('Failed to acquire write lock')) {
                    this.$modal.alert(
                        `Unable to acquire lock for ${this.tabTitle}. The system is experiencing high concurrency. Please try again in a moment.`,
                        'Error'
                    );
                } else {
                    this.$modal.alert(
                        `Lock operation failed: ${error.message}`,
                        'Error'
                    );
                }
            } finally {
                this.lockingInProgress = false;
            }
        },
        
        async handleRefresh() {
            // Reload inventory data (cache will be automatically invalidated)
            invalidateCache([
                { namespace: 'database', methodName: 'getData', args: ['INVENTORY', this.tabTitle] }
            ], true);
        },
        async handleCellEdit(rowIdx, colIdx, value) {
            // CRITICAL: Check lock status on every edit (cached for 20s to avoid rate limits)
            const user = authState.user?.email;
            if (user && this.tabTitle) {
                try {
                    const lockInfo = await Requests.getInventoryLock(this.tabTitle, user);
                    if (lockInfo) {
                        // Category is locked by another user - block the edit
                        console.warn(`[InventoryTable] Edit blocked - category locked by ${lockInfo.user}`);
                        
                        // Update lock state immediately to disable editing
                        this.lockedByOther = true;
                        this.lockOwner = lockInfo.user;
                        
                        this.$modal.alert(`Cannot edit: this category is locked by ${lockInfo.user}`, 'Locked');
                        return;
                    }
                    
                    // No conflicting lock - acquire lock if we don't already have one
                    if (!this.isLocked) {
                        console.log(`[InventoryTable] Acquiring lock on first edit...`);
                        const lockAcquired = await Requests.lockSheet('INVENTORY', this.tabTitle, user);
                        if (lockAcquired) {
                            this.isLocked = true;
                            this.lockedByOther = false;
                            this.lockOwner = user;
                            console.log(`[InventoryTable] Lock acquired successfully`);
                        } else {
                            // Failed to acquire lock - check again why
                            const recheckLock = await Requests.getInventoryLock(this.tabTitle, user);
                            if (recheckLock) {
                                console.warn(`[InventoryTable] Lock acquisition failed - now locked by ${recheckLock.user}`);
                                this.lockedByOther = true;
                                this.lockOwner = recheckLock.user;
                                this.$modal.alert(`Cannot edit: this category is locked by ${recheckLock.user}`, 'Locked');
                                return;
                            }
                        }
                    }
                } catch (error) {
                    console.error('[InventoryTable] Error checking lock on edit:', error);
                }
            }
            
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