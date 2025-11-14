import { html } from '../../index.js';

/**
 * LoadingBarComponent - A reusable progress indicator
 * 
 * Shows different states based on props:
 * - Hidden when not loading/analyzing
 * - Indeterminate progress when percentComplete is -1
 * - Determinate progress when percentComplete is 0-100
 */
export const LoadingBarComponent = {
    props: {
        key: {
            type: String,
            default: 'defaultkey'
        },
        isLoading: {
            type: Boolean,
            default: false
        },
        isAnalyzing: {
            type: Boolean,
            default: false
        },
        percentComplete: {
            type: Number,
            default: -1
        }
    },
    computed: {
        isVisible() {
            return this.isLoading || this.isAnalyzing;
        },
        isIndeterminate() {
            return this.percentComplete === -1;
        },
        progressWidth() {
            if (this.isIndeterminate) {
                return '30%'; // Width of the moving bar
            }
            return Math.min(Math.max(this.percentComplete, 0), 100) + '%';
        },
        progressClass() {
            return this.isIndeterminate ? 'progress-indeterminate' : 'progress-determinate';
        }
    },
    template: html`
        <transition name="fade">
            <div v-if="isVisible" class="loading-bar-container" :key="'loading-bar-' + key">
                <div class="loading-bar-track">
                    <div 
                        class="loading-bar-fill"
                        :class="progressClass"
                        :style="{ width: progressWidth }"
                    ></div>
                </div>
            </div>
        </transition>
    `
};