export function buildTable(data, headers, readOnlyColumns = [], editableColumns = []) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    
    const table = document.createElement('table');
    
    // Create table headers
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create table body
    const tbody = document.createElement('tbody');
    data.forEach(row => {
        const tr = document.createElement('tr');
        headers.forEach((header, index) => {
            const td = document.createElement('td');
            if (readOnlyColumns.includes(index)) {
                td.textContent = row[header];
            } else if (editableColumns.includes(index)) {
                const input = document.createElement('input');
                input.type = 'text';
                input.value = row[header];
                td.appendChild(input);
            } else {
                td.textContent = row[header];
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrapper.appendChild(table);
    return wrapper;
}