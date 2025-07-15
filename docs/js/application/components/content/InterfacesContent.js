import { html, TestTableComponent } from '../../index.js';

export const InterfacesContent = {
    components: {
        'test-table': TestTableComponent
    },
    template: html`
        <div class="interfaces-page">
            <h3>Interface Testing</h3>
            <p>Test various UI components and data interfaces.</p>
            <test-table></test-table>
        </div>
    `
};
