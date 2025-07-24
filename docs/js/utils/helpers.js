export function parseDate(val, forceLocal = true) {
    if (!val) return null;
    if (forceLocal && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        // Parse as local date: 'YYYY-MM-DD'
        // Use split and Date(year, monthIndex, day) to avoid timezone offset
        const [year, month, day] = val.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0, 0); // noon local time to avoid DST issues
    }
    const d = new Date(val);
    return isNaN(d) ? null : d;
}

/**
 * Transforms raw sheet data to structured objects using a mapping.
 * @param {Array<Array>} rawData - 2D array from sheet (first row is headers)
 * @param {Object} mapping - { key: header }
 * @param {Array} [headersOverride] - Optional headers to use instead of first row
 * @returns {Array<Object>} Array of mapped objects
 */
export function transformSheetData(rawData, mapping, headersOverride = null) {
    if (!rawData || rawData.length < 2 || !mapping) return [];
    const headers = headersOverride || rawData[0];
    const rows = rawData.slice(1);
    const headerIdxMap = {};
    Object.entries(mapping).forEach(([key, headerName]) => {
        const idx = headers.findIndex(h => h.trim() === headerName);
        if (idx !== -1) headerIdxMap[key] = idx;
    });
    return rows.map(row => {
        const obj = {};
        Object.keys(mapping).forEach(key => {
            obj[key] = row[headerIdxMap[key]] ?? '';
        });
        return obj;
    }).filter(obj => Object.values(obj).some(val => val !== ''));
}

/**
 * Reverse transforms mapped data and merges with unmapped columns from the original sheet.
 * Only mapped columns are updated; unmapped columns remain unchanged.
 * @param {Array<Array>} originalData - 2D array from sheet (first row is headers)
 * @param {Object} mapping - { key: header }
 * @param {Array<Object>} mappedData - Array of mapped objects
 * @returns {Array<Array>} 2D array with all columns preserved
 */
export function reverseTransformSheetData(originalData, mapping, mappedData) {
    if (!originalData || originalData.length < 2) return [];
    const headers = originalData[0];
    const keyToHeader = mapping;
    const headerToKey = {};
    Object.entries(keyToHeader).forEach(([key, header]) => {
        headerToKey[header] = key;
    });
    const uniqueKey = Object.keys(mapping)[0];
    const mappedIndex = {};
    mappedData.forEach(obj => {
        mappedIndex[obj[uniqueKey]] = obj;
    });
    const rows = originalData.slice(1).map(row => {
        const keyIdx = headers.findIndex(h => h.trim() === mapping[uniqueKey]);
        const keyValue = row[keyIdx];
        const mappedObj = mappedIndex[keyValue];
        if (mappedObj) {
            return headers.map((header, colIdx) => {
                const key = headerToKey[header.trim()];
                return key && mappedObj.hasOwnProperty(key) ? mappedObj[key] : row[colIdx];
            });
        } else {
            return row;
        }
    });
    return [headers, ...rows];
}