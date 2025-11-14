/**
 * Simple SQL-like query parser and executor for Google Sheets data
 */
export class SheetSql {
    /**
     * Parse a simplified SQL-like query for sheet data
     * @param {string} query - SQL-like query string
     * @returns {Object} Parsed query components
     */
    static parseQuery(query) {
        // Normalize the query
        query = query.trim().replace(/\s+/g, ' ');
        
        const result = {
            select: [],
            from: null,
            where: [],
            orderBy: [],
            limit: null
        };
        
        // Extract SELECT clause
        const selectMatch = query.match(/SELECT\s+(.*?)\s+FROM/i);
        if (selectMatch) {
            const selectClause = selectMatch[1].trim();
            if (selectClause === '*') {
                result.select = ['*'];
            } else {
                result.select = selectClause.split(',').map(col => col.trim());
            }
        }
        
        // Extract FROM clause
        const fromMatch = query.match(/FROM\s+(.*?)(?:\s+WHERE|\s+ORDER BY|\s+LIMIT|\s*$)/i);
        if (fromMatch) {
            result.from = fromMatch[1].trim();
        }
        
        // Extract WHERE clause
        const whereMatch = query.match(/WHERE\s+(.*?)(?:\s+ORDER BY|\s+LIMIT|\s*$)/i);
        if (whereMatch) {
            const whereClause = whereMatch[1].trim();
            // Split by AND (simple implementation)
            const conditions = whereClause.split(/\s+AND\s+/i);
            result.where = conditions.map(condition => {
                // Parse each condition (column operator value)
                const match = condition.match(/([^\s<>=!]+)\s*([<>=!]{1,2})\s*(.+)/);
                if (match) {
                    let [_, column, operator, value] = match;
                    
                    // Handle quoted strings
                    if (value.startsWith("'") && value.endsWith("'")) {
                        value = value.slice(1, -1);
                    } else if (value.startsWith('"') && value.endsWith('"')) {
                        value = value.slice(1, -1);
                    } else if (!isNaN(Number(value))) {
                        value = Number(value);
                    }
                    
                    return { column, operator, value };
                }
                return null;
            }).filter(Boolean);
        }
        
        // Extract ORDER BY clause
        const orderByMatch = query.match(/ORDER BY\s+(.*?)(?:\s+LIMIT|\s*$)/i);
        if (orderByMatch) {
            const orderByClause = orderByMatch[1].trim();
            result.orderBy = orderByClause.split(',').map(item => {
                const parts = item.trim().split(/\s+/);
                return {
                    column: parts[0],
                    direction: parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
                };
            });
        }
        
        // Extract LIMIT clause
        const limitMatch = query.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
            result.limit = parseInt(limitMatch[1], 10);
        }
        
        return result;
    }
    
    /**
     * Execute a parsed query against sheet data
     * @param {Object} parsedQuery - Parsed query object
     * @param {Array<Array>} data - Sheet data as 2D array
     * @returns {Array<Object>} Query results as array of objects
     */
    static executeQuery(parsedQuery, data) {
        if (!data || data.length < 1) {
            return [];
        }
        
        // Extract headers from first row
        const headers = data[0];
        
        // Convert 2D array to array of objects with column names
        let rows = data.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, i) => {
                obj[header] = row[i];
            });
            return obj;
        });
        
        // Apply WHERE conditions
        if (parsedQuery.where.length > 0) {
            rows = rows.filter(row => {
                return parsedQuery.where.every(condition => {
                    const { column, operator, value } = condition;
                    const cellValue = row[column];
                    
                    switch (operator) {
                        case '=': 
                            return cellValue == value;
                        case '==': 
                            return cellValue == value;
                        case '!=': 
                            return cellValue != value;
                        case '<': 
                            return cellValue < value;
                        case '<=': 
                            return cellValue <= value;
                        case '>': 
                            return cellValue > value;
                        case '>=': 
                            return cellValue >= value;
                        case 'LIKE':
                        case 'like':
                            if (typeof cellValue !== 'string') return false;
                            const regex = new RegExp(value.replace(/%/g, '.*'), 'i');
                            return regex.test(cellValue);
                        default:
                            return false;
                    }
                });
            });
        }
        
        // Apply ORDER BY
        if (parsedQuery.orderBy.length > 0) {
            rows.sort((a, b) => {
                for (const sort of parsedQuery.orderBy) {
                    const { column, direction } = sort;
                    const valueA = a[column];
                    const valueB = b[column];
                    
                    // Handle different value types
                    let comparison;
                    if (typeof valueA === 'number' && typeof valueB === 'number') {
                        comparison = valueA - valueB;
                    } else {
                        const strA = String(valueA || '');
                        const strB = String(valueB || '');
                        comparison = strA.localeCompare(strB);
                    }
                    
                    if (comparison !== 0) {
                        return direction === 'DESC' ? -comparison : comparison;
                    }
                }
                return 0;
            });
        }
        
        // Apply LIMIT
        if (parsedQuery.limit !== null) {
            rows = rows.slice(0, parsedQuery.limit);
        }
        
        // Project selected columns
        if (parsedQuery.select[0] !== '*') {
            rows = rows.map(row => {
                const result = {};
                parsedQuery.select.forEach(column => {
                    result[column] = row[column];
                });
                return result;
            });
        }
        
        return rows;
    }
}
