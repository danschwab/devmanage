import { html } from '../../index.js';

// Create simple alert and confirm components
const AlertComponent = {
    props: {
        message: String,
        timeout: {
            type: Number,
            default: 1300 // milliseconds
        }
    },
    mounted() {
        setTimeout(() => {
            this.$emit('close-modal');
        }, this.timeout);
    },
    template: html`
        <div style="text-align: center; padding: 1rem;">
            <p>{{ message }}</p>
        </div>
    `
};

const ConfirmComponent = {
    props: {
        message: String,
        onConfirm: Function,
        onCancel: Function
    },
    methods: {
        handleConfirm() {
            this.onConfirm?.();
            this.$emit('close-modal');
        },
        handleCancel() {
            this.onCancel?.();
            this.$emit('close-modal');
        }
    },
    template: html`
        <div style="text-align: center; padding: 1rem;">
            <p>{{ message }}</p>
            <button @click="handleConfirm">Confirm</button>
            <button @click="handleCancel">Cancel</button>
        </div>
    `
};

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
        components: {
            type: Array,
            required: true
        },
        componentProps: {
            type: Object,
            default: () => ({ })
        }
    },
    methods: {
        closeModal() {
            console.log('[ModalComponent] closeModal called for', this.modalId);
            this.$emit('close-modal', this.modalId);
        },
        handleChildClose() {
            // Always emit with this modal's id
            this.$emit('close-modal', this.modalId);
        }
    },
    created() {
        // Vue 2: this.$options.propsData, Vue 3: this.$props
        // Log all props received by the component
        console.log('[ModalComponent] created, props:', this.$props || this.$options?.propsData);
        if (!this.components) {
            console.warn('[ModalComponent] created: components prop is undefined!', this.$props || this.$options?.propsData);
        } else if (!Array.isArray(this.components)) {
            console.warn('[ModalComponent] created: components prop is not an array!', this.components);
        }
    },
    mounted() {
        console.log('[ModalComponent] mounted', {
            modalId: this.modalId,
            isVisible: this.isVisible,
            components: this.components,
            componentProps: this.componentProps
        });
        if (!this.components) {
            console.warn('[ModalComponent] mounted: components prop is undefined!');
        } else if (!Array.isArray(this.components)) {
            console.warn('[ModalComponent] mounted: components prop is not an array!', this.components);
        }
    },
    updated() {
        console.log('[ModalComponent] updated', {
            modalId: this.modalId,
            isVisible: this.isVisible,
            components: this.components,
            componentProps: this.componentProps
        });
    },
    template: html`
        <div v-if="isVisible" class="modal-overlay" @click.self="closeModal">
            <div class="modal" :data-modal-id="modalId">
                <div class="modal-header">
                    <h3>{{ title }}</h3>
                    <button class="close-button" @click="closeModal">&times;</button>
                </div>
                <div class="modal-content">
                    <component
                        v-for="(comp, idx) in components"
                        :is="comp"
                        :key="modalId + '-' + idx + '-' + JSON.stringify(componentProps)"
                        v-bind="componentProps"
                        @close-modal="handleChildClose"
                    ></component>
                </div>
            </div>
        </div>
    `
};

// Modal Manager - now purely component-based
export class ModalManager {
    constructor() {
        this.nextId = 1;
        this._reactiveModals = null;
    }

    setReactiveModals(reactiveArray) {
        this._reactiveModals = reactiveArray;
    }

    get modals() {
        return this._reactiveModals || [];
    }

    createModal(title = '', componentsOrSingle = null, options = {}) {
        if (!componentsOrSingle) {
            console.error('[ModalManager] No component(s) provided to createModal');
            throw new Error('Modal component(s) is required');
        }
        const modalId = options.id || `modal-${this.nextId++}`;
        const components = Array.isArray(componentsOrSingle)
            ? componentsOrSingle
            : [componentsOrSingle];
        const modalData = {
            id: modalId,
            title: title,
            isVisible: false,
            components: components,
            componentProps: options.componentProps || {},
            created: new Date()
        };
        console.log('[ModalManager] createModal', modalData);
        this.modals.push(modalData);
        return modalData;
    }

    showModal(modalId) {
        const modal = this.modals.find(m => m.id === modalId);
        if (modal) {
            modal.isVisible = true;
            console.log('[ModalManager] showModal', modalId, modal);
        } else {
            console.warn('[ModalManager] showModal: modal not found', modalId);
        }
        return modal;
    }

    removeModal(modalId) {
        const index = this.modals.findIndex(m => m.id === modalId);
        if (index !== -1) {
            this.modals.splice(index, 1);
            console.log('[ModalManager] removeModal', modalId, 'removed: true');
            return true;
        }
        console.log('[ModalManager] removeModal', modalId, 'removed: false');
        return false;
    }

    getAllModals() {
        console.log('[ModalManager] getAllModals', this.modals);
        return this.modals;
    }

    // Show an alert modal with a message and optional title
    showAlert(message, title = 'Alert') {
        const modal = this.createModal(title, AlertComponent, {
            componentProps: { message }
        });
        this.showModal(modal.id);
        return modal;
    }

    // Show a confirm modal with message, confirm/cancel callbacks, and optional title
    showConfirm(message, onConfirm, onCancel, title = 'Confirm') {
        const modal = this.createModal(title, ConfirmComponent, {
            componentProps: { message, onConfirm, onCancel }
        });
        this.showModal(modal.id);
        return modal;
    }
}

// Create a global instance
export const modalManager = new ModalManager();