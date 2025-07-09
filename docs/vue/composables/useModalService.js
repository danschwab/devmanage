// Modal Service - Vue composable that provides modal functionality
// This provides the same API as the original ModalManager.js but works with Vue

export const useModalService = () => {
    let modalStore;
    
    // Lazy load modal store
    const getModalStore = async () => {
        if (!modalStore) {
            const { useModal } = await import('./modal.js');
            modalStore = useModal();
        }
        return modalStore;
    };
    
    const createModal = async (content, options = {}) => {
        const store = await getModalStore();
        return store.createModal(content, options);
    };
    
    const confirm = async (message) => {
        const store = await getModalStore();
        return store.confirm(message);
    };
    
    const alert = async (message) => {
        const store = await getModalStore();
        return store.alert(message);
    };
    
    const showLoadingIndicator = async (text = 'Loading...') => {
        const store = await getModalStore();
        return store.showLoadingIndicator(text);
    };
    
    const notify = async (message, options = { showClose: true, timeout: 1500 }) => {
        const store = await getModalStore();
        return store.notify(message, options);
    };
    
    return {
        createModal,
        confirm,
        alert,
        showLoadingIndicator,
        notify
    };
};
