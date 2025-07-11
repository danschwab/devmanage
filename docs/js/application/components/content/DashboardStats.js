import { html } from '../../utils/template-helpers.js';

export const DashboardStats = {
    template: html `
        <div class="stats-content" style="display: flex; flex-direction: column; gap: 0.5rem;">
            <div><strong>Total Items:</strong> 1,247</div>
            <div><strong>Low Stock:</strong> 12</div>
            <div><strong>Out of Stock:</strong> 3</div>
            <div><strong>Categories:</strong> 6</div>
        </div>
    `
};

// Also export as StatsContent for the new naming convention
export const StatsContent = DashboardStats;
