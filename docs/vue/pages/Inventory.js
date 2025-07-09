// Inventory page component
import Container from '../components/Container.js';

export default {
    name: 'Inventory',
    components: {
        Container
    },
    template: `
        <Container header-content="<h1>Inventory</h1>">
            <div class="inventory-content">
                <p>Inventory management functionality will be implemented here.</p>
                <p>This will integrate with your existing inventory system and Google Sheets.</p>
            </div>
        </Container>
    `
};
