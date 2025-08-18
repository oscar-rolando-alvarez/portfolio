import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { User } from '@core/models/user.model';
import { ThemeService } from '@core/services/theme.service';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { selectCurrentUser } from '@core/store/auth/auth.selectors';
import { selectUnreadNotificationsCount } from '@core/store/notification/notification.selectors';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatBadgeModule,
    MatTooltipModule
  ],
  template: `
    <mat-toolbar color="primary" class="header-toolbar">
      @if (isHandset) {
        <button
          type="button"
          aria-label="Toggle sidenav"
          mat-icon-button
          (click)="menuToggle.emit()">
          <mat-icon aria-label="Side nav toggle icon">menu</mat-icon>
        </button>
      }
      
      <span class="app-title">{{ appTitle }}</span>
      
      <div class="header-spacer"></div>
      
      <!-- Search -->
      <button 
        mat-icon-button 
        class="header-action-btn"
        matTooltip="Search"
        aria-label="Search">
        <mat-icon>search</mat-icon>
      </button>
      
      <!-- Notifications -->
      <button 
        mat-icon-button 
        class="header-action-btn"
        [matMenuTriggerFor]="notificationMenu"
        matTooltip="Notifications"
        aria-label="Notifications">
        <mat-icon [matBadge]="unreadNotificationsCount$ | async" 
                  [matBadgeHidden]="(unreadNotificationsCount$ | async) === 0"
                  matBadgeColor="warn">
          notifications
        </mat-icon>
      </button>
      
      <!-- Theme Toggle -->
      <button 
        mat-icon-button 
        class="header-action-btn"
        (click)="toggleTheme()"
        matTooltip="Toggle theme"
        aria-label="Toggle theme">
        <mat-icon>{{ (isDarkTheme$ | async) ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>
      
      <!-- User Menu -->
      <button 
        mat-icon-button 
        class="header-action-btn"
        [matMenuTriggerFor]="userMenu"
        matTooltip="User menu"
        aria-label="User menu">
        @if (currentUser$ | async; as user) {
          @if (user.avatar) {
            <img [src]="user.avatar" [alt]="user.firstName + ' ' + user.lastName" class="user-avatar">
          } @else {
            <mat-icon>account_circle</mat-icon>
          }
        } @else {
          <mat-icon>account_circle</mat-icon>
        }
      </button>
    </mat-toolbar>

    <!-- Notification Menu -->
    <mat-menu #notificationMenu="matMenu" class="notification-menu">
      <div class="notification-header">
        <h3>Notifications</h3>
        <button mat-button color="primary" (click)="markAllAsRead()">Mark all as read</button>
      </div>
      <div class="notification-list">
        <!-- Notification items will be implemented with proper component -->
        <div class="notification-item">
          <div class="notification-content">
            <p class="notification-title">System Update</p>
            <p class="notification-message">New features are available</p>
            <span class="notification-time">2 hours ago</span>
          </div>
        </div>
      </div>
      <div class="notification-footer">
        <button mat-button routerLink="/notifications">View all notifications</button>
      </div>
    </mat-menu>

    <!-- User Menu -->
    <mat-menu #userMenu="matMenu" class="user-menu">
      @if (currentUser$ | async; as user) {
        <div class="user-info">
          <p class="user-name">{{ user.firstName }} {{ user.lastName }}</p>
          <p class="user-email">{{ user.email }}</p>
        </div>
        <mat-divider></mat-divider>
      }
      
      <button mat-menu-item routerLink="/profile">
        <mat-icon>person</mat-icon>
        <span>Profile</span>
      </button>
      
      <button mat-menu-item routerLink="/settings">
        <mat-icon>settings</mat-icon>
        <span>Settings</span>
      </button>
      
      <button mat-menu-item routerLink="/help">
        <mat-icon>help</mat-icon>
        <span>Help</span>
      </button>
      
      <mat-divider></mat-divider>
      
      <button mat-menu-item (click)="logout()">
        <mat-icon>exit_to_app</mat-icon>
        <span>Logout</span>
      </button>
    </mat-menu>
  `,
  styles: [`
    .header-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .app-title {
      font-size: 1.25rem;
      font-weight: 500;
      margin-left: 8px;
    }

    .header-spacer {
      flex: 1 1 auto;
    }

    .header-action-btn {
      margin-left: 8px;
    }

    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
    }

    .notification-menu {
      width: 320px;
      max-height: 400px;
    }

    .notification-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    }

    .notification-header h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 500;
    }

    .notification-list {
      max-height: 250px;
      overflow-y: auto;
    }

    .notification-item {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .notification-item:hover {
      background-color: rgba(0, 0, 0, 0.04);
    }

    .notification-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .notification-title {
      font-weight: 500;
      margin: 0;
      font-size: 0.9rem;
    }

    .notification-message {
      margin: 0;
      font-size: 0.8rem;
      color: rgba(0, 0, 0, 0.7);
    }

    .notification-time {
      font-size: 0.75rem;
      color: rgba(0, 0, 0, 0.5);
    }

    .notification-footer {
      padding: 8px 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.12);
      text-align: center;
    }

    .user-menu {
      width: 200px;
    }

    .user-info {
      padding: 16px;
      text-align: center;
    }

    .user-name {
      margin: 0;
      font-weight: 500;
      font-size: 1rem;
    }

    .user-email {
      margin: 4px 0 0 0;
      font-size: 0.875rem;
      color: rgba(0, 0, 0, 0.7);
    }

    :host-context(.dark-theme) {
      .notification-header,
      .notification-item:hover,
      .notification-footer {
        border-color: rgba(255, 255, 255, 0.12);
      }

      .notification-item:hover {
        background-color: rgba(255, 255, 255, 0.04);
      }

      .notification-message,
      .notification-time,
      .user-email {
        color: rgba(255, 255, 255, 0.7);
      }
    }
  `]
})
export class HeaderComponent {
  private store = inject(Store);
  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  @Input() isHandset: boolean | null = false;
  @Output() menuToggle = new EventEmitter<void>();

  appTitle = 'ERP System';
  
  currentUser$: Observable<User | null> = this.store.select(selectCurrentUser);
  unreadNotificationsCount$: Observable<number> = this.store.select(selectUnreadNotificationsCount);
  isDarkTheme$: Observable<boolean> = this.themeService.isDarkTheme$;

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  logout(): void {
    this.authService.logout();
  }
}