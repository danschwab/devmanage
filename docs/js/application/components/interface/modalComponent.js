import { html } from '../../index.js';

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
                    ></component>
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

    createModal(title = '', componentsOrSingle = null, options = {}) {
        if (!componentsOrSingle) {
            console.error('[ModalManager] No component(s) provided to createModal');
            throw new Error('Modal component(s) is required');
        }

        const modalId = options.id || `modal-${this.nextId++}`;

        // Always wrap as array
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

        this.modals.set(modalId, modalData);
        return modalData;
    }

    showModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal) {
            modal.isVisible = true;
            console.log('[ModalManager] showModal', modalId, modal);
        } else {
            console.warn('[ModalManager] showModal: modal not found', modalId);
        }
        return modal;
    }

    hideModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal) {
            modal.isVisible = false;
            console.log('[ModalManager] hideModal', modalId, modal);
        } else {
            console.warn('[ModalManager] hideModal: modal not found', modalId);
        }
        return modal;
    }

    removeModal(modalId) {
        const existed = this.modals.delete(modalId);
        console.log('[ModalManager] removeModal', modalId, 'removed:', existed);
        return existed;
    }

    getAllModals() {
        const all = Array.from(this.modals.values());
        console.log('[ModalManager] getAllModals', all);
        return all;
    }
}

// Create a global instance
export const modalManager = new ModalManager();