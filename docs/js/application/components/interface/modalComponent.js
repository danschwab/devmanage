import { html } from '../../index.js';

// Simple alert component
const AlertComponent = {
    props: ['message'],
    computed: {
        formattedMessage() {
            return this.message ? this.message.replace(/\n/g, '<br>') : '';
        }
    },
    mounted() {
        setTimeout(() => this.$emit('close-modal'), 3000);
    },
    template: html`<div style="text-align: center; padding: 1rem;"><div v-html="formattedMessage"></div></div>`
};

// Simple confirm component
const ConfirmComponent = {
    props: ['message', 'onConfirm', 'onCancel', 'confirmText', 'cancelText'],
    computed: {
        formattedMessage() {
            return this.message ? this.message.replace(/\n/g, '<br>') : '';
        }
    },
    methods: {
        confirm() { this.onConfirm?.(); this.$emit('close-modal'); },
        cancel() { this.onCancel?.(); this.$emit('close-modal'); }
    },
    template: html`
        <div style="text-align: center; padding: 1rem;">
            <div v-html="formattedMessage"></div>
            <div style="margin-top: 1rem;" class="button-bar">
                <button @click="confirm">{{ confirmText || 'Ok' }}</button>
                <button @click="cancel">{{ cancelText || 'Cancel' }}</button>
            </div>
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

// Error component with icon and no auto-dismiss
const ErrorComponent = {
    props: ['message'],
    computed: {
        formattedMessage() {
            return this.message ? this.message.replace(/\n/g, '<br>') : '';
        }
    },
    template: html`
        <div style="text-align: center; padding: 1rem;">
            <img src="images/error.png" alt="Error" style="width: 64px; height: 64px; margin-bottom: 1rem;" />
            <div v-html="formattedMessage" style="color: var(--color-red); font-weight: 500;"></div>
        </div>
    `
}

export const ModalComponent = {
    props: {
        modalId: { type: String, required: true },
        title: { type: String, default: '' },
        isVisible: { type: Boolean, default: false },
        components: { type: Array, required: true },
        modalClass: { type: String, default: '' },
        componentProps: { type: Object, default: () => ({}) }
    },
    methods: {
        closeModal() { this.$emit('close-modal', this.modalId); }
    },
    template: html`
        <div v-if="isVisible" class="modal-overlay" @click.self="closeModal">
            <div :class="['modal', modalClass]">
                <div class="modal-header">
                    <h3>{{ title }}</h3>
                    <button class="close-button" @click="closeModal">✖</button>
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
        // Extract modalClass from props if present
        const { modalClass, ...componentProps } = props || {};
        
        const modal = {
            id: `modal-${this.nextId++}`,
            title,
            isVisible: true,
            components: Array.isArray(components) ? components : [components],
            modalClass: modalClass || '',
            componentProps
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

    confirm(message, onConfirm, onCancel = null, title = 'Confirm', confirmText = null, cancelText = null) {
        return this._create(title, ConfirmComponent, { message, onConfirm, onCancel, confirmText, cancelText });
    }

    image(imageUrl, title = 'Image') {
        return this._create(title, ImageComponent, { imageUrl });
    }

    error(message, title = 'Error') {
        return this._create(title, ErrorComponent, { message });
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