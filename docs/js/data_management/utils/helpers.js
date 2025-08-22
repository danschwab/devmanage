export function parseDate(val, forceLocal = true, defaultYear = null) {
    if (!val) return null;
    
    // Handle 'YYYY-MM-DD' as local date
    if (forceLocal && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const [year, month, day] = val.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
    
    if (typeof val === 'string') {
        // Handle 'M/D/YYYY' or 'M/D/YY' or 'M/D' (optionally with year)
        let mdy = val.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
        if (mdy) {
            let month = Number(mdy[1]);
            let day = Number(mdy[2]);
            let year = mdy[3] ? Number(mdy[3]) : null;
            if (year && year < 100) year += 2000; // handle 2-digit years
            if (!year && defaultYear) year = Number(defaultYear);
            if (!year) year = new Date().getFullYear();
            return new Date(year, month - 1, day, 12, 0, 0, 0);
        }
        
        // Handle 'DD-MMM' or 'D-MMM' format (e.g., '21-Jan', '3-Dec')
        let dmm = val.match(/^(\d{1,2})-([A-Za-z]{3})$/);
        if (dmm) {
            const day = Number(dmm[1]);
            const monthName = dmm[2].toLowerCase();
            const monthMap = {
                jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };
            const month = monthMap[monthName];
            if (month !== undefined) {
                const year = defaultYear ? Number(defaultYear) : new Date().getFullYear();
                return new Date(year, month, day, 12, 0, 0, 0);
            }
        }
        
        // Handle 'MMM-DD' or 'MMM-D' format (e.g., 'Jan-21', 'Dec-3')
        let mmd = val.match(/^([A-Za-z]{3})-(\d{1,2})$/);
        if (mmd) {
            const monthName = mmd[1].toLowerCase();
            const day = Number(mmd[2]);
            const monthMap = {
                jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };
            const month = monthMap[monthName];
            if (month !== undefined) {
                const year = defaultYear ? Number(defaultYear) : new Date().getFullYear();
                return new Date(year, month, day, 12, 0, 0, 0);
            }
        }
    }
    
    // Fallback to Date constructor
    const d = new Date(val);
    if (!isNaN(d)) {
        // If defaultYear is provided and year is not set, set it
        if (defaultYear && d.getFullYear() === 1970) {
            d.setFullYear(Number(defaultYear));
        }
        return d;
    }
    return null;
}