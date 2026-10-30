import { html } from '../../utils/template-helpers.js';
import { formatValue } from '../../utils/views/fieldFormat.js';
import { CellRenderer, DecorationCards, placeDecorations } from './cells.js';

/**
 * RowDetailsComponent — the details grid shared by the table's inline expand and RowDetailsModal.
 * Values render through the cell pipeline (§4.14), so details cells can later gain data types and
 * become editable in one place.
 *
 * Default slot: extra content after the grid (the page's #row-details).
 */
export const RowDetailsComponent = {
    name: 'RowDetailsComponent',
    components: { CellRenderer, DecorationCards },
    props: {
        row: { type: Object, required: true },
        fields: { type: Array, default: () => [] },
        highlight: { type: Function, default: null },
        skipEmpty: { type: Boolean, default: false },
        decorationsByKey: { type: Object, default: null }, // Map<key, Card[]>
        cellSlot: { type: Function, default: null },
        searchTerm: { type: String, default: '' },
        theme: { type: String, default: '' },
        withColon: { type: Boolean, default: true }
    },
    computed: {
        gridFields() {
            if (!this.skipEmpty) return this.fields;
            return this.fields.filter(f => {
                if (f.cell) return true;
                const v = this.row[f.key];
                if (v === null || v === undefined || v === '') return false;
                if (Array.isArray(v)) return v.length > 0;
                return typeof v !== 'object';
            });
        }
    },
    methods: {
        cardsFor(key) {
            return this.decorationsByKey?.get?.(key) || [];
        },
        format(value, field) {
            return formatValue(value, field);
        }
    },
    template: html`
        <div v-if="gridFields.length > 0" class="auto-details">
            <div class="details-grid">
                <div v-for="field in gridFields" :key="field.key" class="detail-item">
                    <label>{{ field.label ?? field.key }}{{ withColon ? ':' : '' }}</label>
                    <span>
                        <CellRenderer
                            :row="row"
                            :field="field"
                            renderer="details"
                            density="full"
                            :search-term="searchTerm"
                            :highlight="highlight"
                            :format="format"
                            :theme="theme"
                            :cell-slot="cellSlot"
                        />
                        <DecorationCards :cards="cardsFor(field.key)" :inline="true" />
                    </span>
                </div>
            </div>
        </div>
        <slot></slot>
    `
};

/** Renders a slot function passed through modal props (modals mount in the root app). */
const SlotOutlet = {
    name: 'SlotOutlet',
    props: { render: { type: Function, default: null }, scope: { type: Object, default: () => ({}) } },
    render() {
        return this.render ? this.render(this.scope) : null;
    }
};

/**
 * RowDetailsModal — the details action outside tables (calendar chips, cards).
 * Contents: the details grid (details fields plus the view's shown fields), then the page's
 * #row-details (passed as a function prop so slot scope and injections survive), then the
 * row-level decorations in a button bar.
 *
 * Open with: $modal.custom(RowDetailsModal, { row, fields, ..., modalClass }, title)
 */
export const RowDetailsModal = {
    name: 'RowDetailsModal',
    components: { RowDetailsComponent, DecorationCards, SlotOutlet },
    props: {
        row: { type: Object, required: true },
        fields: { type: Array, default: () => [] },
        decorations: { type: Function, default: null },
        decorationKeys: { type: Array, default: () => [] },
        rowDetails: { type: Function, default: null },
        cellSlot: { type: Function, default: null },
        searchTerm: { type: String, default: '' },
        highlight: { type: Function, default: null },
        theme: { type: String, default: '' }
    },
    emits: ['close-modal'],
    computed: {
        displayedKeys() {
            const keys = new Set();
            for (const f of this.fields) {
                const v = this.row[f.key];
                const hasValue = f.cell || (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0) && (typeof v !== 'object' || Array.isArray(v)));
                if (hasValue) keys.add(f.key);
            }
            return keys;
        },
        placed() {
            return placeDecorations(this.decorations, this.decorationKeys, this.row, this.displayedKeys);
        }
    },
    template: html`
        <div class="row-details-modal">
            <RowDetailsComponent
                :row="row"
                :fields="fields"
                :skip-empty="true"
                :decorations-by-key="placed.byKey"
                :cell-slot="cellSlot"
                :search-term="searchTerm"
                :highlight="highlight"
                :theme="theme"
                :with-colon="false"
            >
                <SlotOutlet v-if="rowDetails" :render="rowDetails" :scope="{ row, rowIndex: null, isExpanded: true, detailsColumns: fields }" />
            </RowDetailsComponent>
            <div v-if="placed.rowLevel.length > 0" class="button-bar">
                <DecorationCards :cards="placed.rowLevel" />
            </div>
        </div>
    `
};
