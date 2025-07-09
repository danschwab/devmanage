// Modal Component - Vue implementation of ModalManager functionality
const { ref, onMounted, onUnmounted } = Vue;

export default {
    name: 'Modal',
    props: {
        modal: {
            type: Object,
            required: true
        }
    },
    emits: ['close'],
    setup(props, { emit }) {
        const modalRef = ref(null);
        const isVisible = ref(false);

        const hideModal = () => {
            isVisible.value = false;
            setTimeout(() => {
                emit('close', props.modal.id);
            }, 200); // Match the fade out transition
        };

        const handleConfirmYes = () => {
            if (props.modal.onConfirm) {
                props.modal.onConfirm(true);
            }
            hideModal();
        };

        const handleConfirmNo = () => {
            if (props.modal.onConfirm) {
                props.modal.onConfirm(false);
            }
            hideModal();
        };

        const handleAlertOk = () => {
            if (props.modal.onAlert) {
                props.modal.onAlert();
            }
            hideModal();
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape' && props.modal.options.showClose) {
                hideModal();
            }
        };

        onMounted(() => {
            // Set the hide function for external access
            props.modal.hide = hideModal;
            
            // Fade in after a short delay
            setTimeout(() => {
                isVisible.value = true;
            }, 10);

            // Focus the modal for accessibility
            setTimeout(() => {
                if (modalRef.value) {
                    modalRef.value.focus();
                }
            }, 50);

            // Add keyboard listener
            document.addEventListener('keydown', handleKeydown);
        });

        onUnmounted(() => {
            document.removeEventListener('keydown', handleKeydown);
        });

        return {
            modalRef,
            isVisible,
            hideModal,
            handleConfirmYes,
            handleConfirmNo,
            handleAlertOk
        };
    },
    template: `
        <div 
            ref="modalRef"
            class="modal" 
            :style="{ opacity: isVisible ? '1' : '0' }"
            tabindex="-1"
            @click.self="modal.options.showClose && hideModal()"
        >
            <div class="modal-content">
                <div v-if="modal.options.showClose" class="modal-header">
                    <span class="modal-close" @click="hideModal">&times;</span>
                </div>
                <div 
                    class="modal-body" 
                    v-html="modal.content"
                    @click="handleModalBodyClick"
                ></div>
            </div>
        </div>
    `,
    methods: {
        handleModalBodyClick(event) {
            // Handle confirm buttons
            if (event.target.classList.contains('confirm-yes')) {
                this.handleConfirmYes();
            } else if (event.target.classList.contains('confirm-no')) {
                this.handleConfirmNo();
            } else if (event.target.classList.contains('alert-ok')) {
                this.handleAlertOk();
            }
        }
    }
};
