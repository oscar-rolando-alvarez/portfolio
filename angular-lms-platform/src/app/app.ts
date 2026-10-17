import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthStore } from '@core/auth.store';
import { ThemeService } from '@core/theme.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <mat-toolbar class="toolbar">
      <a routerLink="/" class="brand" aria-label="LMS home">
        <mat-icon>school</mat-icon>
        <span>LearnHub</span>
      </a>
      <nav class="nav" aria-label="Primary">
        <a
          mat-button
          routerLink="/"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Catalog</a
        >
        @if (auth.isSignedIn()) {
          <a mat-button routerLink="/my-learning" routerLinkActive="active">My learning</a>
        }
      </nav>
      <span class="spacer"></span>
      <button
        mat-icon-button
        type="button"
        (click)="theme.toggle()"
        [matTooltip]="theme.isDark() ? 'Light mode' : 'Dark mode'"
        aria-label="Toggle dark mode"
      >
        <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>
      @if (auth.learner(); as learner) {
        <button mat-icon-button type="button" [matMenuTriggerFor]="account" aria-label="Account">
          <span class="avatar" aria-hidden="true">{{ auth.initials() }}</span>
        </button>
        <mat-menu #account="matMenu" xPosition="before">
          <div class="account">
            <strong>{{ learner.name }}</strong>
            <span>{{ learner.email }}</span>
          </div>
          <button mat-menu-item type="button" (click)="signOut()">
            <mat-icon>logout</mat-icon>
            <span>Sign out</span>
          </button>
        </mat-menu>
      } @else {
        <a mat-flat-button routerLink="/sign-in">Sign in</a>
      }
    </mat-toolbar>

    <main id="main" class="content">
      <router-outlet />
    </main>
  `,
  styles: `
    .skip-link {
      position: absolute;
      left: -9999px;
    }
    .skip-link:focus {
      left: 16px;
      top: 8px;
      z-index: 100;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      gap: 8px;
      background: var(--mat-sys-surface-container);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
      text-decoration: none;
      font-weight: 600;
      margin-right: 16px;
    }
    .nav .active {
      background: var(--mat-sys-secondary-container);
    }
    .spacer {
      flex: 1;
    }
    .avatar {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font: var(--mat-sys-label-large);
    }
    .account {
      display: flex;
      flex-direction: column;
      padding: 8px 16px;
    }
    .account span {
      font-size: 0.8rem;
      opacity: 0.7;
    }
    .content {
      max-width: 1120px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }
    @media (max-width: 600px) {
      .nav {
        display: none;
      }
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthStore);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.auth.signOut();
    void this.router.navigateByUrl('/');
  }
}
