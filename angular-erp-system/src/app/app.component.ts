import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { LayoutComponent } from './layout/layout.component';
import { LoadingService } from '@core/services/loading.service';
import { ThemeService } from '@core/services/theme.service';
import { NotificationService } from '@core/services/notification.service';
import { AuthService } from '@core/services/auth.service';
import { selectIsAuthenticated } from '@core/store/auth/auth.selectors';
import { selectIsLoading } from '@core/store/ui/ui.selectors';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    LayoutComponent,
    MatProgressBarModule
  ],
  template: `
    <div [class.dark-theme]="isDarkTheme$ | async" class="app-container">
      @if (isLoading$ | async) {
        <mat-progress-bar mode="indeterminate" class="global-loading"></mat-progress-bar>
      }
      
      @if (isAuthenticated$ | async) {
        <app-layout>
          <router-outlet></router-outlet>
        </app-layout>
      } @else {
        <router-outlet></router-outlet>
      }
    </div>
  `,
  styles: [`
    .app-container {
      height: 100vh;
      overflow: hidden;
    }
    
    .global-loading {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
    }
  `]
})
export class AppComponent implements OnInit {
  private store = inject(Store);
  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  title = 'Angular ERP System';
  
  isAuthenticated$: Observable<boolean> = this.store.select(selectIsAuthenticated);
  isLoading$: Observable<boolean> = this.store.select(selectIsLoading);
  isDarkTheme$: Observable<boolean> = this.themeService.isDarkTheme$;

  ngOnInit(): void {
    // Initialize services
    this.authService.initializeAuth();
    this.themeService.initializeTheme();
    this.notificationService.initialize();
  }
}