export class ModalManager {
    static createModal(content, options = {}) {
        const modal = document.createElement('div');
        modal.classList.add('modal');
        
        modal.hide = () => {
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.remove();
            }, 200);
        };
        
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

        // Fade in after a short delay to trigger transition
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);

        // Set focus to the modal for accessibility
        modal.setAttribute('tabindex', '-1');
        setTimeout(() => { modal.focus(); }, 0);

        // Add close handler if needed
        if (options.showClose !== false) {
            modal.querySelector('.modal-close')?.addEventListener('click', () => {
                modal.hide();
            });
        }

        return modal;
    }

    static async confirm(message) {
        return new Promise((resolve) => {
            const modal = this.createModal(`
                <div style="text-align: center;">
                    <p>${message}</p>
                    <div class="button-container" style="justify-content: center;">
                        <button class="confirm-yes">Yes</button>
                        <button class="confirm-no">No</button>
                    </div>
                </div>
            `, { showClose: false });

            modal.querySelector('.confirm-yes').addEventListener('click', () => {
                modal.hide();
                resolve(true);
            });

            modal.querySelector('.confirm-no').addEventListener('click', () => {
                modal.hide();
                resolve(false);
            });
        });
    }

    static async alert(message) {
        return new Promise((resolve) => {
            const modal = this.createModal(`
                <div style="text-align: center;">
                    <p>${message}</p>
                    <div class="button-container" style="justify-content: center;">
                        <button class="alert-ok">OK</button>
                    </div>
                </div>
            `, { showClose: false });

            modal.querySelector('.alert-ok').addEventListener('click', () => {
                modal.hide();
                resolve();
            });
        });
    }

    static showLoadingIndicator(text = 'loading...') {
        let modal = null;
        let shown = false;
        let hideCalled = false;
        let timeoutId = null;

        // Create a wrapper object to allow .hide before modal is shown
        const loadingModal = {
            hide: () => {
                hideCalled = true;
                if (modal) modal.hide();
            }
        };

        timeoutId = setTimeout(() => {
            if (hideCalled) return;
            modal = ModalManager.createModal(`
                <div style="text-align: center;">
                    ${text ? `<div style="margin-bottom: 10px;">${text}</div>` : ''}
                    <img src="images/loading.gif" alt="loading..." style="max-width: 64px; margin: 20px;">
                </div>
            `, { showClose: false });
            shown = true;
            // Patch .hide to remove the modal if not already removed
            loadingModal.hide = () => {
                if (modal) modal.hide();
            };
        }, 500);

        return loadingModal;
    }

    static notify(message, options = { showClose: true, timeout: 3000 }) {
        const modal = this.createModal(`
            <div style="text-align: center;">
                <p>${message}</p>
            </div>
        `, options);

        if (options.timeout) {
            setTimeout(() => modal.hide(), options.timeout);
        }

        return modal;
    }
}
