import { html } from '../../index.js';

export const TableComponent = {
    props: {
        data: {
            type: Array,
            default: () => []
        },
        columns: {
            type: Array,
            required: true
        },
        isLoading: {
            type: Boolean,
            default: false
        },
        error: {
            type: String,
            default: null
        },
        title: {
            type: String,
            default: 'Data Table'
        },
        showRefresh: {
            type: Boolean,
            default: true
        },
        emptyMessage: {
            type: String,
            default: 'No data available'
        }
    },
    emits: ['refresh', 'cell-edit', 'row-move'],
    methods: {
        handleRefresh() {
            this.$emit('refresh');
        },
        
        formatCellValue(value, column) {
            if (value === null || value === undefined) return '';
            
            // Apply column-specific formatting
            if (column.format) {
                switch (column.format) {
                    case 'currency':
                        return `$${parseFloat(value).toFixed(2)}`;
                    case 'date':
                        return new Date(value).toLocaleDateString();
                    case 'number':
                        return parseFloat(value).toLocaleString();
                    case 'percentage':
                        return `${parseFloat(value).toFixed(1)}%`;
                    default:
                        return value;
                }
            }
            
            return value;
        },
        
        getCellClass(value, column) {
            if (!column.cellClass) return '';
            
            // Support function-based cell classes
            if (typeof column.cellClass === 'function') {
                return column.cellClass(value);
            }
            
            // Support object-based cell classes
            if (typeof column.cellClass === 'object') {
                for (const [className, condition] of Object.entries(column.cellClass)) {
                    if (typeof condition === 'function' && condition(value)) {
                        return className;
                    }
                    if (value === condition) {
                        return className;
                    }
                }
            }
            
            return column.cellClass;
        },
        
        getColumnWidth(column) {
            return column.width ? `${column.width}px` : 'auto';
        },
        handleCellEdit(rowIndex, colIndex, value) {
            this.$emit('cell-edit', rowIndex, colIndex, value);
        },
        handleRowMove() {
            this.$emit('row-move');
        }
    },
    template: html `
        <div class="dynamic-table">
            <div class="content-header" v-if="title || showRefresh">
                <h3 v-if="title">{{ title }}</h3>
                <button 
                    v-if="showRefresh" 
                    @click="handleRefresh" 
                    :disabled="isLoading" 
                    class="refresh-button"
                >
                    {{ isLoading ? 'Loading...' : 'Refresh' }}
                </button>
            </div>
            
            <!-- Loading State -->
            <div v-if="isLoading" class="loading-message">
                <p>Loading data...</p>
            </div>
            
            <!-- Error State -->
            <div v-else-if="error" class="error-message">
                <p>Error: {{ error }}</p>
                <button v-if="showRefresh" @click="handleRefresh">Try Again</button>
            </div>
            
            <!-- Empty State -->
            <div v-else-if="!data || data.length === 0" class="empty-message">
                <p>{{ emptyMessage }}</p>
            </div>
            
            <!-- Data Table -->
            <div v-else class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th 
                                v-for="(column, colIdx) in columns" 
                                :key="column.key"
                                :style="{ width: getColumnWidth(column) }"
                                :class="column.headerClass"
                            >
                                {{ column.label }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(row, rowIndex) in data" :key="rowIndex">
                            <td 
                                v-for="(column, colIndex) in columns" 
                                :key="column.key"
                                :class="getCellClass(row[column.key], column)"
                            >
                                <div v-if="column.editable">
                                    <div
                                        contenteditable="true"
                                        :data-row-index="rowIndex"
                                        :data-col-index="colIndex"
                                        @input="handleCellEdit(rowIndex, colIndex, $event.target.textContent)"
                                        class="table-edit-textarea"
                                    >{{ row[column.key] }}</div>
                                </div>
                                <div v-else>
                                    <slot :row="row" :rowIndex="rowIndex" :column="column">
                                        {{ formatCellValue(row[column.key], column) }}
                                    </slot>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <!-- Data Summary -->
            <div v-if="data && data.length > 0" class="content-footer">
                <p>Showing {{ data.length }} item{{ data.length !== 1 ? 's' : '' }}</p>
            </div>
        </div>
    `
};

export default TableComponent;