import { html, Requests, TableComponent, BannerNotifications, getReactiveStore, createAnalysisConfig, NavigationRegistry, Priority, invalidateCache, authState, undoRegistry, EditHistoryUtils, todayISOString } from '../../index.js';
import { sheetLockMixin } from '../../utils/sheetLockMixin.js';

/**
 * Modal displayed before any inventory save.
 * Asks for an effective date (today = apply immediately; future = schedule) and a required note.
 *
 * Props:
 *   onConfirm(scheduledDate: string, note: string) — called with ISO date and trimmed note on confirm.
 *
 * Emits 'close-modal' to close itself.
 */
const InventorySaveModal = {
    props: {
        onConfirm: {
            type: Function,
            required: true
        },
        hasQtyChanges: {
            type: Boolean,
            default: true
        }
    },
    data() {
        return {
            scheduledDate: todayISOString(),
            note: '',
            error: null
        };
    },
    computed: {
        todayISO() {
            return todayISOString();
        },
        isFutureDate() {
            return this.scheduledDate > this.todayISO;
        },
        charCount() {
            return this.note.length;
        }
    },
    methods: {
        validate() {
            if (this.hasQtyChanges && !this.note.trim()) {
                this.error = 'A note is required for quantity changes';
                return false;
            }
            if (!this.scheduledDate || this.scheduledDate < this.todayISO) {
                this.error = 'Date cannot be in the past';
                return false;
            }
            this.error = null;
            return true;
        },
        handleApplyNow() {
            if (!this.validate()) return;
            this.onConfirm(this.todayISO, this.note.trim());
            this.$emit('close-modal');
        },
        handleSchedule() {
            if (!this.validate()) return;
            if (!this.isFutureDate) {
                this.error = 'Select a future date to schedule';
                return;
            }
            this.onConfirm(this.scheduledDate, this.note.trim());
            this.$emit('close-modal');
        }
    },
    template: html`
        <div class="content">
            <div class="form-group">
                <label>Note <span v-if="hasQtyChanges" style="color: var(--color-red)">*</span></label>
                <input
                    type="text"
                    v-model="note"
                    maxlength="25"
                    :placeholder="hasQtyChanges ? 'What changed and why?' : 'Optional note'"
                    :class="{ error: !!error && !note.trim() }"
                    autofocus
                    @keyup.enter="handleApplyNow"
                />
                <span v-if="error && !note.trim()" class="error-message">{{ error }}</span>
                <span v-else class="helper-text">{{ charCount }}/25</span>
            </div>
            <div class="form-group">
                <label>Effective Date</label>
                <input type="date" v-model="scheduledDate" :min="todayISO" :class="{ error: !!error && scheduledDate < todayISO }" />
                <span v-if="error && scheduledDate < todayISO" class="error-message">{{ error }}</span>
                <span v-else-if="!isFutureDate" class="helper-text">Changes will be immediate</span>
                <span v-else class="helper-text">Changes will be scheduled</span>
            </div>
            <div class="button-bar">
                <button v-if="!isFutureDate" @click="handleApplyNow" class="purple">Apply Now</button>
                <button v-else @click="handleSchedule" class="purple" :title="'Schedule for ' + scheduledDate">Schedule</button>
                <button @click="$emit('close-modal')">Cancel</button>
            </div>
        </div>
    `
};



// Simple modal component for entering new item number
const NewItemNumberPrompt = {
    props: ['initialItemNumber', 'existingItems', 'onConfirm'],
    data() {
        return {
            itemNumber: this.initialItemNumber,
            error: null,
            suggestion: null,
            isNewPrefix: false
        };
    },
    computed: {
        helperText() {
            if (this.error) {
                return null; // Error takes precedence
            }            if (this.isNewPrefix && this.itemNumber) {
                return `"${this.itemNumber}" is a new prefix`;
            }            if (this.suggestion) {
                return `Next available: ${this.suggestion}`;
            }
            return 'Creating a new item';
        },
        ghostText() {
            // Show the remainder of the suggestion that hasn't been typed yet
            if (!this.suggestion || !this.itemNumber) {
                return '';
            }
            
            if (this.suggestion.startsWith(this.itemNumber)) {
                return this.suggestion.substring(this.itemNumber.length);
            }
            
            return '';
        }
    },
    methods: {
        validate() {
            if (!this.itemNumber) {
                this.error = 'Item number is required';
                this.suggestion = null;
                return false;
            }
            
            const duplicate = this.existingItems.find(
                item => item.itemNumber === this.itemNumber
            );
            
            if (duplicate) {
                this.error = 'Item number already exists';
                this.suggestion = null;
                return false;
            }
            
            this.error = null;
            return true;
        },
        updateSuggestion() {
            // Detect if user is typing a prefix that matches existing items
            if (!this.itemNumber || this.itemNumber.length < 2) {
                this.isNewPrefix = false;
                return;
            }
            
            // Find items that start with the current input
            const matchingItems = this.existingItems
                .map(item => item.itemNumber)
                .filter(num => num && num.startsWith(this.itemNumber));
            
            if (matchingItems.length > 0) {
                // Try to extract pattern and suggest next number
                const pattern = this.detectPatternFromPrefix(this.itemNumber, matchingItems);
                if (pattern) {
                    this.suggestion = this.incrementPattern(pattern);
                    this.isNewPrefix = false;
                } else {
                    this.suggestion = null;
                    this.isNewPrefix = false;
                }
            } else {
                // No direct matches - check if user typed a complete item following an existing pattern
                // Extract the prefix part from user's input (e.g., "CHAIR-" from "CHAIR-005")
                const prefixMatch = this.itemNumber.match(/^([A-Za-z\-_]+)(\d+)$/);
                
                if (prefixMatch) {
                    const extractedPrefix = prefixMatch[1];
                    // Check if any items start with this extracted prefix
                    const prefixItems = this.existingItems
                        .map(item => item.itemNumber)
                        .filter(num => num && num.startsWith(extractedPrefix));
                    
                    if (prefixItems.length > 0) {
                        // This prefix exists, so not a new prefix - just show default text
                        this.suggestion = null;
                        this.isNewPrefix = false;
                    } else {
                        // Truly a new prefix
                        this.suggestion = null;
                        this.isNewPrefix = true;
                    }
                } else {
                    // User is typing a prefix (e.g., "BLAH-")
                    this.suggestion = null;
                    this.isNewPrefix = true;
                }
            }
        },
        detectPatternFromPrefix(prefix, matchingItems) {
            // Try to detect the full prefix pattern from matching items
            // even if user has only typed a partial prefix
            const patterns = {};
            
            matchingItems.forEach(item => {
                // Try to extract the full prefix including separators
                // Match patterns like "PROP-123", "PROPS001", "LT-05", etc.
                const match = item.match(/^([A-Za-z\-_]+)(\d+)$/);
                if (match) {
                    const fullPrefix = match[1];
                    const number = parseInt(match[2], 10);
                    const padding = match[2].length;
                    
                    // Only consider this pattern if the full prefix starts with user's input
                    if (fullPrefix.startsWith(prefix)) {
                        if (!patterns[fullPrefix]) {
                            patterns[fullPrefix] = {
                                numbers: [],
                                padding: padding
                            };
                        }
                        patterns[fullPrefix].numbers.push(number);
                    }
                }
            });
            
            // Find the most common prefix pattern
            let bestPrefix = null;
            let maxNumber = 0;
            let maxCount = 0;
            let bestPadding = 3;
            
            for (const [fullPrefix, data] of Object.entries(patterns)) {
                if (data.numbers.length > maxCount) {
                    maxCount = data.numbers.length;
                    bestPrefix = fullPrefix;
                    maxNumber = Math.max(...data.numbers);
                    bestPadding = data.padding;
                } else if (data.numbers.length === maxCount) {
                    // If tied, prefer shorter prefix (more specific)
                    if (!bestPrefix || fullPrefix.length < bestPrefix.length) {
                        bestPrefix = fullPrefix;
                        maxNumber = Math.max(...data.numbers);
                        bestPadding = data.padding;
                    }
                }
            }
            
            if (bestPrefix) {
                return {
                    prefix: bestPrefix,
                    nextNumber: maxNumber + 1,
                    padding: bestPadding
                };
            }
            
            return null;
        },
        incrementPattern(pattern) {
            const { prefix, nextNumber, padding } = pattern;
            return `${prefix}${String(nextNumber).padStart(padding, '0')}`;
        },
        handleKeydown(event) {
            // Accept suggestion on Tab key
            if (event.key === 'Tab' && this.suggestion) {
                event.preventDefault();
                this.itemNumber = this.suggestion;
            }
        },
        handleSubmit() {
            if (this.validate()) {
                this.onConfirm(this.itemNumber);
                this.$emit('close-modal');
            }
        }
    },
    watch: {
        itemNumber() {
            this.validate();
            this.updateSuggestion();
        }
    },
    template: html`
        <div class="content">
            <div class="form-group">
                <div class="autocomplete-wrapper">
                    <input 
                        id="item-number-input"
                        type="text"
                        v-model="itemNumber"
                        @keyup.enter="handleSubmit"
                        @keydown="handleKeydown"
                        :class="{ error: error }"
                        autofocus
                    />
                    <div class="ghost-text" v-if="ghostText">{{ itemNumber }}<span class="ghost">{{ ghostText }}</span></div>
                </div>
                <span v-if="error" class="error-message">{{ error }}</span>
                <span v-else-if="helperText" class="helper-text">{{ helperText }}</span>
            </div>
            <div class="button-bar">
                <button @click="handleSubmit" :disabled="!!error" class="purple">Add Item</button>
                <button @click="$emit('close-modal')">Cancel</button>
            </div>
        </div>
    `
};


// Modal component for viewing a full-size thumbnail with a replace option
const ImageViewWithReplaceComponent = {
    props: {
        thumbnailUrl: { type: String, required: true },
        itemNumber: { type: String, default: '' },
        onReplace: { type: Function, default: null }
    },
    data() {
        return { fullImageUrl: null };
    },
    computed: {
        displayUrl() {
            return this.fullImageUrl || this.thumbnailUrl;
        }
    },
    async mounted() {
        if (this.itemNumber) {
            this.fullImageUrl = await Requests.getItemImageBlobUrl(this.itemNumber) || null;
        }
    },
    template: html`
        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
            <img :src="displayUrl" alt="Image" style="max-width: 90vw; max-height: 70vh; object-fit: contain;" />
            <div class="button-bar" v-if="onReplace">
                <button class="gray" @click="() => { onReplace(); $emit('close-modal'); }">Replace Thumbnail</button>
            </div>
        </div>
    `
};

// Modal component for uploading or replacing an item thumbnail
const ImageUploadComponent = {
    props: {
        itemNumber: { type: String, required: true },
        mode: { type: String, default: 'add' }, // 'add' | 'replace'
        onUploadSuccess: { type: Function, default: null }
    },
    data() {
        return {
            selectedFile: null,
            previewUrl: null,
            uploading: false,
            uploadError: null
        };
    },
    methods: {
        handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                this.uploadError = 'Please select an image file.';
                return;
            }
            this.uploadError = null;
            this.selectedFile = file;
            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = URL.createObjectURL(file);
        },
        async handleUpload() {
            if (!this.selectedFile || this.uploading) return;
            this.uploading = true;
            this.uploadError = null;
            try {
                const newUrl = await Requests.uploadItemImage(this.selectedFile, this.itemNumber);
                if (newUrl) {
                    this.onUploadSuccess?.(newUrl);
                    this.$emit('close-modal');
                } else {
                    this.uploadError = 'Upload failed. Please try again.';
                }
            } catch (e) {
                console.error('[ImageUploadComponent] Upload error:', e);
                this.uploadError = 'Upload failed. Please try again.';
            } finally {
                this.uploading = false;
            }
        }
    },
    beforeUnmount() {
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    },
    template: html`
        <div style="display: flex; flex-direction: column; gap: 12px; min-width: 260px;">
            <div v-if="previewUrl" style="text-align: center;">
                <img :src="previewUrl" alt="Preview" style="max-width: 100%; max-height: 200px; object-fit: contain; border-radius: 4px;" />
            </div>
            <label style="display: flex; flex-direction: column; gap: 4px;">
                <span style="font-size: 0.85em; color: var(--color-text-secondary, #888);">Select image file</span>
                <input type="file" accept="image/*" @change="handleFileSelect" :disabled="uploading" />
            </label>
            <div v-if="uploadError" style="color: var(--color-error, #c00); font-size: 0.85em;">{{ uploadError }}</div>
            <div class="button-bar">
                <button @click="handleUpload" :disabled="!selectedFile || uploading">
                    {{ uploading ? 'Uploading...' : (mode === 'replace' ? 'Replace' : 'Upload') }}
                </button>
                <button class="gray" @click="$emit('close-modal')" :disabled="uploading">Cancel</button>
            </div>
        </div>
    `
};

// Image component for displaying item thumbnails
// Image URL should be provided via analysis step in reactive store
export const ItemImageComponent = {
    props: {
        imageUrl: {
            type: String,
            default: 'assets/placeholder.png'
        },
        itemNumber: {
            type: String,
            default: ''
        },
        imageSize: {
            type: Number,
            default: 64
        },
        editable: {
            type: Boolean,
            default: false
        }
    },
    inject: ['$modal'],
    data() {
        return {
            localImageUrl: null
        };
    },
    computed: {
        displayUrl() {
            return this.localImageUrl || this.imageUrl || 'assets/placeholder.png';
        },
        imageFound() {
            return this.displayUrl !== 'assets/placeholder.png';
        }
    },
    methods: {
        showImageModal() {
            if (this.imageFound) {
                this.$modal.custom(ImageViewWithReplaceComponent, {
                    thumbnailUrl: this.displayUrl,
                    itemNumber: this.itemNumber,
                    modalClass: 'reading-menu',
                    onReplace: (this.editable && this.itemNumber) ? () => this.showUploadModal() : null
                }, `Image: ${this.itemNumber}`);
            }
        },
        showUploadModal() {
            if (!this.editable) return;
            const mode = this.imageFound ? 'replace' : 'add';
            const title = this.imageFound ? 'Replace Thumbnail' : 'Add Thumbnail';
            this.$modal.custom(ImageUploadComponent, {
                itemNumber: this.itemNumber,
                mode,
                onUploadSuccess: (newUrl) => {
                    this.localImageUrl = newUrl;
                    invalidateCache([
                            { namespace: 'database', methodName: 'getItemImageUrl', args: [this.itemNumber, '1rvWRUB38BsQJQyOPtF1JEG20qJPvTjZM'] },
                            { namespace: 'database', methodName: 'getItemImageBlobUrl', args: [this.itemNumber, '1rvWRUB38BsQJQyOPtF1JEG20qJPvTjZM'] }
                        ]);
                }
            }, title);
        },
        handleError() {
            console.warn(`[icons] Browser failed to load image for "${this.itemNumber}": ${this.displayUrl}`);
            console.warn('[icons] If the URL looks correct, the file may not be shared with the authenticated user, or the lh3.googleusercontent.com CDN requires a valid Google session.');
        }
    },
    template: html`
        <div :class="['item-image-container', { 'image-missing': editable && !imageFound }]" :style="{ width: imageSize + 'px', height: imageSize + 'px' }">
            <img
                :src="displayUrl"
                alt="Item Image"
                :title="imageFound ? 'Expand image' : (editable ? 'Upload thumbnail' : '')"
                :style="imageFound || editable ? 'cursor: pointer;' : ''"
                @click="imageFound ? showImageModal() : (editable ? showUploadModal() : null)"
                @error="handleError"
            />
        </div>
    `
};



export const InventoryTableComponent = {
    mixins: [sheetLockMixin],
    components: {
        TableComponent,
        BannerNotifications,
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
            lockNamespace: 'INVENTORY'
        };
    },
    computed: {
        columns() {
            // Dynamically set columns' editable property based on allowEdit
            return [
                { 
                    key: 'image', 
                    labelHtml: '<span class="material-symbols-outlined">imagesmode</span>',
                    label: 'IMG',
                    width: 1,
                    sortable: false
                },
                { 
                    key: 'itemNumber', 
                    label: 'ITEM#',
                    type: 'item',
                    width: 120,
                    sortable: true
                },
                { 
                    key: 'quantity', 
                    label: 'QTY',
                    format: 'number',
                    editable: this.allowEdit,
                    autoColor: false,
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
                },
                {
                    key: '_navigate',
                    labelHtml: '<span class="material-symbols-outlined">calendar_month</span>',
                    label: '',
                    width: 36,
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
            const result = this.inventoryTableStore?.isModified || false;
            console.log('[InventoryTable] isDirty computed:', result, '| store exists:', !!this.inventoryTableStore, '| isModified:', this.inventoryTableStore?.isModified);
            return result;
        },
        lockKey() {
            return this.tabTitle;
        },
        activeStore() {
            return this.inventoryTableStore;
        },
        hasExternalConflict() {
            return this.inventoryTableStore?.externalConflict ?? false;
        },
        banners() {
            return [
                {
                    key: 'lock',
                    color: '',
                    message: this.lockedBySelf
                        ? 'You have this table open for editing on another device.'
                        : `Locked for edit by: ${this.lockOwnerDisplay}`,
                    visible: this.lockedByOther,
                    dismissible: false,
                    action: this.lockedBySelf
                        ? { label: 'Claim this device', fn: () => this.claimLock() }
                        : null
                },
                {
                    key: 'conflict',
                    color: 'red',
                    message: 'Another session changed this data while you have unsaved edits. Save to keep your changes or refresh to discard them.',
                    visible: this.hasExternalConflict
                }
            ];
        },
        allowEdit() {
            // Allow editing only if editMode is true AND not locked by another user AND lock check is complete
            return this.editMode && !this.lockedByOther && this.lockCheckComplete;
        },
        allowSave() {
            const result = this.isDirty && !this.lockedByOther && this.lockCheckComplete;
            console.log('[InventoryTable] allowSave computed:', result, '| isDirty:', this.isDirty, '| lockedByOther:', this.lockedByOther, '| lockCheckComplete:', this.lockCheckComplete);
            return result;
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
            [this.tabTitle, undefined, undefined, todayISOString()], // No filters needed - search is handled in UI
            analysisConfig
        );
        
        // Apply any pending changes that are due today or earlier
        if (this.tabTitle) {
            Requests.checkAndApplyPendingChanges(this.tabTitle).catch(err => {
                console.warn('[InventoryTable] Pending changes check failed:', err);
            });
        }
        
        // Check lock status when component mounts
        await this.checkLockStatus();
    },
    watch: {
        isDirty(newValue) {
            this.handleLockState(newValue);
        }
    },
    methods: {
        onForeignLockWhileClean() {
            if (!this.appContext?.navigateToPath) return;

            const viewPath = NavigationRegistry.buildPathWithCurrentParams(
                this.containerPath,
                this.appContext?.currentPath,
                { edit: undefined }
            );
            this.appContext.navigateToPath(viewPath);
        },

        onLockAcquireFailed(lockInfo) {
            if (this.inventoryTableStore) {
                this.inventoryTableStore.setData(this.inventoryTableStore.originalData);
            }
            if (this.appContext?.navigateToPath) {
                const viewPath = NavigationRegistry.buildPathWithCurrentParams(
                    this.containerPath,
                    this.appContext?.currentPath,
                    { edit: undefined }
                );
                this.appContext.navigateToPath(viewPath);
            }
        },

        async handleRefresh() {
            this.$modal.confirm(
                'This removes undo history and clears unsaved changes.',
                () => {
                    // Clear undo/redo history for this route
                    const routeKey = this.$route?.path;
                    if (routeKey) {
                        undoRegistry.clearRouteHistory(routeKey);
                    }
                    
                    invalidateCache([
                        { namespace: 'database', methodName: 'getData', args: ['INVENTORY', this.tabTitle] }
                    ], true);
                    this.inventoryTableStore?.load('Refreshing data...');
                },
                null,
                'Refresh Data',
                'Refresh Data',
                'Cancel'
            );
        },
        
        async handleCellEdit(rowIdx, colIdx, value) {
            const user = authState.user?.email;
            if (!user || !this.tabTitle) return;

            const colKey = this.columns[colIdx]?.key;
            const originalValue = colKey && this.inventoryTableStore ? this.inventoryTableStore.data[rowIdx]?.[colKey] : undefined;

            // Apply the value immediately to prevent flicker during async lock operations.
            // If the lock check fails, revert below.
            if (colKey && this.inventoryTableStore) {
                this.inventoryTableStore.data[rowIdx][colKey] = value;
            }

            if (!await this.acquireLockForEdit()) {
                if (colKey && this.inventoryTableStore && originalValue !== undefined) {
                    this.inventoryTableStore.data[rowIdx][colKey] = originalValue;
                }
                return;
            }
        },
        async handleNewRow(positionData) {
            // positionData: { position: 'above'|'below', targetIndex: number }
            
            // Generate next item number
            const nextItemNumber = await this.generateNextItemNumber();
            
            // Show prompt modal
            this.$modal.custom(NewItemNumberPrompt, {
                initialItemNumber: nextItemNumber,
                existingItems: this.inventoryTableStore?.data || [],
                onConfirm: (itemNumber) => {
                    this.addNewRow(itemNumber, positionData);
                },
                modalClass: ''
            }, 'New Item');
        },
        
        async generateNextItemNumber() {
            const items = this.inventoryTableStore?.data || [];
            
            if (items.length === 0) {
                return `${this.tabTitle}-001`;
            }
            
            const itemNumbers = items.map(item => item.itemNumber).filter(Boolean);
            
            // Try to detect pattern
            const pattern = this.detectNumberingPattern(itemNumbers);
            
            if (pattern) {
                return this.incrementPattern(pattern);
            }
            
            // Fallback: category prefix + next number
            return `${this.tabTitle}-${String(items.length + 1).padStart(3, '0')}`;
        },
        
        detectNumberingPattern(itemNumbers) {
            // Look for common patterns like "PREFIX-###" or "PREFIX###"
            const patterns = {};
            
            itemNumbers.forEach(num => {
                // Match patterns like "ABC-123", "ABC123", etc.
                const match = num.match(/^([A-Za-z\-_]+)(\d+)$/);
                if (match) {
                    const prefix = match[1];
                    const number = parseInt(match[2], 10);
                    
                    if (!patterns[prefix]) {
                        patterns[prefix] = [];
                    }
                    patterns[prefix].push(number);
                }
            });
            
            // Find the most common prefix and its max number
            let bestPrefix = null;
            let maxNumber = 0;
            let maxCount = 0;
            
            for (const [prefix, numbers] of Object.entries(patterns)) {
                if (numbers.length > maxCount) {
                    maxCount = numbers.length;
                    bestPrefix = prefix;
                    maxNumber = Math.max(...numbers);
                }
            }
            
            if (bestPrefix) {
                return {
                    prefix: bestPrefix,
                    nextNumber: maxNumber + 1,
                    padding: 3 // Default to 3-digit padding
                };
            }
            
            return null;
        },
        
        incrementPattern(pattern) {
            const { prefix, nextNumber, padding } = pattern;
            return `${prefix}${String(nextNumber).padStart(padding, '0')}`;
        },
        
        addNewRow(itemNumber, positionData) {
            // Capture state for undo
            const routeKey = this.appContext?.currentPath?.split('?')[0];
            if (routeKey) {
                undoRegistry.capture(this.inventoryTableStore.data, routeKey, { type: 'add-row' });
            }
            
            // Create new item object
            const newItem = {
                itemNumber: itemNumber,
                quantity: 0,
                description: '',
                notes: ''
            };
            
            const data = this.inventoryTableStore.data;
            
            if (positionData) {
                // Insert at specific position
                const insertIndex = positionData.position === 'above' 
                    ? positionData.targetIndex 
                    : positionData.targetIndex + 1;
                
                data.splice(insertIndex, 0, newItem);
            } else {
                // Add to end
                data.push(newItem);
            }
            
            // Navigate with searchTerm to highlight the new item
            const newPath = NavigationRegistry.buildPath(
                this.containerPath,
                { searchTerm: itemNumber }
            );
            
            if (this.appContext?.navigateToPath) {
                this.appContext.navigateToPath(newPath);
            }
            
            // Store is now dirty, save button will appear
        },
        
        async handleSave() {
            if (!this.inventoryTableStore) return;
            const data = this.inventoryTableStore.data || [];
            const original = this.inventoryTableStore.originalData || [];
            const hasQtyChanges = data.some(row => {
                const orig = original.find(o => o.itemNumber === row.itemNumber);
                return orig && String(row.quantity) !== String(orig.quantity);
            });
            this.$modal.custom(InventorySaveModal, {
                hasQtyChanges,
                onConfirm: async (scheduledDate, note) => {
                    await this.inventoryTableStore.save('Saving inventory...', { scheduledDate, note });
                    // After a scheduled (future) save the server keeps the original quantity and
                    // stores the change as a pending entry. The store's optimistic data still
                    // shows the user-edited quantity, so force a reload to display the actual state.
                    if (scheduledDate > todayISOString()) {
                        await this.inventoryTableStore.load('Loading...');
                    }
                }
            }, 'Save Changes');
        },

        getPendingEntries(item) {
            const eh = item?.edithistory || item?.EditHistory;
            return EditHistoryUtils.getPendingEntries(eh);
        },

        // Returns pending entries sorted ascending by t, each annotated with cumulative
        // field values so quantity deltas stack correctly across multiple scheduled entries.
        getPendingEntriesForDisplay(item) {
            const entries = this.getPendingEntries(item);
            if (!entries.length) return [];
            const sorted = [...entries].sort((a, b) => a.t - b.t);
            const running = {};
            return sorted.map(entry => {
                const fields = {};
                for (const ch of entry.c) {
                    const base = running[ch.n] !== undefined ? running[ch.n] : (item[ch.n] ?? '');
                    const computed = EditHistoryUtils.applyNeValue(base, ch.ne);
                    fields[ch.n] = computed;
                    running[ch.n] = computed;
                }
                return { ...entry, fields };
            });
        },

        formatPendingDate(deciseconds) {
            return new Date(deciseconds * 100).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        },

        handleReportsClick() {
            if (this.appContext?.navigateToPath) {
                const path = this.tabTitle 
                    ? NavigationRegistry.buildPath('inventory/reports', { itemCategoryFilter: this.tabTitle })
                    : 'inventory/reports';
                this.appContext.navigateToPath(path);
            }
        },
        navigateToItemPage(row) {
            if (!row.itemNumber || !this.tabTitle) return;
            const path = `inventory/categories/${this.tabTitle.toLowerCase()}/${row.itemNumber}`;
            if (this.appContext?.navigateToPath) {
                this.appContext.navigateToPath(path);
            }
        }
    },
    template: html `
        <slot>
            <BannerNotifications :banners="banners" />

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
                :showNewRowButton="allowEdit"
                :sync-search-with-url="true"
                :container-path="containerPath"
                :navigate-to-path="appContext.navigateToPath"
                :newRow="allowEdit"
                :external-dirty-state="isDirty"
                :allowDetails="true"
                :forceDetails="editMode"
                :rowDetailsVisible="row => getPendingEntries(row).length > 0"
                emptyMessage="No inventory items found"
                :loading-message="loadingMessage"
                class="inventory-table-component mark-dirty"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @new-row="handleNewRow"
                @on-save="handleSave"
            >
                <template #header-area>
                    <div class="button-bar">
                        <button @click="appContext.navigateToPath('inventory/categories')" class="purple">Categories</button>
                        <button @click="handleReportsClick" class="purple">Reports</button>
                    </div>
                </template>
                <template #default="{ row, column, rowIndex, cellRowIndex, cellColIndex }">
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :itemNumber="row.itemNumber"
                        :imageUrl="row.AppData && row.AppData.imageUrl"
                        :editable="true"
                    />
                    <button
                        v-else-if="column.key === '_navigate'"
                        class="button-symbol purple"
                        @click.stop="navigateToItemPage(row)"
                        title="View item timeline"
                    >☷</button>
                </template>
                <template #row-detail-rows="{ row }">
                    <tr
                        v-for="(entry, i) in getPendingEntriesForDisplay(row)"
                        :key="i"
                        class="detail-row-pending in-group"
                    >
                        <td colspan="2" class="detail-meta-cell">
                            <strong>{{ formatPendingDate(entry.t) }}→ </strong>
                        </td>
                        <td class="detail-value-cell">{{ entry.fields.quantity !== undefined ? entry.fields.quantity : '' }}</td>
                        <td class="detail-value-cell">{{ entry.fields.description !== undefined ? entry.fields.description : '' }}</td>
                        <td class="detail-value-cell">{{ entry.fields.notes !== undefined ? entry.fields.notes : '' }}</td>
                    </tr>
                </template>
            </TableComponent>
        </slot>
    `
};