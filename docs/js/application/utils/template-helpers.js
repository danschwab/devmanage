/**
 * Template helper for syntax highlighting in VS Code
 * Usage: template: html`<div>Your template here</div>`
 * 
 * This function does nothing at runtime but helps VS Code extensions
 * like "ES6 String HTML" provide proper syntax highlighting.
 */
export const html = (strings, ...values) => strings.raw[0];
