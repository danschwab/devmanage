// The one place that picks the Google services: the fakes on localhost (FakeGoogle.js), the real
// ones elsewhere. Database and ApplicationUtils use the services. The application layer uses only
// the sign-in session (GoogleSheetsAuth, re-exported by application/utils/auth.js).
import { isLocalhost } from './utils/helpers.js';

if (isLocalhost()) console.warn('Running locally, using fake Google services.');
// eslint-disable-next-line no-undef
const services = isLocalhost()
    ? await import('../google_sheets_services/FakeGoogle.js')
    : await import('../google_sheets_services/index.js');

export const { GoogleSheetsService, GoogleSheetsAuth } = services;
export { AUTH_STATUS, classifyError, isAuthError } from '../google_sheets_services/authStatus.js';
