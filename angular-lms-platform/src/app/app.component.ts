import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, takeUntil, map } from 'rxjs/operators';
import { Subject, fromEvent } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

// Core imports
import { AppState } from './core/store/app.state';
import { selectIsAuthenticated, selectCurrentUser } from './core/store/auth/auth.selectors';
import { selectIsLoading } from './core/store/ui/ui.selectors';
import { AuthActions } from './core/store/auth/auth.actions';
import { UIActions } from './core/store/ui/ui.actions';
import { ThemeService } from './core/services/theme.service';
import { NotificationService } from './core/services/notification.service';
import { ConnectionService } from './core/services/connection.service';
import { AnalyticsService } from './core/services/analytics.service';

// Shared components
import { HeaderComponent } from './shared/components/layout/header/header.component';
import { SidenavComponent } from './shared/components/layout/sidenav/sidenav.component';
import { FooterComponent } from './shared/components/layout/footer/footer.component';
import { LoadingIndicatorComponent } from './shared/components/ui/loading-indicator/loading-indicator.component';
import { ConnectionStatusComponent } from './shared/components/ui/connection-status/connection-status.component';
import { CookieConsentComponent } from './shared/components/ui/cookie-consent/cookie-consent.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    TranslateModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MatMenuModule,
    MatBadgeModule,
    MatProgressBarModule,
    MatSnackBarModule,
    HeaderComponent,
    SidenavComponent,
    FooterComponent,
    LoadingIndicatorComponent,
    ConnectionStatusComponent,
    CookieConsentComponent
  ],
  template: `
    <div class="app-container" [class.dark-theme]="isDarkTheme()">
      <!-- Loading indicator -->
      <app-loading-indicator 
        *ngIf="isLoading()" 
        [message]="loadingMessage()">
      </app-loading-indicator>

      <!-- Connection status -->
      <app-connection-status 
        [isOnline]="isOnline()"
        [connectionQuality]="connectionQuality()">
      </app-connection-status>

      <!-- Main layout -->
      <mat-sidenav-container class="sidenav-container" autosize>
        <!-- Side navigation -->
        <mat-sidenav 
          #drawer 
          class="sidenav" 
          fixedInViewport 
          [attr.role]="isHandset() ? 'dialog' : 'navigation'"
          [mode]="isHandset() ? 'over' : 'side'"
          [opened]="!isHandset() && isAuthenticated()">
          <app-sidenav 
            [isHandset]="isHandset()"
            (closeSidenav)="drawer.close()">
          </app-sidenav>
        </mat-sidenav>

        <!-- Main content area -->
        <mat-sidenav-content class="main-content">
          <!-- Header -->
          <app-header 
            [isHandset]="isHandset()"
            [isAuthenticated]="isAuthenticated()"
            [currentUser]="currentUser()"
            (toggleSidenav)="drawer.toggle()"
            (toggleTheme)="toggleTheme()"
            (changeLanguage)="changeLanguage($event)">
          </app-header>

          <!-- Page content -->
          <main class="page-content" role="main" [attr.aria-label]="pageTitle()">
            <router-outlet></router-outlet>
          </main>

          <!-- Footer -->
          <app-footer></app-footer>
        </mat-sidenav-content>
      </mat-sidenav-container>

      <!-- Cookie consent -->
      <app-cookie-consent></app-cookie-consent>

      <!-- Accessibility skip links -->
      <div class="skip-links">
        <a href="#main-content" class="skip-link">{{ 'ACCESSIBILITY.SKIP_TO_CONTENT' | translate }}</a>
        <a href="#navigation" class="skip-link">{{ 'ACCESSIBILITY.SKIP_TO_NAVIGATION' | translate }}</a>
      </div>
    </div>
  `,
  styles: [`
    .app-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .sidenav-container {
      flex: 1;
      display: flex;
    }

    .sidenav {
      width: 280px;
      background: var(--background-secondary);
      border-right: 1px solid var(--divider-color);
    }

    .main-content {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .page-content {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      scroll-behavior: smooth;
    }

    .skip-links {
      position: absolute;
      top: -100px;
      left: 0;
      z-index: 9999;
    }

    .skip-link {
      position: absolute;
      top: 0;
      left: 0;
      padding: 0.5rem 1rem;
      background: var(--primary-color);
      color: white;
      text-decoration: none;
      font-weight: 500;
      border-radius: 0 0 4px 0;
      transition: top var(--transition-fast);
    }

    .skip-link:focus {
      top: 0;
    }

    /* Dark theme styles */
    .dark-theme {
      --text-primary: #ffffff;
      --text-secondary: #b0b0b0;
      --text-hint: #757575;
      --divider-color: #424242;
      --background-primary: #121212;
      --background-secondary: #1e1e1e;
      --background-tertiary: #2d2d2d;
    }

    /* Responsive adjustments */
    @media (max-width: 768px) {
      .sidenav {
        width: 100%;
        max-width: 320px;
      }
    }

    /* High contrast mode */
    @media (prefers-contrast: high) {
      .sidenav {
        border-right: 2px solid var(--text-primary);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .page-content {
        scroll-behavior: auto;
      }
      
      .skip-link {
        transition: none;
      }
    }

    /* Print styles */
    @media print {
      .sidenav-container,
      .skip-links {
        display: none;
      }
      
      .main-content {
        margin: 0;
        box-shadow: none;
      }
    }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly store = inject(Store<AppState>);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly swUpdate = inject(SwUpdate);
  private readonly translate = inject(TranslateService);
  private readonly themeService = inject(ThemeService);
  private readonly notificationService = inject(NotificationService);
  private readonly connectionService = inject(ConnectionService);
  private readonly analyticsService = inject(AnalyticsService);

  // Signals for reactive state
  protected readonly isHandset = signal(false);
  protected readonly isDarkTheme = signal(false);
  protected readonly isOnline = signal(navigator.onLine);
  protected readonly connectionQuality = signal('good');
  protected readonly pageTitle = signal('EduPlatform');
  protected readonly loadingMessage = signal('');

  // Store selectors
  protected readonly isAuthenticated = this.store.selectSignal(selectIsAuthenticated);
  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);
  protected readonly isLoading = this.store.selectSignal(selectIsLoading);

  constructor() {
    // Initialize theme effect
    effect(() => {
      document.body.setAttribute('data-theme', this.isDarkTheme() ? 'dark' : 'light');
    });

    // Initialize language
    this.translate.setDefaultLang('en');
    this.translate.use('en');
  }

  ngOnInit(): void {
    this.initializeApp();
    this.setupBreakpointObserver();
    this.setupRouterEvents();
    this.setupServiceWorker();
    this.setupConnectionMonitoring();
    this.setupAnalytics();
    this.checkAuthentication();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeApp(): void {
    // Initialize theme
    this.themeService.isDarkTheme$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isDark => this.isDarkTheme.set(isDark));

    // Set up global error handling
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.notificationService.showError('An unexpected error occurred');
      this.analyticsService.trackError(event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.notificationService.showError('An unexpected error occurred');
      this.analyticsService.trackError(event.reason);
    });
  }

  private setupBreakpointObserver(): void {
    this.breakpointObserver
      .observe(Breakpoints.Handset)
      .pipe(
        map(result => result.matches),
        takeUntil(this.destroy$)
      )
      .subscribe(isHandset => this.isHandset.set(isHandset));
  }

  private setupRouterEvents(): void {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        // Update page title
        this.updatePageTitle(event.url);
        
        // Track page view
        this.analyticsService.trackPageView(event.url);
        
        // Scroll to top
        window.scrollTo(0, 0);
        
        // Hide loading
        this.store.dispatch(UIActions.hideLoading());
      });
  }

  private setupServiceWorker(): void {
    if (this.swUpdate.isEnabled) {
      // Check for updates
      this.swUpdate.versionUpdates
        .pipe(
          filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
          takeUntil(this.destroy$)
        )
        .subscribe(() => {
          this.notificationService.showUpdateAvailable(() => {
            this.swUpdate.activateUpdate().then(() => {
              window.location.reload();
            });
          });
        });

      // Check for updates periodically
      setInterval(() => {
        this.swUpdate.checkForUpdate();
      }, 60000); // Check every minute
    }
  }

  private setupConnectionMonitoring(): void {
    // Online/offline status
    fromEvent(window, 'online')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isOnline.set(true);
        this.notificationService.showSuccess('Connection restored');
      });

    fromEvent(window, 'offline')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isOnline.set(false);
        this.notificationService.showWarning('You are offline');
      });

    // Connection quality monitoring
    this.connectionService.connectionQuality$
      .pipe(takeUntil(this.destroy$))
      .subscribe(quality => this.connectionQuality.set(quality));
  }

  private setupAnalytics(): void {
    // Initialize analytics
    this.analyticsService.initialize();
    
    // Track user session
    if (this.isAuthenticated()) {
      this.analyticsService.trackUserSession(this.currentUser()?.id);
    }
  }

  private checkAuthentication(): void {
    // Check if user is logged in on app start
    const token = localStorage.getItem('auth_token');
    if (token) {
      this.store.dispatch(AuthActions.checkAuthStatus());
    }
  }

  private updatePageTitle(url: string): void {
    // Extract page title from URL or route data
    const segments = url.split('/').filter(s => s);
    if (segments.length > 0) {
      const page = segments[0];
      this.pageTitle.set(`${this.capitalizeFirst(page)} - EduPlatform`);
    } else {
      this.pageTitle.set('EduPlatform - Advanced Learning Management System');
    }
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  protected changeLanguage(language: string): void {
    this.translate.use(language);
    localStorage.setItem('preferred_language', language);
    
    // Update HTML lang attribute
    document.documentElement.lang = language;
    
    this.notificationService.showSuccess(
      this.translate.instant('NOTIFICATIONS.LANGUAGE_CHANGED')
    );
  }
}