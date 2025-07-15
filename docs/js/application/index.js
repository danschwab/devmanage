// Utils
export { html } from './utils/template-helpers.js';
export { Auth, authState, useAuth } from './utils/auth.js';

// Navigation components
export { BreadcrumbComponent } from './components/navigation/breadcrumbComponent.js';
export { PrimaryNavComponent, NavigationConfig } from './components/navigation/navigationManagement.js';

// Dashboard components export
export { DashboardManagement, DashboardToggleComponent, DashboardManagementComponent, DashboardSettings } from './components/dashboard/DashboardManagement.js';
export { hamburgerMenuRegistry } from './components/dashboard/HamburgerMenuRegistry.js';

// Interface components export
export { ContainerComponent, containerManager } from './components/interface/containerComponent.js';
export { ModalComponent, modalManager } from './components/interface/modalComponent.js';
export { TableComponent } from './components/interface/tableComponent.js';

// Content components export
export { TestTableComponent } from './components/content/testTableComponent.js';
export { PacklistContent } from './components/content/PacklistContent.js';
export { InventoryContent } from './components/content/InventoryContent.js';
export { InterfacesContent } from './components/content/InterfacesContent.js';

// API
export { Requests } from '../data_management/api.js';