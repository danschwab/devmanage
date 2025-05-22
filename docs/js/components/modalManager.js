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
                modal.remove();
                resolve(true);
            });

            modal.querySelector('.confirm-no').addEventListener('click', () => {
                modal.remove();
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
                modal.remove();
                resolve();
            });
        });
    }

    static notify(message, options = { showClose: true, timeout: 3000 }) {
        const modal = this.createModal(`
            <div style="text-align: center;">
                <p>${message}</p>
            </div>
        `, options);

        if (options.timeout) {
            setTimeout(() => modal.remove(), options.timeout);
        }

        return modal;
    }
}
