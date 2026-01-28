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
        },
        
        // Watch for save errors to detect lock conflicts
        'inventoryTableStore.error'(newError) {
            if (!newError) return;
            
            // Check if this is a lock error
            const lockErrorPattern = /locked by (.+)$/i;
            const match = newError.match(lockErrorPattern);
            
            if (match) {
                const lockOwner = match[1];
                console.log(`[InventoryTable] Detected lock error during save - locked by ${lockOwner}`);
                
                // Update lock state (lockedByOther watcher will handle mode changes if needed)
                this.lockedByOther = true;
                this.lockOwner = lockOwner;
                this.isLocked = false; // We don't own the lock
                
                // Show alert to user
                this.$modal.alert(`Cannot save: this inventory tab is locked by ${lockOwner}`, 'Locked');
            }
        },
        
        // Watch for lock status changes
        // Note: InventoryTable doesn't have explicit edit mode navigation like PacklistTable,
        // but allowEdit computed property will prevent further edits when lockedByOther=true
        lockedByOther(newValue) {
            if (newValue) {
                console.log(`[InventoryTable] Lock detected - editing disabled (locked by ${this.lockOwner})`);
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
            
            // CRITICAL: Wait for store to finish initial load before checking for stale locks
            // This ensures isDirty is accurate when we check it
            if (this.inventoryTableStore && this.inventoryTableStore.isLoading) {
                console.log('[InventoryTable.checkLockStatus] Waiting for store to finish loading...');
                // Wait for loading to complete by watching isLoading
                await new Promise(resolve => {
                    const unwatch = this.$watch('inventoryTableStore.isLoading', (newValue) => {
                        if (!newValue) {
                            unwatch();
                            resolve();
                        }
                    });
                });
                console.log('[InventoryTable.checkLockStatus] Store loading complete, isDirty:', this.isDirty);
            }
            
            try {
                // Don't pass currentUser parameter - we need to see ALL locks including our own
                // to detect stale locks held by current user
                const lockInfo = await Requests.getInventoryLock(this.tabTitle);
                console.log(`[InventoryTable.checkLockStatus] Lock info for "${this.tabTitle}":`, lockInfo);
                if (lockInfo) {
                    this.lockedByOther = lockInfo.user !== user;
                    this.lockOwner = lockInfo.user;
                    
                    console.log(`[InventoryTable.checkLockStatus] Lock owner: "${lockInfo.user}", current user: "${user}", lockedByOther: ${this.lockedByOther}`);
                    if (this.lockedByOther) {
                        console.log(`[InventoryTable] Category locked by ${lockInfo.user}`);
                    } else {
                        // Lock is held by current user - check for stale lock
                        // Stale lock = lock held by me but data is not dirty
                        this.isLocked = true;
                        console.log(`[InventoryTable.checkLockStatus] Lock held by current user, checking if stale. isDirty=${this.isDirty}`);
                        if (!this.isDirty) {
                            console.log(`[InventoryTable] Detected stale lock - removing lock held by ${user}`);
                            const unlocked = await Requests.unlockSheet('INVENTORY', this.tabTitle, user);
                            if (unlocked) {
                                this.isLocked = false;
                                console.log(`[InventoryTable] Stale lock removed successfully`);
                            } else {
                                console.warn(`[InventoryTable] Failed to remove stale lock`);
                            }
                        } else {
                            console.log(`[InventoryTable] Lock is NOT stale - data is dirty, keeping lock`);
                        }
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
        
        async checkAndAcquireLock() {
            const user = authState.user?.email;
            if (!user || !this.tabTitle) return { success: false, reason: 'no-user' };
            
            // Check for conflicts (no user filter - see all locks)
            const lockInfo = await Requests.getInventoryLock(this.tabTitle);
            if (lockInfo && lockInfo.user !== user) {
                this.lockedByOther = true;
                this.lockOwner = lockInfo.user;
                return { success: false, reason: 'locked', owner: lockInfo.user };
            }
            
            // Acquire if needed
            if (!this.isLocked) {
                const lockAcquired = await Requests.lockSheet('INVENTORY', this.tabTitle, user);
                if (lockAcquired) {
                    this.isLocked = true;
                    this.lockedByOther = false;
                    this.lockOwner = user;
                    return { success: true, reason: 'acquired' };
                }
                return { success: false, reason: 'acquisition-failed' };
            }
            
            return { success: true, reason: 'already-locked' };
        },
        
        async handleCellEdit(rowIdx, colIdx, value) {
            // Check lock and acquire if needed (cached for 20s to avoid rate limits)
            const lockResult = await this.checkAndAcquireLock();
            if (!lockResult.success) {
                if (lockResult.reason === 'locked') {
                    this.$modal.alert(`Cannot edit: this category is locked by ${lockResult.owner}`, 'Locked');
                }
                return;
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