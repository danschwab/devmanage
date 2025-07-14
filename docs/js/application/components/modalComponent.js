import { html } from '../utils/template-helpers.js';

export const ModalComponent = {
    props: {
        modalId: {
            type: String,
            required: true
        },
        title: {
            type: String,
            default: ''
        },
        isVisible: {
            type: Boolean,
            default: false
        },
        component: {
            type: [Object, Function],
            required: true
        },
        componentProps: {
            type: Object,
            default: () => ({ })
        }
    },
    methods: {
        closeModal() {
            this.$emit('close-modal', this.modalId);
        }
    },
    template: html`
        <div v-if="isVisible" class="modal-overlay" @click.self="closeModal">
            <div class="modal" :data-modal-id="modalId">
                <div class="modal-header">
                    <h3>{{ title }}</h3>
                    <button class="close-button" @click="closeModal">&times;</button>
                </div>
                <div class="modal-content">
                    <!-- Always render as reactive Vue component with unique key for reactivity -->
                    <component 
                        :is="component" 
                        :key="modalId + '-' + JSON.stringify(componentProps)"
                        v-bind="componentProps">
                    </component>
                </div>
            </div>
        </div>
    `
};

// Modal Manager - now purely component-based
export class ModalManager {
    constructor() {
        this.modals = new Map();
        this.nextId = 1;
    }

    createModal(title = '', component = null, options = {}) {
        if (!component) {
            throw new Error('Modal component is required');
        }
        
        const modalId = options.id || `modal-${this.nextId++}`;
        
        const modalData = {
            id: modalId,
            title: title,
            isVisible: false,
            component: component,
            componentProps: options.componentProps || {},
            created: new Date()
        };

        this.modals.set(modalId, modalData);
        return modalData;
    }

    showModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal) {
            modal.isVisible = true;
        }
        return modal;
    }

    hideModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal) {
            modal.isVisible = false;
        }
        return modal;
    }

    removeModal(modalId) {
        return this.modals.delete(modalId);
    }

    getAllModals() {
        return Array.from(this.modals.values());
    }
}

// Create a global instance
export const modalManager = new ModalManager();