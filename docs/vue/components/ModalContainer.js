// Modal Container - manages all active modals
import Modal from './Modal.js';
import { useModal } from '../stores/modal.js';

export default {
    name: 'ModalContainer',
    components: {
        Modal
    },
    setup() {
        const { modals, removeModal } = useModal();

        const handleModalClose = (modalId) => {
            removeModal(modalId);
        };

        return {
            modals,
            handleModalClose
        };
    },
    template: `
        <teleport to="body">
            <Modal 
                v-for="modal in modals" 
                :key="modal.id"
                :modal="modal"
                @close="handleModalClose"
            />
        </teleport>
    `
};
