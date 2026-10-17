import { CurrencyPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';

import { apiUrl, unwrap } from '@core/http/api';
import { selectCurrentUser, selectUserRoles } from '@core/store/auth/auth.selectors';
import { NAVIGATION, visibleNavigation } from '@core/navigation/navigation';

export interface DashboardSummary {
  products: number;
  lowStock: number;
  inventoryValue: number;
  unreadNotifications: number;
}

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule],
  template: `
    <section class="welcome">
      <h1>Welcome back{{ user()?.firstName ? ', ' + user()?.firstName : '' }}</h1>
      <p>Here is what is happening in your organization today.</p>
    </section>

    @if (summary.error()) {
      <p role="alert" class="error">Dashboard metrics are unavailable right now.</p>
    }

    <section class="cards" aria-label="Key metrics">
      @for (card of cards(); track card.title) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-icon mat-card-avatar>{{ card.icon }}</mat-icon>
            <mat-card-title>{{ card.title }}</mat-card-title>
            <mat-card-subtitle>{{ card.subtitle }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <span class="value">{{ summary.isLoading() ? '...' : card.value }}</span>
          </mat-card-content>
        </mat-card>
      }
    </section>

    <section class="modules">
      <h2>Modules</h2>
      <div class="module-links">
        @for (item of modules(); track item.route) {
          <a mat-stroked-button [routerLink]="item.route">
            <mat-icon>{{ item.icon }}</mat-icon>
            {{ item.label }}
          </a>
        }
      </div>
    </section>
  `,
  styles: `
    .welcome h1 {
      margin: 0 0 4px;
      font-weight: 400;
    }
    .welcome p {
      margin: 0;
      opacity: 0.7;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin: 24px 0;
    }
    .value {
      display: block;
      font-size: 2rem;
      font-weight: 500;
      margin-top: 8px;
    }
    .module-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class DashboardComponent {
  private readonly store = inject(Store);
  private readonly currency = new CurrencyPipe('en-US');

  protected readonly user = this.store.selectSignal(selectCurrentUser);
  private readonly roles = this.store.selectSignal(selectUserRoles);

  protected readonly summary = httpResource<DashboardSummary>(() => apiUrl('dashboard/summary'), {
    parse: (raw) => unwrap<DashboardSummary>(raw),
  });

  protected readonly modules = computed(() =>
    visibleNavigation(NAVIGATION, this.roles()).filter((item) => item.route !== '/dashboard'),
  );

  protected readonly cards = computed(() => {
    const s = this.summary.value();
    return [
      { title: 'Products', subtitle: 'Active SKUs', icon: 'inventory_2', value: s?.products ?? '-' },
      { title: 'Needs reorder', subtitle: 'At or below reorder point', icon: 'warning', value: s?.lowStock ?? '-' },
      {
        title: 'Stock value',
        subtitle: 'At unit cost',
        icon: 'payments',
        value: s ? this.currency.transform(s.inventoryValue, 'USD', 'symbol', '1.0-0') : '-',
      },
      { title: 'Unread alerts', subtitle: 'Notifications inbox', icon: 'notifications', value: s?.unreadNotifications ?? '-' },
    ];
  });
}
