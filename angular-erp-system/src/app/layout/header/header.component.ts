import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';

import { NotificationService } from '@core/services/notification.service';
import { ThemeService } from '@core/services/theme.service';
import * as AuthActions from '@core/store/auth/auth.actions';
import { selectCurrentUser } from '@core/store/auth/auth.selectors';
import {
  selectAllNotifications,
  selectUnreadNotificationsCount,
} from '@core/store/notification/notification.selectors';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatBadgeModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  template: `
    <mat-toolbar class="toolbar">
      @if (isHandset()) {
        <button
          mat-icon-button
          type="button"
          aria-label="Toggle navigation"
          (click)="menuToggle.emit()"
        >
          <mat-icon>menu</mat-icon>
        </button>
      }
      <span class="title">ERP System</span>
      <span class="spacer"></span>

      <button
        mat-icon-button
        type="button"
        [matMenuTriggerFor]="notificationMenu"
        matTooltip="Notifications"
        aria-label="Notifications"
      >
        <mat-icon
          [matBadge]="unreadCount()"
          [matBadgeHidden]="unreadCount() === 0"
          matBadgeColor="warn"
        >
          notifications
        </mat-icon>
      </button>

      <button
        mat-icon-button
        type="button"
        (click)="theme.toggleTheme()"
        matTooltip="Toggle theme"
        aria-label="Toggle theme"
      >
        <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>

      <button mat-icon-button type="button" [matMenuTriggerFor]="userMenu" aria-label="User menu">
        <mat-icon>account_circle</mat-icon>
      </button>
    </mat-toolbar>

    <mat-menu #notificationMenu="matMenu" xPosition="before">
      <div class="menu-header">
        <strong>Notifications</strong>
        <button
          mat-button
          type="button"
          (click)="$event.stopPropagation(); notifications.markAllAsRead()"
        >
          Mark all read
        </button>
      </div>
      @for (n of recent(); track n.id) {
        <a mat-menu-item [routerLink]="n.actionUrl ?? null" [class.unread]="!n.isRead">
          <span class="n-title">{{ n.title }}</span>
          <span class="n-message">{{ n.message }}</span>
        </a>
      } @empty {
        <p class="empty">You're all caught up.</p>
      }
    </mat-menu>

    <mat-menu #userMenu="matMenu" xPosition="before">
      @if (user(); as u) {
        <div class="user-info">
          <strong>{{ u.firstName }} {{ u.lastName }}</strong>
          <span>{{ u.email }}</span>
        </div>
        <mat-divider />
      }
      <button mat-menu-item type="button" (click)="logout()">
        <mat-icon>logout</mat-icon>
        <span>Sign out</span>
      </button>
    </mat-menu>
  `,
  styles: `
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--mat-sys-surface-container);
    }
    .title {
      font-weight: 500;
    }
    .spacer {
      flex: 1;
    }
    .menu-header,
    .user-info {
      display: flex;
      padding: 8px 16px;
      gap: 8px;
    }
    .menu-header {
      justify-content: space-between;
      align-items: center;
      min-width: 300px;
    }
    .user-info {
      flex-direction: column;
      gap: 2px;
    }
    .user-info span,
    .n-message {
      font-size: 0.8rem;
      opacity: 0.7;
    }
    .n-title,
    .n-message {
      display: block;
      line-height: 1.3;
    }
    .unread .n-title {
      font-weight: 600;
    }
    .empty {
      padding: 0 16px;
      opacity: 0.7;
    }
  `,
})
export class HeaderComponent {
  private readonly store = inject(Store);
  protected readonly theme = inject(ThemeService);
  protected readonly notifications = inject(NotificationService);

  readonly isHandset = input(false);
  readonly menuToggle = output<void>();

  protected readonly user = this.store.selectSignal(selectCurrentUser);
  protected readonly unreadCount = this.store.selectSignal(selectUnreadNotificationsCount);
  protected readonly recent = this.store.selectSignal(selectAllNotifications);

  protected logout(): void {
    this.store.dispatch(AuthActions.logout());
  }
}
