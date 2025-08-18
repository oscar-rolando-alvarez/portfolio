import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="not-found-container">
      <div class="not-found-content">
        <div class="error-icon">
          <mat-icon>error_outline</mat-icon>
        </div>
        
        <h1 class="error-code">404</h1>
        <h2 class="error-message">Page Not Found</h2>
        <p class="error-description">
          The page you are looking for might have been removed, renamed, or is temporarily unavailable.
        </p>
        
        <div class="action-buttons">
          <button mat-raised-button color="primary" routerLink="/dashboard">
            <mat-icon>home</mat-icon>
            Go to Dashboard
          </button>
          
          <button mat-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
            Go Back
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .not-found-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
      padding: 2rem;
    }

    .not-found-content {
      text-align: center;
      max-width: 500px;
    }

    .error-icon {
      margin-bottom: 2rem;
    }

    .error-icon mat-icon {
      font-size: 4rem;
      width: 4rem;
      height: 4rem;
      color: rgba(0, 0, 0, 0.5);
    }

    .error-code {
      font-size: 4rem;
      font-weight: 300;
      margin: 0 0 1rem 0;
      color: #1976d2;
    }

    .error-message {
      font-size: 1.5rem;
      font-weight: 400;
      margin: 0 0 1rem 0;
      color: rgba(0, 0, 0, 0.87);
    }

    .error-description {
      font-size: 1rem;
      margin: 0 0 2rem 0;
      color: rgba(0, 0, 0, 0.6);
      line-height: 1.5;
    }

    .action-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    :host-context(.dark-theme) .error-icon mat-icon {
      color: rgba(255, 255, 255, 0.5);
    }

    :host-context(.dark-theme) .error-message {
      color: rgba(255, 255, 255, 0.87);
    }

    :host-context(.dark-theme) .error-description {
      color: rgba(255, 255, 255, 0.6);
    }

    @media (max-width: 768px) {
      .not-found-container {
        padding: 1rem;
      }

      .error-code {
        font-size: 3rem;
      }

      .error-message {
        font-size: 1.25rem;
      }

      .action-buttons {
        flex-direction: column;
        align-items: center;
      }

      .action-buttons button {
        width: 200px;
      }
    }
  `]
})
export class NotFoundComponent {
  goBack(): void {
    window.history.back();
  }
}