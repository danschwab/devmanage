import { GoogleSheetsAuth } from './googleSheetsAuth.js';

export class FormBuilder {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.loadingMessage = document.createElement('div');
        this.loadingMessage.textContent = 'Loading form...';
        this.loadingMessage.className = 'loading-message';
        this.container.appendChild(this.loadingMessage);
        
        this.form = document.createElement('form');
        this.form.className = 'submission-form';
        this.operations = []; // Queue of operations to perform
    }

    // Helper method to add operation to queue
    addOperation(operation) {
        this.operations.push(operation);
        return this;
    }

    addField(labelText, inputType, name, options = {}) {
        return this.addOperation(() => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = labelText;
            fieldDiv.appendChild(label);

            const input = document.createElement('input');
            input.type = inputType;
            input.name = name;
            input.id = name;
            input.dataset.fieldName = name; // Add data attribute
            input.required = options.required || false;
            
            if (options.placeholder) {
                input.placeholder = options.placeholder;
            }
            if (options.className) {
                input.className = options.className;
            }

            fieldDiv.appendChild(input);
            this.form.appendChild(fieldDiv);
        });
    }

    addSubmitButton(text = 'Submit', options = {}) {
        return this.addOperation(() => {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';

            const button = document.createElement('button');
            button.type = 'submit';
            button.className = 'submit-button';
            button.textContent = text;
            buttonContainer.appendChild(button);

            // Add result containers
            const resultMessage = document.createElement('div');
            resultMessage.id = 'resultMessage';
            buttonContainer.appendChild(resultMessage);

            const resultData = document.createElement('div');
            resultData.id = 'resultData';
            buttonContainer.appendChild(resultData);

            this.form.appendChild(buttonContainer);

            let isSubmitting = false; // Flag to track submission state

            // Add submit handler
            this.form.onsubmit = async (e) => {
                e.preventDefault();
                if (isSubmitting) return;
                
                isSubmitting = true;
                button.disabled = true;
                resultMessage.textContent = 'Loading...';
                resultData.innerHTML = '';

                try {
                    const columnName = this.form.querySelector('[data-field-name="columnName"]')?.value;
                    const searchValue = this.form.querySelector('[data-field-name="searchValue"]')?.value;
                    
                    console.debug('[Form] Searching:', { columnName, searchValue });

                    const result = await GoogleSheetsAuth.getDataFromTableSearch(
                        options.spreadsheetId,
                        options.tabName,
                        columnName,
                        searchValue
                    );

                    if (!result.data.length) {
                        resultMessage.textContent = 'No matching data found';
                        return;
                    }

                    resultMessage.textContent = `Found ${result.data.length} matches:`;
                    
                    if (options.onSuccess) {
                        options.onSuccess(result, resultData);
                    } else {
                        const table = buildTable(result.data, result.headers);
                        resultData.appendChild(table);
                    }
                } catch (error) {
                    console.error('[Form] Error:', error);
                    resultMessage.textContent = error.message;
                } finally {
                    isSubmitting = false;
                    button.disabled = false;
                }
            };
        });
    }

    addDropdown(labelText, name, options = [], defaultOption = '') {
        return this.addOperation(() => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'form-group';

            const label = document.createElement('label');
            label.textContent = labelText;
            fieldDiv.appendChild(label);

            const select = document.createElement('select');
            select.name = name;
            select.id = name;
            select.dataset.fieldName = name; // Add data attribute

            if (defaultOption) {
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = defaultOption;
                select.appendChild(defaultOpt);
            }

            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select.appendChild(option);
            });

            fieldDiv.appendChild(select);
            this.form.appendChild(fieldDiv);
        });
    }

    addDropdownFromSheet(labelText, name, spreadsheetId, tabName, rowIndex, options = {}) {
        return this.addOperation(async () => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = labelText;
            fieldDiv.appendChild(label);

            const select = document.createElement('select');
            select.name = name;
            select.id = name;
            select.dataset.fieldName = name;
            select.required = options.required || false;
            select.innerHTML = '<option value="">Loading...</option>';

            try {
                const response = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: spreadsheetId,
                    range: `${tabName}!1:1`,
                    majorDimension: 'ROWS'
                });
                
                const headers = response.result.values?.[0] || [];
                select.innerHTML = '';
                
                if (options.defaultOption) {
                    const defaultOpt = document.createElement('option');
                    defaultOpt.value = '';
                    defaultOpt.textContent = options.defaultOption;
                    select.appendChild(defaultOpt);
                }

                headers.forEach(header => {
                    if (header) {
                        const option = document.createElement('option');
                        option.value = header;
                        option.textContent = header;
                        select.appendChild(option);
                    }
                });
            } catch (error) {
                console.error('Error loading headers:', error);
                select.innerHTML = '<option value="">Error loading headers</option>';
            }

            fieldDiv.appendChild(select);
            this.form.appendChild(fieldDiv);
        });
    }

    onSubmit(callback) {
        return this.addOperation(() => {
            this.form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(this.form);
                const data = Object.fromEntries(formData.entries());
                await callback(data);
            });
        });
    }

    async render() {
        try {
            for (const operation of this.operations) {
                await operation();
            }
            // Remove loading message and show form
            this.container.removeChild(this.loadingMessage);
            this.container.appendChild(this.form);
            return this;
        } catch (error) {
            this.loadingMessage.textContent = 'Error loading form';
            throw error;
        }
    }
}
