describe('Angular ERP System', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should redirect to login page', () => {
    cy.url().should('include', '/auth/login');
  });

  it('should display login form', () => {
    cy.visit('/auth/login');
    cy.get('[data-cy=login-form]').should('be.visible');
    cy.get('[data-cy=email-input]').should('be.visible');
    cy.get('[data-cy=password-input]').should('be.visible');
    cy.get('[data-cy=login-button]').should('be.visible');
  });

  it('should show validation errors for invalid input', () => {
    cy.visit('/auth/login');
    cy.get('[data-cy=login-button]').click();
    cy.get('mat-error').should('be.visible');
  });

  it('should navigate to dashboard after successful login', () => {
    cy.visit('/auth/login');
    cy.get('[data-cy=email-input]').type('admin@example.com');
    cy.get('[data-cy=password-input]').type('password123');
    cy.get('[data-cy=login-button]').click();
    
    // Mock successful login response
    cy.intercept('POST', '**/api/v1/auth/login', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          user: {
            id: '1',
            email: 'admin@example.com',
            firstName: 'Admin',
            lastName: 'User',
            roles: [{ name: 'admin' }],
            permissions: []
          },
          token: 'mock-jwt-token'
        }
      }
    });
    
    cy.url().should('include', '/dashboard');
  });

  it('should display navigation menu when authenticated', () => {
    // Mock authenticated state
    cy.window().then((win) => {
      win.localStorage.setItem('token', 'mock-jwt-token');
      win.localStorage.setItem('user', JSON.stringify({
        id: '1',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        roles: [{ name: 'admin' }],
        permissions: []
      }));
    });
    
    cy.visit('/dashboard');
    cy.get('[data-cy=sidenav]').should('be.visible');
    cy.get('[data-cy=header]').should('be.visible');
  });

  it('should toggle theme', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('token', 'mock-jwt-token');
    });
    
    cy.visit('/dashboard');
    cy.get('[data-cy=theme-toggle]').click();
    cy.get('body').should('have.class', 'dark-theme');
  });

  it('should navigate between modules', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('token', 'mock-jwt-token');
    });
    
    cy.visit('/dashboard');
    cy.get('[data-cy=nav-hr]').click();
    cy.url().should('include', '/hr');
  });
});