import { html } from '../../index.js';

// Simple alert component
const AlertComponent = {
    props: ['message'],
    mounted() {
        setTimeout(() => this.$emit('close-modal'), 1300);
    },
    template: html`<div style="text-align: center; padding: 1rem;"><p>{{ message }}</p></div>`
};

// Simple confirm component
const ConfirmComponent = {
    props: ['message', 'onConfirm', 'onCancel'],
    methods: {
        confirm() { this.onConfirm?.(); this.$emit('close-modal'); },
        cancel() { this.onCancel?.(); this.$emit('close-modal'); }
    },
    template: html`
        <div style="text-align: center; padding: 1rem;">
            <p>{{ message }}</p>
            <button @click="confirm">Confirm</button>
            <button @click="cancel">Cancel</button>
        </div>
    `
};

// Simple image component
const ImageComponent = {
    props: ['imageUrl'],
    template: html`
        <div style="text-align: center; padding: 1rem;">
            <img :src="imageUrl" alt="Image" style="max-width: 90vw; max-height: 80vh; object-fit: contain;" />
        </div>
    `
};

export const ModalComponent = {
    props: {
        modalId: { type: String, required: true },
        title: { type: String, default: '' },
        isVisible: { type: Boolean, default: false },
        components: { type: Array, required: true },
        componentProps: { type: Object, default: () => ({}) }
    },
    methods: {
        closeModal() { this.$emit('close-modal', this.modalId); }
    },
    template: html`
        <div v-if="isVisible" class="modal-overlay" @click.self="closeModal">
            <div class="modal">
                <div class="modal-header">
                    <h3>{{ title }}</h3>
                    <button class="close-button" @click="closeModal">&times;</button>
                </div>
                <div class="modal-content">
                    <component v-for="(comp, idx) in components" :is="comp" :key="idx" 
                               v-bind="componentProps" @close-modal="closeModal"></component>
                </div>
            </div>
        </div>
    `
};

// Simplified Modal Manager - single class, essential methods only
export class ModalManager {
    constructor() {
        this.nextId = 1;
        this.modals = [];
    }

    setReactiveModals(reactiveArray) {
        this.modals = reactiveArray;
    }

    _create(title, components, props) {
        const modal = {
            id: `modal-${this.nextId++}`,
            title,
            isVisible: true,
            components: Array.isArray(components) ? components : [components],
            componentProps: props || {}
        };
        this.modals.push(modal);
        return modal;
    }

    removeModal(modalId) {
        const index = this.modals.findIndex(m => m.id === modalId);
        if (index !== -1) this.modals.splice(index, 1);
    }

    // Core methods that are actually used
    alert(message, title = 'Alert') {
        return this._create(title, AlertComponent, { message });
    }

    confirm(message, onConfirm, onCancel = null, title = 'Confirm') {
        return this._create(title, ConfirmComponent, { message, onConfirm, onCancel });
    }

    image(imageUrl, title = 'Image') {
        return this._create(title, ImageComponent, { imageUrl });
    }

    custom(components, props = {}, title = '') {
        return this._create(title, components, props);
    }

    // Legacy compatibility (remove these after testing)
    showAlert(message, title) { return this.alert(message, title); }
    showConfirm(message, onConfirm, onCancel, title) { return this.confirm(message, onConfirm, onCancel, title); }
    createModal(title, components, options) { return this._create(title, components, options.componentProps); }
    showModal() { /* No-op - modals show immediately now */ }
}

// Create a global instance
export const modalManager = new ModalManager();