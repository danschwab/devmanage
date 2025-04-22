import { GoogleSheetsService } from '../index.js';
import { buildTable } from '../index.js';

export class FormBuilder {
    constructor(containerId, resultContainerId) {
        this.container = document.getElementById(containerId);
        this.resultContainer = document.getElementById(resultContainerId);
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

            // Create result message div
            const resultMessage = document.createElement('div');
            resultMessage.id = 'resultMessage';
            this.resultContainer.appendChild(resultMessage);

            // Create result data div
            const resultData = document.createElement('div');
            resultData.id = 'resultData';
            this.resultContainer.appendChild(resultData);

            // Add save button if editColumns are specified
            let saveButton;
            if (options.editColumns?.length > 0) {
                const tableId = `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                saveButton = document.createElement('button');
                saveButton.type = 'button';
                saveButton.className = 'save-button';
                saveButton.textContent = 'Save Changes';
                saveButton.disabled = true;
                saveButton.style.marginRight = '10px';
                saveButton.dataset.tableId = tableId;
                buttonContainer.appendChild(saveButton);
            }

            const button = document.createElement('button');
            button.type = 'submit';
            button.className = 'submit-button';
            button.textContent = text;
            buttonContainer.appendChild(button);

            this.form.appendChild(buttonContainer);

            let isSubmitting = false;

            this.form.onsubmit = async (e) => {
                e.preventDefault();
                if (isSubmitting) return;
                
                isSubmitting = true;
                button.disabled = true;
                resultMessage.textContent = 'Loading...';
                resultData.innerHTML = '';

                try {
                    const formData = new FormData(this.form);
                    const searchData = Object.fromEntries(formData.entries());
                    
                    const result = await GoogleSheetsService.searchTable(
                        options.spreadsheetId,
                        options.tabName,
                        searchData.columnName,
                        searchData.searchValue
                    );

                    if (!result || !result.data || !result.data.length) {
                        resultMessage.textContent = 'No matching data found';
                        return;
                    }

                    resultMessage.textContent = `Found ${result.data.length} matches:`;
                    
                    const table = buildTable(
                        result.data, 
                        result.headers, 
                        [], 
                        options.editColumns
                    );

                    if (saveButton) {
                        table.id = saveButton.dataset.tableId;
                        this.setupTableSaveHandler(table, saveButton, options);
                    }

                    resultData.innerHTML = '';
                    resultData.appendChild(table);

                } catch (error) {
                    console.error('Submit error:', error);
                    resultMessage.textContent = `Error: ${error.message}`;
                } finally {
                    isSubmitting = false;
                    button.disabled = false;
                }
            };
        });
    }

    setupTableSaveHandler(table, saveButton, options) {
        const checkDirtyState = () => {
            const dirtyInputs = table.querySelectorAll('input[data-dirty="true"]');
            saveButton.disabled = dirtyInputs.length === 0;
        };

        saveButton.onclick = async () => {
            const dirtyInputs = table.querySelectorAll('input[data-dirty="true"]');
            if (!dirtyInputs.length) return;

            try {
                saveButton.disabled = true;
                const updates = Array.from(dirtyInputs).map(input => ({
                    row: parseInt(input.dataset.rowIndex) + 1,
                    col: parseInt(input.dataset.colIndex),
                    value: input.value
                }));

                await GoogleSheetsService.setSheetData(
                    options.spreadsheetId,
                    options.tabName,
                    updates
                );

                dirtyInputs.forEach(input => {
                    input.dataset.originalValue = input.value;
                    input.dataset.dirty = 'false';
                });

                const resultMessage = document.getElementById('resultMessage');
                resultMessage.textContent = 'Changes saved successfully';
            } catch (error) {
                console.error('Save error:', error);
                const resultMessage = document.getElementById('resultMessage');
                resultMessage.textContent = `Error saving changes: ${error.message}`;
            } finally {
                checkDirtyState();
            }
        };

        // Set up mutation observer for dirty state tracking
        const observer = new MutationObserver(checkDirtyState);
        observer.observe(table, {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-dirty']
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
                const headers = await GoogleSheetsService.getTableHeaders(spreadsheetId, tabName);
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