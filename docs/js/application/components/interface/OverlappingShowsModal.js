import { html } from '../../index.js';

/**
 * Modal component for displaying a list of overlapping shows/packlists
 * Used when there are many overlapping shows that don't fit inline
 */
export const OverlappingShowsModal = {
    props: {
        shows: {
            type: Array,
            required: true
        }
    },
    inject: ['appContext'],
    methods: {
        navigateToShow(showId) {
            if (this.appContext?.navigateToPath) {
                this.appContext.navigateToPath('packlist/' + showId + '/details');
            }
            this.$emit('close-modal');
        }
    },
    template: html`
        <div class="overlapping-shows-modal-content">
            <div class="overlapping-shows-buttons">
                <button v-for="showId in shows"
                        :key="showId"
                        @click="navigateToShow(showId)"
                        class="white">
                    {{ showId }}
                </button>
            </div>
        </div>
    `
};
