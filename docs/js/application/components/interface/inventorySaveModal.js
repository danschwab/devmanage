import { html, todayISOString } from '../../index.js';

/**
 * Modal displayed before any inventory save.
 * Asks for an effective date (today = apply immediately; future = schedule) and a required note.
 *
 * Props:
 *   onConfirm(scheduledDate: string, note: string) — called with ISO date and trimmed note on confirm.
 *
 * Emits 'close-modal' to close itself.
 */
export const InventorySaveModal = {
    props: {
        onConfirm: {
            type: Function,
            required: true
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
            if (!this.note.trim()) {
                this.error = 'A note is required';
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
                <label>Note <span style="color: var(--color-red)">*</span></label>
                <input
                    type="text"
                    v-model="note"
                    maxlength="25"
                    placeholder="What changed and why?"
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
                <span v-else-if="isFutureDate" class="helper-text">Changes will be stored as a scheduled update</span>
            </div>
            <div class="button-bar">
                <button @click="handleApplyNow" class="purple">Apply Now</button>
                <button
                    @click="handleSchedule"
                    class="purple"
                    :disabled="!isFutureDate"
                    :title="!isFutureDate ? 'Select a future date to schedule' : 'Schedule for ' + scheduledDate"
                >Schedule</button>
                <button @click="$emit('close-modal')">Cancel</button>
            </div>
        </div>
    `
};
