import { html } from '../../index.js';

/**
 * Shared modal component for resolving missing client/show index entries.
 * Used by ScheduleTable, PacklistTable, and IndexMismatchReport.
 *
 * Props:
 *   issue             { referenceType, rawValue }
 *   options           Array of resolution option objects from getReferenceResolutionOptions
 *   includeAllCandidates  Boolean — switches to full-list browse mode with filter input
 *   onSelectOption    async (option) => { applied, browsedAll, message }
 *                     • In ScheduleTable / PacklistTable: immediately applies the change and
 *                       returns { applied: true } on success, or { applied: false, message }
 *                       on conflict, or { browsedAll: true } when re-opening with all candidates.
 *                     • In IndexMismatchReport: stores the selection as a pending resolution
 *                       and always returns { applied: true } so the modal closes.
 */
export const IndexResolutionComponent = {
    inject: ['$modal'],
    props: {
        issue: Object,
        options: Array,
        includeAllCandidates: Boolean,
        onSelectOption: Function,
        showDescription: { type: Boolean, default: true }
    },
    data() {
        return {
            filterText: '',
            isSubmitting: false
        };
    },
    computed: {
        filteredOptions() {
            if (!this.includeAllCandidates || !this.filterText.trim()) {
                return this.options;
            }
            const search = this.filterText.trim().toLowerCase();
            return this.options.filter(option => {
                const searchableText = option.canonicalName || option.label;
                return searchableText.toLowerCase().includes(search);
            });
        }
    },
    methods: {
        async selectOption(option) {
            if (this.isSubmitting) return;
            this.isSubmitting = true;
            try {
                let result;
                if (this.onSelectOption) {
                    result = await this.onSelectOption(option);
                }
                if (!result || result.applied || result.browsedAll) {
                    this.$emit('close-modal');
                } else {
                    this.isSubmitting = false;
                }
            } catch (error) {
                this.isSubmitting = false;
            }
        },
        async openCustomEntryModal() {
            if (this.isSubmitting) return;

            const CustomEntryComponent = {
                props: {
                    issue: Object,
                    onSubmit: Function
                },
                data() {
                    return {
                        customName: '',
                        isSubmitting: false,
                        errorMessage: ''
                    };
                },
                methods: {
                    async submitCustomName() {
                        if (this.isSubmitting) return;
                        const nextName = this.customName.trim();
                        if (!nextName) {
                            this.errorMessage = 'Enter a name before submitting.';
                            return;
                        }
                        this.isSubmitting = true;
                        this.errorMessage = '';
                        try {
                            const result = await this.onSubmit?.(nextName);
                            if (result?.applied) {
                                this.$emit('close-modal');
                                return;
                            }
                            this.errorMessage = result?.message || 'That value already exists in the index or abbreviations.';
                        } catch (error) {
                            this.errorMessage = error?.message || 'Unable to add the custom entry.';
                        } finally {
                            this.isSubmitting = false;
                        }
                    }
                },
                template: html`
                    <div :style="isSubmitting ? 'opacity: 0.7;' : ''">
                        <p>Enter a custom new {{ issue.referenceType }}.</p>
                        <p>The new name must not already exist in the index or abbreviations.</p>
                        <div class="input-container" style="margin: 0.75rem 0;">
                            <input
                                type="text"
                                v-model="customName"
                                :disabled="isSubmitting"
                                :placeholder="'Enter custom new ' + issue.referenceType"
                                class="search-input"
                                style="width: 100%;"
                                @keydown.enter.prevent="submitCustomName"
                            />
                        </div>
                        <p v-if="errorMessage" style="color: var(--color-red, #b00020); margin-bottom: 0.75rem;">{{ errorMessage }}</p>
                        <div class="button-bar">
                            <button @click="submitCustomName" :disabled="isSubmitting || !customName.trim()" class="blue">Submit</button>
                            <button @click="$emit('close-modal')" :disabled="isSubmitting" class="gray">Cancel</button>
                        </div>
                    </div>
                `
            };

            this.$modal.custom(CustomEntryComponent, {
                issue: this.issue,
                onSubmit: async (customName) => {
                    if (this.onSelectOption) {
                        const result = await this.onSelectOption({
                            actionType: 'add-custom',
                            label: `[NEW] ${customName}`,
                            canonicalName: customName,
                            abbreviation: this.issue.rawValue
                        });
                        if (result?.applied) {
                            this.$emit('close-modal');
                        }
                        return result;
                    }
                    return { applied: false, message: 'Unable to submit the custom entry.' };
                },
                modalClass: 'hamburger-menu'
            }, `Enter custom new ${this.issue.referenceType}`);
        }
    },
    template: html`
        <div :style="isSubmitting ? 'opacity: 0.7;' : ''">
            <div v-if="includeAllCandidates" class="input-container" style="margin-bottom: 0.5rem;">
                <input type="text" v-model="filterText" :disabled="isSubmitting" placeholder="Filter options..." class="search-input" style="width: 100%;" />
            </div>
            <div v-else-if="showDescription" style="margin-bottom: 1rem;">
                <p>A production schedule index entry was missing.</p>
                <p v-if="isSubmitting">Applying update...</p>
                <p v-else>Resolve below to prevent analytics issues:</p>
            </div>
            <ul>
                <li v-for="option in filteredOptions" :key="option.actionType + '-' + option.label">
                    <button
                        @click="selectOption(option)"
                        :disabled="isSubmitting"
                        :class="option.buttonClass || 'white'"
                        style="text-align: left;"
                    >
                        {{ option.label }}
                    </button>
                </li>
                <li v-if="!includeAllCandidates" style="margin-top: 0.5rem;">
                    <button
                        @click="openCustomEntryModal"
                        :disabled="isSubmitting"
                        class="blue"
                        style="text-align: left; width: 100%;"
                    >
                        Enter custom new {{ issue.referenceType }}
                    </button>
                </li>
            </ul>
        </div>
    `
};
