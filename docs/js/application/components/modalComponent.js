import { html } from '../utils/template-helpers.js';

// Modal component functionality
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
    },
    methods: {
        closeModal() {
            this.$emit('close-modal', this.modalId);
        },
        onBackdropClick(event) {
            // Close modal if clicking on backdrop (not modal content)
            if (event.target === event.currentTarget) {
                this.closeModal();
            }
        }
    },
    template: html `
            <div v-if="isVisible" 
                 class="modal" 
                 @click="onBackdropClick"
                 :data-modal-id="modalId">
                <div class="modal-content">
                    <div v-if="title" class="modal-header">
                        <h1>{{ title }}</h1>
                        <div class="modal-close" @click="closeModal">×</div>
                    </div>
                    <div v-else class="modal-header">
                        <div class="modal-close" @click="closeModal">×</div>
                    </div>
                    <div class="modal-body">
                        <slot name="content">
                            <p>Modal content goes here</p>
                        </slot>
                    </div>
                </div>
            </div>
    `
};

// Modal Manager - handles multiple modals
export class ModalManager {
    constructor() {
        this.modals = new Map();
        this.nextId = 1;
        this.zIndexBase = 1000;
    }

    createModal(title = '', content = '', options = {}) {
        const modalId = options.id || `modal-${this.nextId++}`;
        
        const modalData = {
            id: modalId,
            title: title,
            content: content,
            isVisible: false,
            zIndex: this.zIndexBase,
            created: new Date(),
            options: options
        };

        this.modals.set(modalId, modalData);
        return modalData;
    }

    showModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal) {
            modal.isVisible = true;
            // Bring to front
            modal.zIndex = this.zIndexBase;
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

    getModal(modalId) {
        return this.modals.get(modalId);
    }

    getAllModals() {
        return Array.from(this.modals.values());
    }

    getVisibleModals() {
        return Array.from(this.modals.values()).filter(modal => modal.isVisible);
    }

    hideAllModals() {
        this.modals.forEach(modal => {
            modal.isVisible = false;
        });
    }

    clearAllModals() {
        this.modals.clear();
        this.nextId = 1;
    }
}

// Create a global instance
export const modalManager = new ModalManager();
