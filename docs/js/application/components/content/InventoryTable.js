import { html, Requests, TableComponent, getReactiveStore, createAnalysisConfig, NavigationRegistry, Priority, invalidateCache, authState, undoRegistry, EditHistoryUtils, todayISOString } from '../../index.js';
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
        },
        initialNote: {
            type: String,
            default: ''
        }
    },
    data() {
        return {
            scheduledDate: todayISOString(),
            note: (this.initialNote || '').slice(0, 25),
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
                <label>Note <span v-if="hasQtyChanges" class="red">*</span></label>
                <input
                    type="text"
                    v-model="note"
                    maxlength="25"
                    :placeholder="hasQtyChanges ? 'What changed and why?' : 'Optional note'"
                    :class="{ red: !!error && !note.trim() }"
                    autofocus
                    @keyup.enter="handleApplyNow"
                />
                <span v-if="error && !note.trim()" class="red font-small">{{ error }}</span>
                <span v-else class="font-small gray">{{ charCount }}/25</span>
            </div>
            <div class="form-group">
                <label>Effective Date</label>
                <input type="date" v-model="scheduledDate" :min="todayISO" :class="{ red: !!error && scheduledDate < todayISO }" />
                <span v-if="error && scheduledDate < todayISO" class="red font-small">{{ error }}</span>
                <span v-else-if="!isFutureDate" class="font-small gray">Changes will be immediate</span>
                <span v-else class="font-small gray">Changes will be scheduled</span>
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
                        :class="{ 'red': error }"
                        autofocus
                    />
                    <div class="ghost-text" v-if="ghostText">{{ itemNumber }}<span class="ghost">{{ ghostText }}</span></div>
                </div>
                <span v-if="error" class="font-small red">{{ error }}</span>
                <span v-else-if="helperText" class="font-small gray">{{ helperText }}</span>
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
        <img :src="displayUrl" alt="Image" style="max-width: 90vw; max-height: 70vh; object-fit: contain;" />
        <button v-if="onReplace" style="align-self: center;" @click="() => { onReplace(); $emit('close-modal'); }">Replace</button>
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
        <div v-if="previewUrl" style="text-align: center;">
            <img :src="previewUrl" alt="Preview" style="max-width: 100%; max-height: 200px; object-fit: contain; border-radius: 4px;" />
        </div>
        <input class="card" style="width:100%" type="file" accept="image/*" @change="handleFileSelect" :disabled="uploading" />
        <div v-if="uploadError" class="red card">{{ uploadError }}</div>
        <div class="button-bar">
            <button @click="handleUpload" :disabled="!selectedFile || uploading">
                {{ uploading ? 'Uploading...' : (mode === 'replace' ? 'Replace' : 'Upload') }}
            </button>
            <button class="gray" @click="$emit('close-modal')" :disabled="uploading">Cancel</button>
        </div>
    `
};

// Mini global queue that throttles how many images can be decoding/rendering at once.
// Chrome and Edge block the main thread when decoding multiple image blobs simultaneously.
// IntersectionObserver can fire many callbacks at once during a scroll — this queue
// ensures only MAX_CONCURRENT images actually become visible (and start decoding) at a time.
// Items are sorted by Y position so top-of-viewport images decode first.
const ImageRenderQueue = {
    pending: [],
    active: 0,
    MAX_CONCURRENT: 3,

    enqueue(fn, yPosition = 0) {
        // Store both the function and its Y position for sorting
        this.pending.push({ fn, y: yPosition });
        // Sort by Y position (ascending — top of page first)
        this.pending.sort((a, b) => a.y - b.y);
        this._flush();
    },

    release() {
        this.active = Math.max(0, this.active - 1);
        this._flush();
    },

    cancel(targetFn) {
        const i = this.pending.findIndex(item => item.fn === targetFn);
        if (i !== -1) this.pending.splice(i, 1);
    },

    _flush() {
        while (this.active < this.MAX_CONCURRENT && this.pending.length > 0) {
            this.active++;
            const item = this.pending.shift();
            item.fn();
        }
    }
};

// Factory that creates a shared IntersectionObserver for an entire table component.
// Each large table creates one of these and provides it to all descendant ItemImageComponents,
// replacing hundreds of individual observers with a single one.
// Components without a parent manager fall back to creating their own observer.
export function createVisibilityManager() {
    const callbacks = new Map(); // element → callback(y)
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const cb = callbacks.get(entry.target);
                if (cb) {
                    callbacks.delete(entry.target);
                    observer.unobserve(entry.target);
                    // Pass the pre-calculated y from the IO entry — avoids a
                    // forced synchronous layout recalculation (getBoundingClientRect).
                    cb(entry.boundingClientRect.top);
                }
            });
        },
        { rootMargin: '100px', threshold: 0 }
    );
    return {
        register(el, callback) {
            callbacks.set(el, callback);
            observer.observe(el);
        },
        unregister(el) {
            if (callbacks.has(el)) {
                callbacks.delete(el);
                observer.unobserve(el);
            }
        },
        destroy() {
            observer.disconnect();
            callbacks.clear();
        }
    };
}

// Shared singleton thumbnail store — loads the full Thumbnails table once and resolves
// blob URLs via analysis. All ItemImageComponent instances share the same store instance.
// Marked as exempt from eviction to prevent auto-clearing, similar to the dashboard store.
// Lazy loading ensures images are only fetched when they scroll into view.
function getThumbnailStore() {
    return getReactiveStore(
        Requests.getAllThumbnailRecords,
        null,
        [],
        [
            // Single analysis step: Convert file IDs to full blob URLs
            createAnalysisConfig(
                Requests.getDriveBlobUrl,
                'blobUrl',
                'Loading images...',
                ['file'],
                [],
                null,
                false,
                Priority.BACKGROUND,
                false,
                false
            )
        ],
        true,   // autoLoad
        null,   // priorityConfig
        true    // exemptFromEviction - prevent auto-clearing
    );
}

export const ItemImageComponent = {
    props: {
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
    inject: {
        $modal: '$modal',
        // Optionally injected by large table parents — replaces per-component IntersectionObserver
        _tableVisibility: { from: '_tableVisibility', default: null }
    },
    data() {
        return {
            thumbnailStore: null,
            localImageUrl: null,    // Set immediately after upload for instant feedback
            cachedImageUrl: null,   // Last known good image URL to prevent flashing during reload
            cachedPrefixUrl: null,  // Last known good prefix URL to prevent flashing during reload
            isVisible: false,       // Lazy loading: true once image is allowed to render
            observer: null,         // Per-component IntersectionObserver (used when no parent manager)
            _queueFn: null,         // Pending queue callback reference (for cancellation)
            _holdsSlot: false       // Whether this component holds an active queue slot
        };
    },
    computed: {
        record() {
            return this.thumbnailStore?.data?.find(r => r.itemNumber === this.itemNumber) || null;
        },
        prefixRecord() {
            if (!this.itemNumber) return null;
            const prefix = this.itemNumber.split(/[\s\-_]+/)[0];
            if (!prefix || prefix === this.itemNumber) return null;
            return this.thumbnailStore?.data?.find(r => r.itemNumber === prefix) || null;
        },
        imageUrl() {
            if (this.localImageUrl) return this.localImageUrl;
            
            // Lazy loading: don't fetch images until visible
            if (!this.isVisible) return null;
            
            // During loading/analyzing, preserve the cached URL to avoid flashing
            const isReloading = this.thumbnailStore?.isLoading || this.thumbnailStore?.isAnalyzing;
            if (isReloading && this.cachedImageUrl) {
                return this.cachedImageUrl;
            }
            
            // Use full image URL
            let newUrl = this.record?.AppData?.blobUrl || null;
            
            // Update cache if URL changed
            if (newUrl && newUrl !== this.cachedImageUrl) {
                this.cachedImageUrl = newUrl;
            }
            
            return newUrl;
        },
        prefixImageUrl() {
            if (this.imageUrl) return null;

            // If this item has its own thumbnail record, never show the prefix fallback.
            // Showing the prefix while waiting for the item's own analysis would cause a
            // prefix→own transition (and a second blob URL load) once analysis resolves.
            if (this.record?.file) return null;
            
            // Lazy loading: don't fetch images until visible
            if (!this.isVisible) return null;
            
            // During loading/analyzing, preserve the cached prefix URL to avoid flashing
            const isReloading = this.thumbnailStore?.isLoading || this.thumbnailStore?.isAnalyzing;
            if (isReloading && this.cachedPrefixUrl) {
                return this.cachedPrefixUrl;
            }
            
            // Use full image URL
            let newUrl = this.prefixRecord?.AppData?.blobUrl || null;
            
            // Update cache if URL changed
            if (newUrl && newUrl !== this.cachedPrefixUrl) {
                this.cachedPrefixUrl = newUrl;
            }
            
            return newUrl;
        },
        isResolved() {
            return !this.thumbnailStore?.isLoading && !this.thumbnailStore?.isAnalyzing;
        },
        realImageFound() {
            return !!this.imageUrl;
        },
        imageFound() {
            return !!(this.imageUrl || this.prefixImageUrl);
        }
    },
    mounted() {
        this.thumbnailStore = getThumbnailStore();
        this._setupVisibility();
    },
    watch: {
        itemNumber() {
            // Cancel any pending queue entry and release any held slot
            if (this._queueFn) {
                ImageRenderQueue.cancel(this._queueFn);
                this._queueFn = null;
            }
            this._releaseSlot();

            // Unregister from visibility system
            if (this._tableVisibility) {
                this._tableVisibility.unregister(this.$el);
            } else if (this.observer) {
                this.observer.disconnect();
            }
            
            this.cachedImageUrl = null;
            this.cachedPrefixUrl = null;
            this.isVisible = false;
            
            // Re-register for the new item number
            this._setupVisibility();
        },
        record(newRecord, oldRecord) {
            // If the record changes (e.g., item deleted/recreated), clear cache
            if (newRecord?.file !== oldRecord?.file) {
                this.cachedImageUrl = null;
                this.cachedPrefixUrl = null;
            }
        }
    },
    methods: {
        _setupVisibility() {
            const onVisible = (yPosition = 0) => {
                const fn = () => {
                    this._queueFn = null;
                    this._holdsSlot = true;
                    this.isVisible = true;
                    this.$nextTick(() => {
                        if (!this.imageUrl && !this.prefixImageUrl) {
                            this._releaseSlot();
                        }
                    });
                };
                this._queueFn = fn;
                ImageRenderQueue.enqueue(fn, yPosition);
            };

            if (this._tableVisibility) {
                // Delegate to the parent table's shared observer
                // The manager passes entry.boundingClientRect.top to avoid forced reflow.
                this._tableVisibility.register(this.$el, onVisible);
            } else {
                // Fallback: per-component observer for components outside large tables
                this.observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                this.observer.disconnect();
                                onVisible(entry.boundingClientRect.top);
                            }
                        });
                    },
                    { rootMargin: '100px', threshold: 0 }
                );
                this.observer.observe(this.$el);
            }
        },
        _releaseSlot() {
            if (this._holdsSlot) {
                this._holdsSlot = false;
                ImageRenderQueue.release();
            }
        },
        onImageSettled() {
            // Called on @load or @error — signal the queue that this slot is free
            this._releaseSlot();
        },
        clearLocalImageUrl() {
            if (this.localImageUrl?.startsWith('blob:')) URL.revokeObjectURL(this.localImageUrl);
            this.localImageUrl = null;
        },
        showImageModal() {
            if (this.realImageFound) {
                this.$modal.custom(ImageViewWithReplaceComponent, {
                    thumbnailUrl: this.imageUrl,
                    itemNumber: this.itemNumber,
                    modalClass: 'page-menu',
                    onReplace: (this.editable && this.itemNumber) ? () => this.showUploadModal() : null
                }, `Image: ${this.itemNumber}`);
            }
        },
        showUploadModal() {
            if (!this.editable) return;
            const mode = this.realImageFound ? 'replace' : 'add';
            const title = this.realImageFound ? 'Replace Thumbnail' : 'Add Thumbnail';
            this.$modal.custom(ImageUploadComponent, {
                itemNumber: this.itemNumber,
                mode,
                onUploadSuccess: (url) => {
                    this.clearLocalImageUrl();
                    this.localImageUrl = url;
                    this.cachedImageUrl = url;      // Update cache so new URL shows immediately
                    this.cachedPrefixUrl = null;    // No longer need prefix
                    this.isVisible = true;          // Ensure uploaded image shows immediately
                }
            }, title);
        },
        async handleError(isMainImage) {
            // Release the queue slot immediately — refetch is async and shouldn't block others
            this._releaseSlot();
            
            // Blob URL became stale — re-fetch from the stored Drive file ID
            const fileId = this.record?.file;
            if (!fileId) return;
            
            // Clear cache since we're intentionally refetching
            this.cachedImageUrl = null;
            this.cachedPrefixUrl = null;
            
            // Invalidate and refetch full image
            invalidateCache([{ namespace: 'database', methodName: 'getDriveBlobUrl', args: [fileId] }]);
            const fresh = await Requests.getDriveBlobUrl(fileId);
            if (fresh) {
                this.clearLocalImageUrl();
                this.localImageUrl = fresh;
                this.cachedImageUrl = fresh;
            }
        }
    },
    beforeUnmount() {
        if (this._queueFn) {
            ImageRenderQueue.cancel(this._queueFn);
            this._queueFn = null;
        }
        this._releaseSlot();

        if (this._tableVisibility) {
            this._tableVisibility.unregister(this.$el);
        } else if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        this.clearLocalImageUrl();
    },
    template: html`
        <div
            :class="['item-image-container', { 'image-missing': editable && !imageFound && isResolved }]"
            :style="{ width: imageSize + 'px', height: imageSize + 'px', cursor: (realImageFound || (editable && isResolved)) ? 'pointer' : 'default', position: 'relative' }"
            @click="realImageFound ? showImageModal() : (editable && isResolved ? showUploadModal() : null)"
            :title="realImageFound ? 'Expand image' : (editable && isResolved ? 'Upload thumbnail' : '')"
        >
            <!-- Transition group handles all fade-in/fade-out automatically -->
            <transition-group name="longfade">
                <img
                    v-if="prefixImageUrl"
                    :key="prefixImageUrl"
                    class="image-layer"
                    :src="prefixImageUrl"
                    alt="Category Image"
                    decoding="async"
                    @load="onImageSettled"
                    @error="handleError(false)"
                />

                <img
                    v-else-if="imageUrl"
                    :key="imageUrl"
                    class="image-layer"
                    :src="imageUrl"
                    alt="Item Image"
                    decoding="async"
                    @load="onImageSettled"
                    @error="handleError(true)"
                />

                <img
                    v-else
                    :key="'placeholder'"
                    class="image-layer"
                    src="assets/placeholder.png"
                    alt="Placeholder"
                    decoding="async"
                />
            </transition-group>
        </div>
    `
};



// Fields shown in pending and history sub-rows, and restored by a history revert
const HISTORY_FIELDS = ['quantity', 'description', 'notes'];

// Red highlighting of changed values in sub-rows, per view:
// pending = scheduled-change rows on the category table, history = the Edit History page
const HIGHLIGHT_CHANGES = { pending: false, history: true };

/** Format a decisecond timestamp for the history columns, e.g. "Oct 6, 2026, 1:52 PM" */
function formatHistoryTime(deciseconds) {
    return new Date(deciseconds * 100).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
}

export const InventoryTableComponent = {
    mixins: [sheetLockMixin],
    components: {
        TableComponent,
        ItemImageComponent
    },
    inject: ['appContext', '$modal', '$notify'],
    provide() {
        return {
            _tableVisibility: this._visibilityManager
        };
    },
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
        },
        // Edit History page: read-only past states under each item, with revert
        historyMode: {
            type: Boolean,
            default: false
        }
    },
    data() {
        return {
            inventoryTableStore: null,
            archivedRows: [],
            revertNote: '',
            lockNamespace: 'INVENTORY',
            tabMetaFlags: { hideQuantity: false, hideItemNumber: false },
            _visibilityManager: createVisibilityManager()
        };
    },
    computed: {
        columns() {
            // Dynamically set columns' editable property based on allowEdit
            let cols = [
                { 
                    key: 'image', 
                    labelHtml: '<span class="material-symbols-outlined">imagesmode</span>',
                    label: 'IMG',
                    width: 1,
                    sortable: false,
                    sticky: 'start'
                },
                { 
                    key: 'itemNumber', 
                    label: 'Item#',
                    type: 'item',
                    width: 120,
                    sortable: true
                },
                {
                    key: 'quantity',
                    label: 'Qty',
                    format: 'number',
                    historyField: true,
                    editable: this.allowEdit,
                    autoColor: false,
                    width: 120,
                    sortable: true
                },
                { 
                    key: 'description',
                    label: 'Description (visible in pack lists)',
                    historyField: true,
                    editable: this.allowEdit,
                    sortable: true
                },
                { 
                    key: 'notes',
                    label: 'Notes (internal only)',
                    historyField: true,
                    editable: this.allowEdit,
                    sortable: false
                },
                {
                    key: '_navigate',
                    labelHtml: '<span class="material-symbols-outlined">calendar_month</span>',
                    label: '',
                    width: 36,
                    sortable: false,
                    sticky: 'end'
                }
            ];
            if (this.historyMode) {
                // No item timeline button; history metadata and revert columns at the end
                cols = cols.filter(c => c.key !== '_navigate');
                // Main row: mark values that differ from the saved row (unsaved revert)
                cols = cols.map(c => c.historyField ? {
                    ...c,
                    cellClass: (value, row) => row && this.unsavedFields(row).has(c.key) ? 'history-unsaved' : ''
                } : c);
                const meta = () => 'history-meta';
                cols.push(
                    {
                        key: '_revert',
                        labelHtml: '<span class="material-symbols-outlined">history</span>',
                        label: '',
                        width: 36,
                        sortable: false
                    },
                    { key: '_historyDate', label: 'Date', width: 160, sortable: false, cellClass: meta },
                    { key: '_historyUser', label: 'User', width: 90, sortable: false, cellClass: meta },
                    { key: '_historyNote', label: 'Note', width: 160, sortable: false, cellClass: meta }
                );
            }
            // Apply column filters based on metadata flags
            return cols.filter(c => {
                if (this.tabMetaFlags.hideQuantity && c.key === 'quantity') return false;
                if (this.tabMetaFlags.hideItemNumber && c.key === 'itemNumber') return false;
                return true;
            });
        },
        tableData() {
            return this.inventoryTableStore ? this.inventoryTableStore.data : [];
        },
        // Past states per item, rebuilt from the SAVED rows so unsaved edits or reverts
        // don't shift the reconstruction (see EditHistoryUtils.getHistoryStates)
        historyByItem() {
            const map = new Map();
            if (!this.historyMode) return map;
            for (const row of this.inventoryTableStore?.originalData || []) {
                map.set(row.itemNumber, EditHistoryUtils.getHistoryStates(row, HISTORY_FIELDS));
            }
            return map;
        },
        deletedColumns() {
            return [
                { key: 'itemNumber', label: 'Item#', width: 120 },
                { key: 'quantity', label: 'Qty', width: 80 },
                { key: 'description', label: 'Description' },
                { key: 'notes', label: 'Notes' },
                { key: 'deletedAt', label: 'Deleted', width: 160, cellClass: () => 'history-meta' },
                { key: 'deletedBy', label: 'By', width: 90, cellClass: () => 'history-meta' }
            ];
        },
        deletedRows() {
            return this.archivedRows.map(entry => ({
                itemNumber: entry.RowData.itemNumber ?? '',
                quantity: entry.RowData.quantity ?? '',
                description: entry.RowData.description ?? '',
                notes: entry.RowData.notes ?? '',
                deletedAt: entry.Timestamp ? formatHistoryTime(entry.Timestamp) : '',
                deletedBy: (entry.Username || '').split('@')[0]
            }));
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
            //console.log('[InventoryTable] isDirty computed:', result, '| store exists:', !!this.inventoryTableStore, '| isModified:', this.inventoryTableStore?.isModified);
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
                    message: 'Another session changed this data while you have unsaved edits. Save to keep your changes or discard them.',
                    visible: this.hasExternalConflict,
                    action: {
                        label: 'Discard', fn: () =>
                            this.$modal.confirm(
                                'Are you sure you want to discard your changes?',
                                () => {
                                    this.inventoryTableStore?.load('Reloading...');
                                },
                                null,
                                'Discard Changes',
                                'Discard',
                                'Cancel'
                            )
                    }
                }
            ];
        },
        allowEdit() {
            // Allow editing only if editMode is true AND not locked by another user AND lock check is complete
            return this.editMode && !this.lockedByOther && this.lockCheckComplete;
        },
        allowSave() {
            const result = this.isDirty && !this.lockedByOther && this.lockCheckComplete;
            //console.log('[InventoryTable] allowSave computed:', result, '| isDirty:', this.isDirty, '| lockedByOther:', this.lockedByOther, '| lockCheckComplete:', this.lockCheckComplete);
            return result;
        }
    },
    async mounted() {
        // Load index metadata to derive column visibility flags for this tab
        if (this.tabTitle) {
            const tabTitle = this.tabTitle;
            Requests.getPreferences().then(prefs => {
                const descPref = prefs?.find(p => p.id === 'InventoryDescriptionOnly');
                let descOnlyTabs = [];
                try { descOnlyTabs = JSON.parse(descPref?.value || '[]'); } catch {}
                if (descOnlyTabs.includes(tabTitle)) {
                    this.tabMetaFlags = { hideQuantity: true, hideItemNumber: true };
                }
            }).catch(() => {});
        }

        // Defensive: always set up the store before using it
        this.inventoryTableStore = getReactiveStore(
            Requests.getInventoryTabData,
            Requests.saveInventoryTabData,
            [this.tabTitle, undefined, undefined, undefined] // No filters needed - search is handled in UI
        );
        
        if (this.historyMode && this.tabTitle) {
            Requests.getArchivedRows('INVENTORY', this.tabTitle)
                .then(rows => { this.archivedRows = rows || []; })
                .catch(err => console.warn('[InventoryTable] Failed to load deleted rows:', err));
        }

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
        banners: {
            handler(newBanners) {
                this.$notify.setBanners(this.containerPath, newBanners);
            },
            immediate: true
        },
        isDirty(newValue) {
            this.handleLockState(newValue);
        }
    },
    beforeUnmount() {
        this.$notify.clearBanners(this.containerPath);
        this._visibilityManager.destroy();
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
                initialNote: this.historyMode ? this.revertNote : '',
                onConfirm: async (scheduledDate, note) => {
                    await this.inventoryTableStore.save('Saving inventory...', { scheduledDate, note });
                    this.revertNote = '';
                    // After a scheduled (future) save the server keeps the original quantity and
                    // stores the change as a pending entry. The store's optimistic data still
                    // shows the user-edited quantity, so force a reload to display the actual state.
                    // On the history page, reload so the entry this save recorded appears right away.
                    if (scheduledDate > todayISOString() || this.historyMode) {
                        await this.inventoryTableStore.load('Loading...');
                    }
                }
            }, 'Save Changes');
        },

        getPendingEntries(item) {
            const eh = item?.edithistory;
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

        /**
         * Sub-rows under an item, in one shape for both kinds:
         *   - category table: pending (scheduled) changes
         *   - edit history page: past states, newest first (no pending rows)
         * @returns {Array<{label, fields, changed: Set, meta: {date, user, note}|null, revertState, rowClass}>}
         */
        getDetailRows(row) {
            if (!this.historyMode) {
                return this.getPendingEntriesForDisplay(row).map(entry => ({
                    label: `${this.formatPendingDate(entry.t)}→`,
                    fields: entry.fields,
                    changed: HIGHLIGHT_CHANGES.pending ? new Set(Object.keys(entry.fields)) : new Set(),
                    meta: null,
                    revertState: null,
                    rowClass: 'detail-row-pending'
                }));
            }
            const states = this.historyByItem.get(row.itemNumber) || [];
            // With unsaved changes the main row shows the live values, so the saved state
            // becomes the first history row
            const unsaved = this.unsavedFields(row).size > 0;
            const shown = unsaved ? states : states.slice(1);
            const above = (j) => unsaved ? (j === 0 ? row : states[j - 1].state) : states[j].state;
            // Highlight the fields where this past state differs from the next-newer one
            // (the row above it), i.e. the values that the newer change replaced
            return shown.map((item, j) => ({
                label: item.kind === 'current' ? 'Saved'
                    : item.kind === 'created' ? 'Created'
                    : item.kind === 'earliest' ? 'Earliest recorded' : '',
                fields: item.state,
                changed: HIGHLIGHT_CHANGES.history
                    ? new Set(HISTORY_FIELDS.filter(key => String(item.state[key] ?? '') !== String(above(j)[key] ?? '')))
                    : new Set(),
                meta: this.historyMeta(item.entry),
                revertState: item.state,
                rowClass: 'detail-row-history'
            }));
        },

        hasDetailRows(row) {
            if (this.historyMode) {
                const count = this.historyByItem.get(row.itemNumber)?.length || 0;
                return count > 1 || (count > 0 && this.unsavedFields(row).size > 0);
            }
            return this.getPendingEntries(row).length > 0;
        },

        // History fields whose live (store) value differs from the saved row, e.g. after a revert
        unsavedFields(row) {
            const saved = this.historyByItem.get(row.itemNumber)?.[0]?.state;
            if (!saved) return new Set();
            return new Set(HISTORY_FIELDS.filter(key => String(row[key] ?? '') !== String(saved[key] ?? '')));
        },

        historyMeta(entry) {
            if (!entry) return { date: '', user: '', note: '' };
            return { date: formatHistoryTime(entry.t), user: entry.u || '', note: EditHistoryUtils.entryNote(entry) };
        },

        // Metadata for the main row: the change that produced the current saved values,
        // or an "Unsaved" marker while the row has unsaved changes
        currentHistoryMeta(row) {
            if (this.unsavedFields(row).size > 0) {
                return { date: 'Unsaved', user: (authState.user?.email || '').split('@')[0], note: '', unsaved: true };
            }
            return this.historyMeta(this.historyByItem.get(row.itemNumber)?.[0]?.entry);
        },

        // Leading visible columns without history fields (image, item#) share one label cell
        leadingSpan(visibleColumns) {
            const index = visibleColumns.findIndex(col => col.historyField);
            return index === -1 ? visibleColumns.length : index;
        },

        /**
         * Restore an item to a past state, rewinding every newer change. Applies the state to
         * the store (shared with the category table); the user saves it from either page.
         */
        async revertToState(row, detail) {
            const store = this.inventoryTableStore;
            const target = store?.data.find(r => r.itemNumber === row.itemNumber);
            if (!target || !detail.revertState) return;

            if (!await this.acquireLockForEdit()) {
                this.$modal.alert(`Cannot revert: ${this.tabTitle} is locked for editing by ${this.lockOwnerDisplay || 'another user'}.`, 'Locked');
                return;
            }

            const routeKey = this.appContext?.currentPath?.split('?')[0];
            if (routeKey) {
                undoRegistry.capture(store.data, routeKey, { type: 'revert' });
            }
            for (const field of HISTORY_FIELDS) {
                target[field] = detail.revertState[field] ?? '';
            }
            // Save note (max 25 characters), e.g. "revert to Oct 6, 2026" / "revert to earliest"
            const when = detail.meta?.date
                ? detail.meta.date.split(',').slice(0, 2).join(',')
                : (detail.label === 'Created' ? 'creation' : 'earliest');
            this.revertNote = `revert to ${when}`.slice(0, 25);
        },

        handleReportsClick() {
            // Navigation to reports has been moved to primary navigation
            const path = this.tabTitle
                    ? NavigationRegistry.buildPath('reports/show-usage', { ctgFilter: this.tabTitle })
                    : 'reports/show-usage';
            this.appContext.navigateToPath(path);
        },
        navigateToItemPage(row) {
            if (!row.itemNumber || !this.tabTitle) return;
            const basePath = `inventory/${this.tabTitle.toLowerCase()}/${row.itemNumber}`;
            // Preserve searchTerm from current path
            const currentParams = NavigationRegistry.getParametersForContainer(
                this.containerPath,
                this.appContext?.currentPath
            );
            const newPath = NavigationRegistry.buildPath(basePath, { searchTerm: currentParams.searchTerm });
            if (this.appContext?.navigateToPath) {
                this.appContext.navigateToPath(newPath);
            }
        }
    },
    template: html `
        <slot>
            <TableComponent
                ref="tableComponent"
                theme="purple"
                :data="tableData"
                :title="inventoryName || tabTitle"
                :originalData="originalData"
                :columns="columns"
                default-sort-column="itemNumber"
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
                :forceDetails="editMode || historyMode"
                :rowDetailsVisible="hasDetailRows"
                emptyMessage="No inventory items found"
                :loading-message="loadingMessage"
                class="inventory-table-component mark-dirty"
                @refresh="handleRefresh"
                @cell-edit="handleCellEdit"
                @new-row="handleNewRow"
                @on-save="handleSave"
            >
                <template #header-area>
                    <div class="button-bar" style="display: none;"></div>
                </template>
                <template #default="{ row, column, rowIndex, cellRowIndex, cellColIndex }">
                    <ItemImageComponent 
                        v-if="column.key === 'image'"
                        :itemNumber="row.itemNumber"
                        :editable="true"
                    />
                    <button
                        v-else-if="column.key === '_navigate'"
                        class="button-symbol purple"
                        @click.stop="navigateToItemPage(row)"
                        title="View item timeline"
                    >☷</button>
                    <span v-else-if="column.key === '_historyDate'" :class="{ 'history-unsaved-label': currentHistoryMeta(row).unsaved }">{{ currentHistoryMeta(row).date }}</span>
                    <span v-else-if="column.key === '_historyUser'">{{ currentHistoryMeta(row).user }}</span>
                    <span v-else-if="column.key === '_historyNote'">{{ currentHistoryMeta(row).note }}</span>
                    <span v-else-if="column.key === '_revert'"></span>
                </template>
                <template #row-detail-rows="{ row, visibleColumns }">
                    <tr
                        v-for="(detail, i) in getDetailRows(row)"
                        :key="i"
                        :class="['detail-row', detail.rowClass, 'in-group']"
                    >
                        <td v-if="leadingSpan(visibleColumns) > 0" :colspan="leadingSpan(visibleColumns)">
                            <strong>{{ detail.label }}</strong>
                        </td>
                        <td
                            v-for="column in visibleColumns.slice(leadingSpan(visibleColumns))"
                            :key="column.key"
                            :class="{
                                'history-changed': detail.changed.has(column.key),
                                'history-meta': column.key.startsWith('_history')
                            }"
                        >
                            <template v-if="column.historyField">
                                <span
                                    v-if="detail.changed.has(column.key) && String(detail.fields[column.key] ?? '').trim() === ''"
                                    class="history-empty"
                                >(empty)</span>
                                <template v-else>{{ detail.fields[column.key] ?? '' }}</template>
                            </template>
                            <template v-else-if="column.key === '_historyDate' && detail.meta">{{ detail.meta.date }}</template>
                            <template v-else-if="column.key === '_historyUser' && detail.meta">{{ detail.meta.user }}</template>
                            <template v-else-if="column.key === '_historyNote' && detail.meta">{{ detail.meta.note }}</template>
                            <button
                                v-else-if="column.key === '_revert' && detail.revertState"
                                class="button-symbol purple"
                                @click.stop="revertToState(row, detail)"
                                title="Revert to this state (undoes every newer change)"
                            >↶</button>
                        </td>
                    </tr>
                </template>
            </TableComponent>
            <TableComponent
                v-if="historyMode && deletedRows.length > 0"
                theme="purple"
                title="Deleted items"
                :data="deletedRows"
                :columns="deletedColumns"
                :showSearch="false"
                :showRefresh="false"
                emptyMessage="No deleted items"
                class="inventory-deleted-rows"
            />
        </slot>
    `
};