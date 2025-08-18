import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Store } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';

import { AuthUser } from '../../../../core/models/user.model';
import { AppState } from '../../../../core/store/app.state';
import { AuthActions } from '../../../../core/store/auth/auth.actions';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatBadgeModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatChipsModule
  ],
  template: `
    <mat-toolbar class="header-toolbar" color="primary">
      <!-- Left section: Menu toggle and Logo -->
      <div class="header-left">
        <button
          *ngIf="isHandset"
          mat-icon-button
          class="menu-toggle"
          (click)="toggleSidenav.emit()"
          [attr.aria-label]="'HEADER.TOGGLE_MENU' | translate"
          matTooltip="{{ 'HEADER.TOGGLE_MENU' | translate }}">
          <mat-icon>menu</mat-icon>
        </button>

        <a 
          routerLink="/" 
          class="logo-link"
          [attr.aria-label]="'HEADER.HOME' | translate">
          <img 
            src="/assets/images/logo.svg" 
            alt="EduPlatform Logo" 
            class="logo"
            height="32">
          <span class="logo-text">EduPlatform</span>
        </a>
      </div>

      <!-- Center section: Search (desktop only) -->
      <div class="header-center" *ngIf="!isHandset">
        <mat-form-field class="search-field" appearance="outline">
          <mat-icon matPrefix>search</mat-icon>
          <input 
            matInput 
            [formControl]="searchControl"
            [placeholder]="'HEADER.SEARCH_PLACEHOLDER' | translate"
            [attr.aria-label]="'HEADER.SEARCH' | translate"
            autocomplete="off">
          <mat-autocomplete #auto="matAutocomplete">
            <mat-option 
              *ngFor="let suggestion of searchSuggestions()" 
              [value]="suggestion.title"
              (onSelectionChange)="onSearchSelect(suggestion)">
              <mat-icon class="suggestion-icon">{{ suggestion.icon }}</mat-icon>
              <span class="suggestion-title">{{ suggestion.title }}</span>
              <span class="suggestion-type">{{ suggestion.type }}</span>
            </mat-option>
          </mat-autocomplete>
        </mat-form-field>
      </div>

      <!-- Right section: Actions and User menu -->
      <div class="header-right">
        <!-- Search button (mobile only) -->
        <button
          *ngIf="isHandset"
          mat-icon-button
          class="search-toggle"
          (click)="toggleMobileSearch()"
          [attr.aria-label]="'HEADER.SEARCH' | translate"
          matTooltip="{{ 'HEADER.SEARCH' | translate }}">
          <mat-icon>search</mat-icon>
        </button>

        <!-- Theme toggle -->
        <button
          mat-icon-button
          class="theme-toggle"
          (click)="toggleTheme.emit()"
          [attr.aria-label]="'HEADER.TOGGLE_THEME' | translate"
          matTooltip="{{ 'HEADER.TOGGLE_THEME' | translate }}">
          <mat-icon>{{ isDarkTheme() ? 'light_mode' : 'dark_mode' }}</mat-icon>
        </button>

        <!-- Notifications -->
        <button
          *ngIf="isAuthenticated"
          mat-icon-button
          class="notifications-btn"
          [routerLink]="['/notifications']"
          [attr.aria-label]="'HEADER.NOTIFICATIONS' | translate"
          matTooltip="{{ 'HEADER.NOTIFICATIONS' | translate }}">
          <mat-icon [matBadge]="notificationCount()" matBadgeColor="warn">notifications</mat-icon>
        </button>

        <!-- Messages -->
        <button
          *ngIf="isAuthenticated"
          mat-icon-button
          class="messages-btn"
          [routerLink]="['/messages']"
          [attr.aria-label]="'HEADER.MESSAGES' | translate"
          matTooltip="{{ 'HEADER.MESSAGES' | translate }}">
          <mat-icon [matBadge]="messageCount()" matBadgeColor="accent">message</mat-icon>
        </button>

        <!-- Language selector -->
        <button
          mat-icon-button
          [matMenuTriggerFor]="languageMenu"
          [attr.aria-label]="'HEADER.LANGUAGE' | translate"
          matTooltip="{{ 'HEADER.LANGUAGE' | translate }}">
          <mat-icon>translate</mat-icon>
        </button>

        <!-- User menu or Login button -->
        <ng-container *ngIf="isAuthenticated; else loginButton">
          <button
            mat-icon-button
            [matMenuTriggerFor]="userMenu"
            class="user-menu-trigger"
            [attr.aria-label]="'HEADER.USER_MENU' | translate">
            <img
              *ngIf="currentUser?.profile?.avatar; else defaultAvatar"
              [src]="currentUser.profile.avatar"
              [alt]="getUserDisplayName()"
              class="user-avatar">
            <ng-template #defaultAvatar>
              <div class="user-avatar default-avatar">
                {{ getUserInitials() }}
              </div>
            </ng-template>
          </button>
        </ng-container>

        <ng-template #loginButton>
          <button
            mat-button
            routerLink="/auth/login"
            class="login-btn">
            {{ 'HEADER.LOGIN' | translate }}
          </button>
        </ng-template>
      </div>
    </mat-toolbar>

    <!-- Mobile search overlay -->
    <div class="mobile-search-overlay" *ngIf="showMobileSearch()" (click)="closeMobileSearch()">
      <div class="mobile-search-container" (click)="$event.stopPropagation()">
        <mat-form-field class="mobile-search-field" appearance="outline">
          <mat-icon matPrefix>search</mat-icon>
          <input 
            matInput 
            [formControl]="searchControl"
            [placeholder]="'HEADER.SEARCH_PLACEHOLDER' | translate"
            autocomplete="off"
            #mobileSearchInput>
          <button mat-icon-button matSuffix (click)="closeMobileSearch()">
            <mat-icon>close</mat-icon>
          </button>
        </mat-form-field>
      </div>
    </div>

    <!-- Language menu -->
    <mat-menu #languageMenu="matMenu">
      <button 
        mat-menu-item 
        *ngFor="let lang of availableLanguages" 
        (click)="changeLanguage.emit(lang.code)">
        <mat-icon>{{ lang.icon }}</mat-icon>
        <span>{{ lang.name }}</span>
      </button>
    </mat-menu>

    <!-- User menu -->
    <mat-menu #userMenu="matMenu" class="user-menu">
      <div class="user-menu-header">
        <img
          *ngIf="currentUser?.profile?.avatar; else defaultAvatarMenu"
          [src]="currentUser.profile.avatar"
          [alt]="getUserDisplayName()"
          class="user-menu-avatar">
        <ng-template #defaultAvatarMenu>
          <div class="user-menu-avatar default-avatar">
            {{ getUserInitials() }}
          </div>
        </ng-template>
        <div class="user-menu-info">
          <div class="user-name">{{ getUserDisplayName() }}</div>
          <div class="user-email">{{ currentUser?.profile?.email }}</div>
          <div class="user-role">{{ currentUser?.role | titlecase }}</div>
        </div>
      </div>

      <mat-divider></mat-divider>

      <button mat-menu-item routerLink="/dashboard">
        <mat-icon>dashboard</mat-icon>
        <span>{{ 'HEADER.DASHBOARD' | translate }}</span>
      </button>

      <button mat-menu-item routerLink="/profile">
        <mat-icon>person</mat-icon>
        <span>{{ 'HEADER.PROFILE' | translate }}</span>
      </button>

      <button mat-menu-item routerLink="/courses/my-courses">
        <mat-icon>school</mat-icon>
        <span>{{ 'HEADER.MY_COURSES' | translate }}</span>
      </button>

      <button mat-menu-item routerLink="/progress">
        <mat-icon>analytics</mat-icon>
        <span>{{ 'HEADER.PROGRESS' | translate }}</span>
      </button>

      <button mat-menu-item routerLink="/profile/settings">
        <mat-icon>settings</mat-icon>
        <span>{{ 'HEADER.SETTINGS' | translate }}</span>
      </button>

      <mat-divider></mat-divider>

      <button mat-menu-item (click)="logout()">
        <mat-icon>logout</mat-icon>
        <span>{{ 'HEADER.LOGOUT' | translate }}</span>
      </button>
    </mat-menu>
  `,
  styles: [`
    .header-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      position: relative;
      z-index: 1000;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo-link {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      color: inherit;
    }

    .logo {
      height: 32px;
      width: auto;
    }

    .logo-text {
      font-size: 1.25rem;
      font-weight: 500;
      display: none;
    }

    .header-center {
      flex: 1;
      display: flex;
      justify-content: center;
      max-width: 600px;
      margin: 0 32px;
    }

    .search-field {
      width: 100%;
      max-width: 500px;
    }

    .search-field .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
    }

    .default-avatar {
      background: var(--primary-color);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 500;
    }

    .login-btn {
      color: white;
    }

    .mobile-search-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1001;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 64px;
    }

    .mobile-search-container {
      width: 90%;
      max-width: 500px;
      background: var(--background-primary);
      border-radius: 8px;
      padding: 16px;
      box-shadow: var(--shadow-3);
    }

    .mobile-search-field {
      width: 100%;
    }

    .user-menu-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: var(--background-secondary);
      margin: -8px -8px 8px -8px;
    }

    .user-menu-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
    }

    .user-menu-info {
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-weight: 500;
      font-size: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-email {
      color: var(--text-secondary);
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-role {
      color: var(--primary-color);
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .suggestion-icon {
      margin-right: 8px;
      color: var(--text-secondary);
    }

    .suggestion-title {
      flex: 1;
    }

    .suggestion-type {
      color: var(--text-hint);
      font-size: 12px;
      margin-left: 8px;
    }

    /* Responsive adjustments */
    @media (min-width: 768px) {
      .logo-text {
        display: block;
      }
    }

    @media (max-width: 767px) {
      .header-toolbar {
        padding: 0 8px;
      }
      
      .header-right {
        gap: 4px;
      }
    }

    /* High contrast mode */
    @media (prefers-contrast: high) {
      .header-toolbar {
        border-bottom: 2px solid var(--text-primary);
      }
      
      .user-avatar,
      .user-menu-avatar {
        border: 2px solid var(--text-primary);
      }
    }

    /* Dark theme adjustments */
    .dark-theme .mobile-search-container {
      background: var(--background-secondary);
    }
  `]
})
export class HeaderComponent {
  @Input() isHandset = false;
  @Input() isAuthenticated = false;
  @Input() currentUser: AuthUser | null = null;

  @Output() toggleSidenav = new EventEmitter<void>();
  @Output() toggleTheme = new EventEmitter<void>();
  @Output() changeLanguage = new EventEmitter<string>();

  private readonly store = inject(Store<AppState>);

  // Signals for reactive state
  protected readonly showMobileSearch = signal(false);
  protected readonly isDarkTheme = signal(false);
  protected readonly notificationCount = signal(0);
  protected readonly messageCount = signal(0);
  protected readonly searchSuggestions = signal<any[]>([]);

  // Form controls
  protected readonly searchControl = new FormControl('');

  // Available languages
  protected readonly availableLanguages = [
    { code: 'en', name: 'English', icon: 'flag' },
    { code: 'es', name: 'Español', icon: 'flag' },
    { code: 'fr', name: 'Français', icon: 'flag' },
    { code: 'de', name: 'Deutsch', icon: 'flag' },
    { code: 'pt', name: 'Português', icon: 'flag' },
    { code: 'zh', name: '中文', icon: 'flag' },
    { code: 'ja', name: '日本語', icon: 'flag' },
    { code: 'ko', name: '한국어', icon: 'flag' }
  ];

  protected toggleMobileSearch(): void {
    this.showMobileSearch.set(true);
    // Focus the input after the view updates
    setTimeout(() => {
      const input = document.querySelector('.mobile-search-field input') as HTMLInputElement;
      input?.focus();
    }, 100);
  }

  protected closeMobileSearch(): void {
    this.showMobileSearch.set(false);
  }

  protected onSearchSelect(suggestion: any): void {
    // Navigate to the selected item
    console.log('Selected:', suggestion);
    this.closeMobileSearch();
  }

  protected getUserDisplayName(): string {
    if (!this.currentUser?.profile) return 'User';
    const { firstName, lastName } = this.currentUser.profile;
    return `${firstName || ''} ${lastName || ''}`.trim() || 'User';
  }

  protected getUserInitials(): string {
    if (!this.currentUser?.profile) return 'U';
    const { firstName, lastName } = this.currentUser.profile;
    const firstInitial = firstName?.charAt(0).toUpperCase() || '';
    const lastInitial = lastName?.charAt(0).toUpperCase() || '';
    return `${firstInitial}${lastInitial}` || 'U';
  }

  protected logout(): void {
    this.store.dispatch(AuthActions.logout());
  }
}