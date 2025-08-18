// Custom Cypress commands

declare global {
  namespace Cypress {
    interface Chainable {
      login(email?: string, password?: string): Chainable<void>;
      logout(): Chainable<void>;
      mockApiCall(method: string, url: string, response: any): Chainable<void>;
      setAuthToken(token: string): Chainable<void>;
      clearStorage(): Chainable<void>;
    }
  }
}

// Login command
Cypress.Commands.add('login', (email = 'admin@example.com', password = 'password123') => {
  cy.visit('/auth/login');
  cy.get('[data-cy=email-input]').type(email);
  cy.get('[data-cy=password-input]').type(password);
  cy.get('[data-cy=login-button]').click();
});

// Logout command
Cypress.Commands.add('logout', () => {
  cy.get('[data-cy=user-menu]').click();
  cy.get('[data-cy=logout-button]').click();
});

// Mock API call
Cypress.Commands.add('mockApiCall', (method: string, url: string, response: any) => {
  cy.intercept(method, url, response);
});

// Set authentication token
Cypress.Commands.add('setAuthToken', (token: string) => {
  cy.window().then((win) => {
    win.localStorage.setItem('token', token);
    win.localStorage.setItem('user', JSON.stringify({
      id: '1',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      roles: [{ name: 'admin' }],
      permissions: []
    }));
  });
});

// Clear storage
Cypress.Commands.add('clearStorage', () => {
  cy.window().then((win) => {
    win.localStorage.clear();
    win.sessionStorage.clear();
  });
});