import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule
  ],
  template: `
    <footer class="app-footer">
      <div class="footer-content">
        <div class="footer-section">
          <span class="footer-text">© 2024 Angular ERP System. All rights reserved.</span>
        </div>
        
        <div class="footer-section footer-links">
          <a routerLink="/help" class="footer-link">Help</a>
          <a routerLink="/privacy" class="footer-link">Privacy</a>
          <a routerLink="/terms" class="footer-link">Terms</a>
          <a href="mailto:support@company.com" class="footer-link">Support</a>
        </div>
        
        <div class="footer-section">
          <span class="footer-text">Version 1.0.0</span>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .app-footer {
      background: white;
      border-top: 1px solid rgba(0, 0, 0, 0.12);
      padding: 12px 0;
      min-height: 60px;
      display: flex;
      align-items: center;
    }

    :host-context(.dark-theme) .app-footer {
      background: #424242;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
    }

    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }

    .footer-section {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .footer-text {
      font-size: 0.875rem;
      color: rgba(0, 0, 0, 0.6);
    }

    :host-context(.dark-theme) .footer-text {
      color: rgba(255, 255, 255, 0.6);
    }

    .footer-links {
      gap: 24px;
    }

    .footer-link {
      font-size: 0.875rem;
      color: rgba(0, 0, 0, 0.6);
      text-decoration: none;
      transition: color 0.2s;
    }

    .footer-link:hover {
      color: #1976d2;
      text-decoration: underline;
    }

    :host-context(.dark-theme) .footer-link {
      color: rgba(255, 255, 255, 0.6);
    }

    :host-context(.dark-theme) .footer-link:hover {
      color: #64b5f6;
    }

    @media (max-width: 768px) {
      .footer-content {
        flex-direction: column;
        gap: 8px;
        padding: 0 16px;
      }

      .footer-section {
        justify-content: center;
      }

      .footer-links {
        gap: 16px;
      }
    }
  `]
})
export class FooterComponent {
}