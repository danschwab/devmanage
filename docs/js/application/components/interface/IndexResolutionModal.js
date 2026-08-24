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
        showDescription: { type: Boolean, default: true },
        // Override feature: sources driving this mismatch (array of {sourceType, identifier})
        sources: { type: Array, default: () => [] },
        // async (sourceType) => string[] — fetches available link targets for the given domain
        onFetchOverrideTargets: { type: Function, default: null },
        // async (scheduleId, packlistId) => { applied } — persists the override
        onAddOverride: { type: Function, default: null }
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
        },
        hasOverrideOption() {
            return !!this.onAddOverride && !!this.onFetchOverrideTargets &&
                Array.isArray(this.sources) && this.sources.length > 0;
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
                        <label>The new name must not already exist in the index or abbreviations.</label>
                        <div class="input-container" style="margin-bottom: 0.75rem;">
                            <input
                                type="text"
                                v-model="customName"
                                :disabled="isSubmitting"
                                :placeholder="'new ' + issue.referenceType + ' name...'"
                                class="search-input"
                                style="width: 100%;"
                                @keydown.enter.prevent="submitCustomName"
                            />
                        </div>
                        <p v-if="errorMessage" style="color: var(--color-red); margin-bottom: 0.75rem;">{{ errorMessage }}</p>
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
        },

        async openOverrideModal(source) {
            if (this.isSubmitting || !this.onFetchOverrideTargets || !this.onAddOverride) return;
            if (!source || !source.identifier) return;

            const sourceType = source.sourceType;
            const sourceIdentifier = source.identifier;

            // Extract year from source identifier for filtering
            const yearMatch = String(sourceIdentifier || '').match(/\b(\d{4})\b/);
            const year = yearMatch ? yearMatch[1] : null;

            let allTargets = [];
            try {
                allTargets = await this.onFetchOverrideTargets(sourceType);
            } catch (e) {
                return;
            }

            // Filter to matching year only
            const targets = year
                ? allTargets.filter(t => t.includes(year))
                : allTargets;

            const self = this;
            const OverrideSelectModal = {
                inject: ['$modal'],
                props: {
                    sourceType: String,
                    sourceIdentifier: String,
                    targets: Array,
                    onConfirm: Function
                },
                data() {
                    return { filterText: '', isSubmitting: false };
                },
                computed: {
                    filteredTargets() {
                        const search = this.filterText.trim().toLowerCase();
                        if (!search) return this.targets;
                        return this.targets.filter(t => t.toLowerCase().includes(search));
                    },
                    targetDomainLabel() {
                        return this.sourceType === 'packlist' ? 'schedule entry' : 'packlist';
                    }
                },
                methods: {
                    async selectTarget(targetId) {
                        if (this.isSubmitting) return;
                        this.isSubmitting = true;
                        try {
                            const scheduleId = this.sourceType === 'packlist' ? targetId : this.sourceIdentifier;
                            const packlistId = this.sourceType === 'packlist' ? this.sourceIdentifier : targetId;
                            const result = await this.onConfirm?.(scheduleId, packlistId);
                            if (result?.applied !== false) this.$emit('close-modal');
                            else this.isSubmitting = false;
                        } catch (e) {
                            this.isSubmitting = false;
                        }
                    },
                    async ignoreForever() {
                        if (this.isSubmitting) return;
                        this.isSubmitting = true;
                        try {
                            const scheduleId = this.sourceType === 'schedule' ? this.sourceIdentifier : '';
                            const packlistId = this.sourceType === 'packlist' ? this.sourceIdentifier : '';
                            const result = await this.onConfirm?.(scheduleId, packlistId);
                            if (result?.applied !== false) this.$emit('close-modal');
                            else this.isSubmitting = false;
                        } catch (e) {
                            this.isSubmitting = false;
                        }
                    }
                },
                template: html`
                    <div :style="isSubmitting ? 'opacity: 0.7;' : ''">
                        <div v-if="targets.length" class="input-container" style="margin-bottom: 0.5rem;">
                            <input type="text" v-model="filterText" :disabled="isSubmitting" placeholder="Search..." class="search-input" style="width: 100%;" />
                        </div>
                        <ul>
                            <li v-if="!targets.length" class="card">No available {{ targetDomainLabel }}s found for this year.</li>
                            <li>
                                <button @click="ignoreForever" :disabled="isSubmitting" class="red" style="text-align: left; width: 100%;">
                                    Permanently ignore errors for this entry
                                </button>
                            </li>
                            <li v-for="target in filteredTargets" :key="target">
                                <button @click="selectTarget(target)" :disabled="isSubmitting" class="white" style="text-align: left;">
                                    {{ target }}
                                </button>
                            </li>
                        </ul>
                    </div>
                `
            };

            const targetDomainLabel = sourceType === 'packlist' ? 'schedule entry' : 'packlist';
            this.$modal.custom(OverrideSelectModal, {
                sourceType,
                sourceIdentifier,
                targets,
                onConfirm: async (scheduleId, packlistId) => {
                    const result = await self.onAddOverride(scheduleId, packlistId);
                    // Close the parent modal on successful override
                    if (result?.applied !== false) {
                        self.$emit('close-modal');
                    }
                    return result;
                },
                modalClass: 'hamburger-menu'
            }, `Link to ${targetDomainLabel}`);
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
                <li>
                    <button
                        @click="openCustomEntryModal"
                        :disabled="isSubmitting"
                        class="blue"
                        style="text-align: left; width: 100%;"
                    >
                        Enter custom new {{ issue.referenceType }}
                    </button>
                </li>
                <template v-if="hasOverrideOption && !includeAllCandidates">
                    <li v-for="source in sources" :key="source.sourceType + '-' + source.identifier">
                        <button
                            @click="openOverrideModal(source)"
                            :disabled="isSubmitting"
                            class=""
                            style="text-align: left; width: 100%;"
                        >
                            Override {{ source.identifier }}
                        </button>
                    </li>
                </template>
            </ul>
        </div>
    `
};
