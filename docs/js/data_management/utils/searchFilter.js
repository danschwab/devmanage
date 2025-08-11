/**
 * Filters data based on search parameters.
 * @param {Array} data - The array of objects to search within.
 * @param {Object} searchParams - An object where keys are field names and values are search terms.
 *        If the key is "$any", the value will be searched in all fields.
 * @returns {Array} - The filtered array of objects.
 */
export function searchFilter(data, searchParams) {
    if (!Array.isArray(data) || typeof searchParams !== 'object') {
        throw new Error('Invalid arguments: data must be an array and searchParams must be an object.');
    }

    return data.filter(item => {
        // If $any is present, search all keys for the value
        if (searchParams.hasOwnProperty('$any')) {
            const searchValue = String(searchParams['$any']).toLowerCase();
            return Object.values(item).some(val => String(val).toLowerCase().includes(searchValue));
        }
        // Otherwise, search by specific keys
        return Object.keys(searchParams).every(key => {
            if (!item.hasOwnProperty(key)) return false;
            const itemValue = String(item[key]).toLowerCase();
            const searchValue = String(searchParams[key]).toLowerCase();
            return itemValue.includes(searchValue);
        });
    });
}
