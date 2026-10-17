import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngrx/store';

import { NAVIGATION, visibleNavigation } from '@core/navigation/navigation';
import { selectUserRoles } from '@core/store/auth/auth.selectors';

@Component({
  selector: 'app-sidenav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, MatDividerModule, MatIconModule, MatListModule],
  template: `
    <div class="brand">
      <mat-icon>business</mat-icon>
      <span>ERP System</span>
    </div>
    <mat-divider />
    <mat-nav-list aria-label="Main navigation">
      @for (item of items(); track item.route) {
        <a
          mat-list-item
          [routerLink]="item.route"
          routerLinkActive
          #rla="routerLinkActive"
          [activated]="rla.isActive"
          (click)="navigate.emit()"
        >
          <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
          <span matListItemTitle>{{ item.label }}</span>
        </a>
      }
    </mat-nav-list>
  `,
  styles: `
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 16px;
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--mat-sys-primary);
    }
  `,
})
export class SidenavComponent {
  private readonly roles = inject(Store).selectSignal(selectUserRoles);

  readonly navigate = output<void>();

  protected readonly items = computed(() => visibleNavigation(NAVIGATION, this.roles()));
}
