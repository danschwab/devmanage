// Vue Modal Store - based on existing ModalManager.js
const { ref, reactive } = Vue;

// Modal state management
const modalState = reactive({
    modals: []
});

export const useModal = () => {
    const addModal = (modal) => {
        modalState.modals.push(modal);
    };

    const removeModal = (id) => {
        const index = modalState.modals.findIndex(m => m.id === id);
        if (index !== -1) {
            modalState.modals.splice(index, 1);
        }
    };

    const createModal = (content, options = {}) => {
        const modal = {
            id: Date.now() + Math.random(),
            content,
            options: {
                showClose: options.showClose !== false,
                ...options
            },
            hide: null // Will be set by the modal component
        };

        addModal(modal);
        return modal;
    };

    const confirm = (message) => {
        return new Promise((resolve) => {
            const modal = createModal(`
                <div style="text-align: center;">
                    <p>${message}</p>
                    <div class="button-container" style="justify-content: center;">
                        <button class="confirm-yes">Yes</button>
                        <button class="confirm-no">No</button>
                    </div>
                </div>
            `, { showClose: false });

            modal.onConfirm = resolve;
        });
    };

    const alert = (message) => {
        return new Promise((resolve) => {
            const modal = createModal(`
                <div style="text-align: center;">
                    <p>${message}</p>
                    <div class="button-container" style="justify-content: center;">
                        <button class="alert-ok">OK</button>
                    </div>
                </div>
            `, { showClose: false });

            modal.onAlert = resolve;
        });
    };

    const showLoadingIndicator = (text = 'Loading...') => {
        let hideCalled = false;
        let timeoutId = null;
        let modal = null;

        const loadingModal = {
            hide: () => {
                hideCalled = true;
                if (modal) modal.hide();
                if (timeoutId) clearTimeout(timeoutId);
            }
        };

        timeoutId = setTimeout(() => {
            if (hideCalled) return;
            modal = createModal(`
                <div style="text-align: center;">
                    ${text ? `<div style="margin-bottom: 10px;">${text}</div>` : ''}
                    <img src="images/loading.gif" alt="loading..." style="max-width: 64px; margin: 20px;">
                </div>
            `, { showClose: false });
            
            loadingModal.hide = () => {
                if (modal) modal.hide();
            };
        }, 500);

        return loadingModal;
    };

    const notify = (message, options = { showClose: true, timeout: 1500 }) => {
        const modal = createModal(`
            <div style="text-align: center;">
                <p>${message}</p>
            </div>
        `, options);

        if (options.timeout) {
            setTimeout(() => modal.hide(), options.timeout);
        }

        return modal;
    };

    return {
        modals: modalState.modals,
        createModal,
        confirm,
        alert,
        showLoadingIndicator,
        notify,
        removeModal
    };
};
