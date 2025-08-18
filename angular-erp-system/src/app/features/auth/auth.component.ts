import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <div class="auth-container">
      <div class="auth-content">
        <div class="auth-header">
          <h1>Angular ERP System</h1>
          <p>Enterprise Resource Planning Solution</p>
        </div>
        <router-outlet></router-outlet>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1976d2 0%, #42a5f5 100%);
      padding: 24px;
    }

    .auth-content {
      background: white;
      border-radius: 12px;
      padding: 48px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
      width: 100%;
      max-width: 400px;
    }

    .auth-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .auth-header h1 {
      font-size: 1.75rem;
      font-weight: 500;
      margin: 0 0 8px 0;
      color: #1976d2;
    }

    .auth-header p {
      font-size: 0.875rem;
      margin: 0;
      color: rgba(0, 0, 0, 0.6);
    }

    @media (max-width: 768px) {
      .auth-content {
        padding: 32px 24px;
      }
    }
  `]
})
export class AuthComponent {}