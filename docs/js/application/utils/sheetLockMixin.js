import { Requests, authState, CacheInvalidationBus } from '../index.js';

/**
 * sheetLockMixin — Vue Options API mixin for sheet-level write-lock management.
 *
 * Handles acquiring, releasing, and polling write locks on Google Sheets tabs so
 * that only one user can edit a sheet at a time.
 *
 * ─── CONTRACT ────────────────────────────────────────────────────────────────
 * The component using this mixin MUST provide:
 *
 *   data:
 *     lockNamespace  String  — Spreadsheet namespace passed to lock API calls.
 *                              e.g. 'INVENTORY' or 'PACK_LISTS'.
 *
 *   computed:
 *     lockKey        String  — The tab identifier used as the lock key.
 *                              e.g. `this.tabTitle` or `this.tabName`.
 *     activeStore    Object  — The reactive store instance for this component.
 *                              Used to wait for initial data load before deciding
 *                              whether to release a stale own-lock on mount.
 *                              e.g. `this.inventoryTableStore`.
 *     isDirty        Boolean — Whether the component has unsaved edits.
 *
 * ─── OPTIONAL HOOKS ──────────────────────────────────────────────────────────
 * Define these methods on the component to extend mixin behaviour:
 *
 *   afterCheckLockComplete()
 *     Called at the end of every checkLockStatus() run, after lockCheckComplete
 *     is set to true.  Use this for component-specific post-check navigation or
 *     side-effects (e.g. PacklistTable redirecting to edit mode).
 *
 *   onLockAcquireFailed(lockInfo)
 *     Called when a lock acquisition attempt in handleLockState() fails because
 *     another user already holds the lock.  Use this for component-specific
 *     recovery (e.g. InventoryTable prompting the user to refresh).
 *
 * ─── PROVIDED ────────────────────────────────────────────────────────────────
 * data:    isLocked, lockingInProgress, lockedByOther, lockOwner, lockCheckComplete
 * computed: lockOwnerDisplay
 * methods: setLockState, checkLockStatus, handleLockState
 */
export const sheetLockMixin = {
    data() {
        return {
            isLocked: false,
            lockingInProgress: false,
            lockedByOther: false,
            lockOwner: null,
            lockCheckComplete: false
        };
    },

    created() {
        this._lockInvalidationHandler = () => this.checkLockStatus();
        CacheInvalidationBus.on('api:getSheetLock', this._lockInvalidationHandler);
    },

    beforeUnmount() {
        if (this._lockInvalidationHandler) {
            CacheInvalidationBus.off('api:getSheetLock', this._lockInvalidationHandler);
        }
    },

    computed: {
        lockOwnerDisplay() {
            return this.lockOwner && this.lockOwner.includes('@')
                ? this.lockOwner.split('@')[0]
                : (this.lockOwner || 'Unknown');
        }
    },

    watch: {
        'activeStore.error'(newError) {
            if (!newError) return;
            const match = newError.match(/locked by (.+)$/i);
            if (match) {
                this.setLockState(false, match[1]);
                this.$modal.alert(`Cannot save: locked by ${match[1]}`, 'Locked');
            }
        }
    },

    methods: {
        setLockState(isLocked, owner = null) {
            this.isLocked = isLocked;
            this.lockedByOther = !!(owner && owner !== authState.user?.email);
            this.lockOwner = owner;
        },

        /**
         * Reads the current lock for this sheet tab and reconciles component state.
         *
         * - If another user holds the lock: marks lockedByOther = true.
         * - If this user holds a stale lock and has no unsaved edits: releases it.
         * - If no lock exists: clears lock state.
         *
         * Always sets lockCheckComplete = true when done, then calls
         * afterCheckLockComplete() if the component defines it.
         *
         * Called on mount and on a 10-second interval while a foreign lock banner
         * is visible (via BannerNotifications poll config).
         */
        async checkLockStatus() {
            const user = authState.user?.email;
            if (!user || !this.lockKey) return;

            try {
                const lockInfo = await Requests.getSheetLock(this.lockNamespace, this.lockKey);

                if (lockInfo && lockInfo.user !== user) {
                    this.setLockState(false, lockInfo.user);
                    return;
                }

                if (lockInfo && lockInfo.user === user) {
                    this.setLockState(true, user);

                    // Wait for store to finish its initial load before deciding whether
                    // this is a stale own-lock. activeStore.initialLoad covers stores that
                    // track a separate "first load" flag; isLoading covers stores that don't.
                    if (this.activeStore && (this.activeStore.isLoading || this.activeStore.initialLoad)) {
                        await new Promise(resolve => {
                            const unwatch = this.$watch(
                                () => this.activeStore && !this.activeStore.isLoading && !this.activeStore.initialLoad,
                                (isReady) => {
                                    if (!isReady) return;
                                    unwatch();
                                    resolve();
                                }
                            );
                        });
                    }

                    if (!this.isDirty) {
                        const unlocked = await Requests.unlockSheet(this.lockNamespace, this.lockKey, user);
                        if (!unlocked) {
                            console.warn(`[sheetLockMixin] Failed to remove stale lock for ${this.lockKey}`);
                        }
                        this.setLockState(false, null);
                    }
                } else {
                    this.setLockState(false, null);
                }
            } catch (error) {
                console.error(`[sheetLockMixin] Failed to check lock status for ${this.lockKey}:`, error);
            } finally {
                this.lockCheckComplete = true;
                this.afterCheckLockComplete?.();
            }
        },

        /**
         * Acquires or releases the write lock in response to isDirty changes.
         *
         * - isDirty true  → acquire lock (if not already held).
         * - isDirty false → release lock (if held by this component).
         *
         * On acquire failure (another user holds it), sets lockedByOther and calls
         * onLockAcquireFailed(lockInfo) if the component defines it.
         *
         * Called from the component's isDirty watcher.
         */
        async handleLockState(isDirty) {
            if (!this.lockCheckComplete || this.lockingInProgress || this.lockedByOther) return;

            const user = authState.user?.email;
            if (!user || !this.lockKey) return;

            this.lockingInProgress = true;

            try {
                if (isDirty && !this.isLocked) {
                    const lockAcquired = await Requests.lockSheet(this.lockNamespace, this.lockKey, user);
                    if (lockAcquired) {
                        this.setLockState(true, user);
                    } else {
                        const lockInfo = await Requests.getSheetLock(this.lockNamespace, this.lockKey);
                        if (lockInfo && lockInfo.user !== user) {
                            this.setLockState(false, lockInfo.user);
                            console.warn(`[sheetLockMixin] Sheet locked by ${lockInfo.user}`);
                            this.onLockAcquireFailed?.(lockInfo);
                        }
                    }
                } else if (!isDirty && this.isLocked) {
                    const unlocked = await Requests.unlockSheet(this.lockNamespace, this.lockKey, user);
                    if (unlocked) {
                        this.setLockState(false, null);
                    } else {
                        console.warn(`[sheetLockMixin] Failed to release lock for ${this.lockKey}`);
                    }
                }
            } catch (error) {
                console.error(`[sheetLockMixin] Lock operation failed for ${this.lockKey}:`, error);
                this.$modal.alert(
                    error.message?.includes('Failed to acquire write lock')
                        ? `Unable to acquire lock for ${this.lockKey}. The system is experiencing high concurrency. Please try again in a moment.`
                        : `Lock operation failed: ${error.message}`,
                    'Error'
                );
            } finally {
                this.lockingInProgress = false;
            }
        },

        async acquireLockForEdit() {
            const user = authState.user?.email;
            if (!user || !this.lockKey) return false;
            if (this.isLocked) return true;

            try {
                const lockInfo = await Requests.getSheetLock(this.lockNamespace, this.lockKey, user);
                if (lockInfo) {
                    this.setLockState(false, lockInfo.user);
                    return false;
                }

                const lockAcquired = await Requests.lockSheet(this.lockNamespace, this.lockKey, user);
                if (lockAcquired) {
                    this.setLockState(true, user);
                    return true;
                }

                const recheckInfo = await Requests.getSheetLock(this.lockNamespace, this.lockKey, user);
                if (recheckInfo) {
                    this.setLockState(false, recheckInfo.user);
                }
                return false;
            } catch (error) {
                console.error(`[sheetLockMixin] acquireLockForEdit failed for ${this.lockKey}:`, error);
                return false;
            }
        }
    }
};
