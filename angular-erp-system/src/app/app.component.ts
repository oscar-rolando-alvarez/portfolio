import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';

import { LoadingService } from '@core/services/loading.service';
import { NotificationService } from '@core/services/notification.service';
import { ThemeService } from '@core/services/theme.service';
import { selectIsAuthenticated } from '@core/store/auth/auth.selectors';
import { LayoutComponent } from './layout/layout.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, LayoutComponent, MatProgressBarModule],
  template: `
    @if (loading.isLoading()) {
      <mat-progress-bar mode="indeterminate" class="global-loading" />
    }

    @if (isAuthenticated()) {
      <app-layout>
        <router-outlet />
      </app-layout>
    } @else {
      <router-outlet />
    }
  `,
  styles: `
    .global-loading {
      position: fixed;
      inset: 0 0 auto 0;
      z-index: 1000;
    }
  `,
})
export class AppComponent {
  private readonly store = inject(Store);
  private readonly notifications = inject(NotificationService);
  protected readonly loading = inject(LoadingService);

  protected readonly isAuthenticated = this.store.selectSignal(selectIsAuthenticated);

  constructor() {
    // Instantiating the theme service applies the persisted/system theme.
    inject(ThemeService);

    effect(() => {
      if (this.isAuthenticated()) {
        this.notifications.loadNotifications();
      }
    });
  }
}
