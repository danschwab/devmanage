// Global Modal Service - provides the same API as original ModalManager.js
// This can be used anywhere in the app, similar to the original ModalManager

class VueModalManager {
    static modalStore = null;
    
    static async getModalStore() {
        if (!this.modalStore) {
            const { useModal } = await import('./stores/modal.js');
            this.modalStore = useModal();
        }
        return this.modalStore;
    }
    
    static async createModal(content, options = {}) {
        const store = await this.getModalStore();
        return store.createModal(content, options);
    }
    
    static async confirm(message) {
        const store = await this.getModalStore();
        return store.confirm(message);
    }
    
    static async alert(message) {
        const store = await this.getModalStore();
        return store.alert(message);
    }
    
    static async showLoadingIndicator(text = 'Loading...') {
        const store = await this.getModalStore();
        return store.showLoadingIndicator(text);
    }
    
    static async notify(message, options = { showClose: true, timeout: 1500 }) {
        const store = await this.getModalStore();
        return store.notify(message, options);
    }
}

// Export for use in other parts of the app
export { VueModalManager };

// Also make it available globally (similar to original ModalManager)
if (typeof window !== 'undefined') {
    window.VueModalManager = VueModalManager;
}
