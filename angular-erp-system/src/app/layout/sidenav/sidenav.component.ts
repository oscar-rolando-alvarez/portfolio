import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { User } from '@core/models/user.model';
import { selectCurrentUser } from '@core/store/auth/auth.selectors';

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  children?: NavigationItem[];
  roles?: string[];
  permissions?: string[];
  badge?: string | number;
  isExpanded?: boolean;
}

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatListModule,
    MatIconModule,
    MatDividerModule,
    MatExpansionModule
  ],
  template: `
    <div class="sidenav-content">
      <!-- Logo/Brand -->
      <div class="sidenav-header">
        <div class="brand">
          <mat-icon class="brand-icon">business</mat-icon>
          <span class="brand-text">ERP System</span>
        </div>
      </div>

      <mat-divider></mat-divider>

      <!-- Navigation Menu -->
      <nav class="sidenav-nav">
        <mat-list>
          @for (item of navigationItems; track item.id) {
            @if (hasPermission(item)) {
              @if (item.children && item.children.length > 0) {
                <!-- Expandable Menu Item -->
                <mat-expansion-panel 
                  class="nav-expansion-panel"
                  [expanded]="item.isExpanded">
                  <mat-expansion-panel-header class="nav-expansion-header">
                    <mat-panel-title class="nav-expansion-title">
                      <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
                      <span class="nav-label">{{ item.label }}</span>
                      @if (item.badge) {
                        <span class="nav-badge">{{ item.badge }}</span>
                      }
                    </mat-panel-title>
                  </mat-expansion-panel-header>
                  
                  <div class="nav-children">
                    @for (child of item.children; track child.id) {
                      @if (hasPermission(child)) {
                        <mat-list-item 
                          class="nav-child-item"
                          [routerLink]="child.route"
                          routerLinkActive="active"
                          (click)="onNavigate()">
                          <mat-icon matListItemIcon class="nav-child-icon">{{ child.icon }}</mat-icon>
                          <span matListItemTitle>{{ child.label }}</span>
                          @if (child.badge) {
                            <span matListItemMeta class="nav-badge">{{ child.badge }}</span>
                          }
                        </mat-list-item>
                      }
                    }
                  </div>
                </mat-expansion-panel>
              } @else {
                <!-- Single Menu Item -->
                <mat-list-item 
                  class="nav-item"
                  [routerLink]="item.route"
                  routerLinkActive="active"
                  (click)="onNavigate()">
                  <mat-icon matListItemIcon class="nav-icon">{{ item.icon }}</mat-icon>
                  <span matListItemTitle>{{ item.label }}</span>
                  @if (item.badge) {
                    <span matListItemMeta class="nav-badge">{{ item.badge }}</span>
                  }
                </mat-list-item>
              }
            }
          }
        </mat-list>
      </nav>
    </div>
  `,
  styles: [`
    .sidenav-content {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .sidenav-header {
      padding: 16px;
      background: rgba(0, 0, 0, 0.02);
    }

    :host-context(.dark-theme) .sidenav-header {
      background: rgba(255, 255, 255, 0.02);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      color: #1976d2;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .brand-text {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1976d2;
    }

    .sidenav-nav {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .nav-expansion-panel {
      box-shadow: none !important;
      margin: 0 !important;
    }

    .nav-expansion-header {
      padding: 0 16px !important;
      height: 48px !important;
    }

    .nav-expansion-title {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
    }

    .nav-item,
    .nav-child-item {
      height: 48px;
      margin: 0 8px;
      border-radius: 8px;
      transition: background-color 0.2s;
    }

    .nav-item:hover,
    .nav-child-item:hover {
      background-color: rgba(0, 0, 0, 0.04);
    }

    :host-context(.dark-theme) .nav-item:hover,
    :host-context(.dark-theme) .nav-child-item:hover {
      background-color: rgba(255, 255, 255, 0.04);
    }

    .nav-item.active,
    .nav-child-item.active {
      background-color: rgba(25, 118, 210, 0.1);
      color: #1976d2;
    }

    .nav-item.active .nav-icon,
    .nav-child-item.active .nav-child-icon {
      color: #1976d2;
    }

    .nav-icon,
    .nav-child-icon {
      color: rgba(0, 0, 0, 0.6);
      margin-right: 16px;
    }

    :host-context(.dark-theme) .nav-icon,
    :host-context(.dark-theme) .nav-child-icon {
      color: rgba(255, 255, 255, 0.6);
    }

    .nav-label {
      flex: 1;
      font-size: 0.875rem;
    }

    .nav-children {
      padding-left: 16px;
    }

    .nav-child-item {
      margin-left: 24px;
      margin-right: 8px;
    }

    .nav-badge {
      background: #f44336;
      color: white;
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 0.75rem;
      min-width: 18px;
      text-align: center;
    }

    /* Scrollbar styling */
    .sidenav-nav::-webkit-scrollbar {
      width: 4px;
    }

    .sidenav-nav::-webkit-scrollbar-track {
      background: transparent;
    }

    .sidenav-nav::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 2px;
    }

    :host-context(.dark-theme) .sidenav-nav::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
    }
  `]
})
export class SidenavComponent implements OnInit {
  private store = inject(Store);
  private router = inject(Router);

  @Output() closeSidenav = new EventEmitter<void>();

  currentUser$: Observable<User | null> = this.store.select(selectCurrentUser);
  currentUser: User | null = null;

  navigationItems: NavigationItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard'
    },
    {
      id: 'hr',
      label: 'Human Resources',
      icon: 'people',
      roles: ['admin', 'hr_manager', 'hr_employee'],
      children: [
        {
          id: 'hr-employees',
          label: 'Employees',
          icon: 'person',
          route: '/hr/employees'
        },
        {
          id: 'hr-payroll',
          label: 'Payroll',
          icon: 'payment',
          route: '/hr/payroll'
        },
        {
          id: 'hr-attendance',
          label: 'Attendance',
          icon: 'schedule',
          route: '/hr/attendance'
        },
        {
          id: 'hr-leave',
          label: 'Leave Management',
          icon: 'event_busy',
          route: '/hr/leave'
        }
      ]
    },
    {
      id: 'finance',
      label: 'Finance',
      icon: 'account_balance',
      roles: ['admin', 'finance_manager', 'accountant'],
      children: [
        {
          id: 'finance-accounting',
          label: 'Accounting',
          icon: 'account_balance_wallet',
          route: '/finance/accounting'
        },
        {
          id: 'finance-invoicing',
          label: 'Invoicing',
          icon: 'receipt',
          route: '/finance/invoicing'
        },
        {
          id: 'finance-expenses',
          label: 'Expenses',
          icon: 'money_off',
          route: '/finance/expenses'
        },
        {
          id: 'finance-reports',
          label: 'Financial Reports',
          icon: 'assessment',
          route: '/finance/reports'
        }
      ]
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: 'inventory',
      roles: ['admin', 'inventory_manager', 'warehouse_employee'],
      children: [
        {
          id: 'inventory-products',
          label: 'Products',
          icon: 'category',
          route: '/inventory/products'
        },
        {
          id: 'inventory-stock',
          label: 'Stock Management',
          icon: 'storage',
          route: '/inventory/stock'
        },
        {
          id: 'inventory-suppliers',
          label: 'Suppliers',
          icon: 'local_shipping',
          route: '/inventory/suppliers'
        },
        {
          id: 'inventory-purchase-orders',
          label: 'Purchase Orders',
          icon: 'shopping_cart',
          route: '/inventory/purchase-orders'
        }
      ]
    },
    {
      id: 'crm',
      label: 'CRM',
      icon: 'contacts',
      roles: ['admin', 'sales_manager', 'sales_rep'],
      children: [
        {
          id: 'crm-customers',
          label: 'Customers',
          icon: 'person_outline',
          route: '/crm/customers'
        },
        {
          id: 'crm-leads',
          label: 'Leads',
          icon: 'trending_up',
          route: '/crm/leads'
        },
        {
          id: 'crm-opportunities',
          label: 'Opportunities',
          icon: 'star',
          route: '/crm/opportunities'
        },
        {
          id: 'crm-communications',
          label: 'Communications',
          icon: 'chat',
          route: '/crm/communications'
        }
      ]
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: 'work',
      roles: ['admin', 'project_manager', 'team_member'],
      children: [
        {
          id: 'projects-list',
          label: 'Project List',
          icon: 'list',
          route: '/projects/list'
        },
        {
          id: 'projects-tasks',
          label: 'Tasks',
          icon: 'task',
          route: '/projects/tasks'
        },
        {
          id: 'projects-timeline',
          label: 'Timeline',
          icon: 'timeline',
          route: '/projects/timeline'
        },
        {
          id: 'projects-resources',
          label: 'Resources',
          icon: 'groups',
          route: '/projects/resources'
        }
      ]
    },
    {
      id: 'sales',
      label: 'Sales',
      icon: 'trending_up',
      roles: ['admin', 'sales_manager', 'sales_rep'],
      children: [
        {
          id: 'sales-orders',
          label: 'Sales Orders',
          icon: 'shopping_bag',
          route: '/sales/orders'
        },
        {
          id: 'sales-quotes',
          label: 'Quotes',
          icon: 'description',
          route: '/sales/quotes'
        },
        {
          id: 'sales-commissions',
          label: 'Commissions',
          icon: 'percent',
          route: '/sales/commissions'
        }
      ]
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: 'analytics',
      roles: ['admin', 'analyst', 'manager'],
      children: [
        {
          id: 'analytics-dashboard',
          label: 'Analytics Dashboard',
          icon: 'dashboard',
          route: '/analytics/dashboard'
        },
        {
          id: 'analytics-reports',
          label: 'Reports',
          icon: 'assessment',
          route: '/analytics/reports'
        },
        {
          id: 'analytics-kpi',
          label: 'KPI Tracking',
          icon: 'speed',
          route: '/analytics/kpi'
        }
      ]
    }
  ];

  ngOnInit(): void {
    this.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
  }

  hasPermission(item: NavigationItem): boolean {
    if (!item.roles && !item.permissions) return true;
    if (!this.currentUser) return false;

    // Check roles
    if (item.roles) {
      const userRoles = this.currentUser.roles.map(role => role.name);
      const hasRole = item.roles.some(role => userRoles.includes(role));
      if (!hasRole) return false;
    }

    // Check permissions
    if (item.permissions) {
      const userPermissions = this.currentUser.permissions.map(permission => permission.name);
      const hasPermission = item.permissions.some(permission => userPermissions.includes(permission));
      if (!hasPermission) return false;
    }

    return true;
  }

  onNavigate(): void {
    this.closeSidenav.emit();
  }
}