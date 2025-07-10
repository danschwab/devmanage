export const PacklistContent = {
    props: {
        showAlert: Function
    },
    template: `
        <div class="packlist-page">
            <h3>Pack List Management</h3>
            <p>Create and manage pack lists for exhibits and events.</p>
            <div style="margin-top: 1rem;">
                <button @click="showAlert('Create new pack list functionality coming soon!', 'Info')">Create New Pack List</button>
                <button @click="showAlert('Import from Inventor functionality coming soon!', 'Info')">Import from Inventor</button>
            </div>
        </div>
    `
};
