export class ModalManager {
    static createModal(content, options = {}) {
        const modal = document.createElement('div');
        modal.classList.add('modal');
        
        modal.innerHTML = `
            <div class="modal-content">
                ${options.showClose !== false ? `
                    <div class="modal-header">
                        <span class="modal-close">&times;</span>
                    </div>
                ` : ''}
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add close handler if needed
        if (options.showClose !== false) {
            modal.querySelector('.modal-close')?.addEventListener('click', () => {
                modal.remove();
            });
        }

        return modal;
    }
}
