// Cypress E2E support file

import './commands';

// Hide fetch/XHR requests from command log
const app = window.top;
if (!app.document.head.querySelector('[data-hide-command-log-request]')) {
  const style = app.document.createElement('style');
  style.innerHTML = '.command-name-request, .command-name-xhr { display: none }';
  style.setAttribute('data-hide-command-log-request', '');
  app.document.head.appendChild(style);
}

// Global error handling
Cypress.on('uncaught:exception', (err, runnable) => {
  // Returning false here prevents Cypress from failing the test
  // You can customize this to handle specific errors
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false;
  }
  return true;
});

// Add coverage support
import '@cypress/code-coverage/support';