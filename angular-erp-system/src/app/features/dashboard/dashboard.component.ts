import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatGridListModule } from '@angular/material/grid-list';
import { RouterModule } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { selectCurrentUser } from '@core/store/auth/auth.selectors';
import { User } from '@core/models/user.model';

interface DashboardCard {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  route: string;
  description: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatGridListModule
  ],
  template: `
    <div class="dashboard-container">
      <!-- Welcome Section -->
      @if (currentUser$ | async; as user) {
        <div class="welcome-section">
          <h1>Welcome back, {{ user.firstName }}!</h1>
          <p>Here's what's happening in your organization today.</p>
        </div>
      }

      <!-- Dashboard Cards -->
      <div class="dashboard-grid">
        @for (card of dashboardCards; track card.title) {
          <mat-card class="dashboard-card" [routerLink]="card.route">
            <mat-card-header>
              <div mat-card-avatar [class]="'avatar-' + card.color">
                <mat-icon>{{ card.icon }}</mat-icon>
              </div>
              <mat-card-title>{{ card.title }}</mat-card-title>
              <mat-card-subtitle>{{ card.description }}</mat-card-subtitle>
            </mat-card-header>
            
            <mat-card-content>
              <div class="card-value">{{ card.value }}</div>
            </mat-card-content>
            
            <mat-card-actions align="end">
              <button mat-button color="primary">
                VIEW DETAILS
                <mat-icon>arrow_forward</mat-icon>
              </button>
            </mat-card-actions>
          </mat-card>
        }
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions-section">
        <h2>Quick Actions</h2>
        <div class="quick-actions-grid">
          <button mat-raised-button color="primary" routerLink="/hr/employees">
            <mat-icon>person_add</mat-icon>
            Add Employee
          </button>
          
          <button mat-raised-button color="accent" routerLink="/finance/invoicing">
            <mat-icon>receipt</mat-icon>
            Create Invoice
          </button>
          
          <button mat-raised-button routerLink="/inventory/products">
            <mat-icon>add_box</mat-icon>
            Add Product
          </button>
          
          <button mat-raised-button routerLink="/crm/customers">
            <mat-icon>person_outline</mat-icon>
            New Customer
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .welcome-section {
      margin-bottom: 32px;
    }

    .welcome-section h1 {
      font-size: 2rem;
      font-weight: 400;
      margin: 0 0 8px 0;
      color: rgba(0, 0, 0, 0.87);
    }

    .welcome-section p {
      font-size: 1rem;
      margin: 0;
      color: rgba(0, 0, 0, 0.6);
    }

    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }

    .dashboard-card {
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .dashboard-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    }

    .avatar-primary {
      background-color: #1976d2;
      color: white;
    }

    .avatar-accent {
      background-color: #e91e63;
      color: white;
    }

    .avatar-warn {
      background-color: #f44336;
      color: white;
    }

    .avatar-success {
      background-color: #4caf50;
      color: white;
    }

    .card-value {
      font-size: 2rem;
      font-weight: 500;
      color: #1976d2;
      margin: 16px 0;
    }

    .quick-actions-section h2 {
      font-size: 1.5rem;
      font-weight: 400;
      margin: 0 0 16px 0;
      color: rgba(0, 0, 0, 0.87);
    }

    .quick-actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .quick-actions-grid button {
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    :host-context(.dark-theme) .welcome-section h1,
    :host-context(.dark-theme) .quick-actions-section h2 {
      color: rgba(255, 255, 255, 0.87);
    }

    :host-context(.dark-theme) .welcome-section p {
      color: rgba(255, 255, 255, 0.6);
    }

    @media (max-width: 768px) {
      .dashboard-container {
        padding: 16px;
      }

      .dashboard-grid {
        grid-template-columns: 1fr;
        gap: 16px;
      }

      .quick-actions-grid {
        grid-template-columns: 1fr;
      }

      .welcome-section h1 {
        font-size: 1.5rem;
      }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private store = inject(Store);
  
  currentUser$: Observable<User | null> = this.store.select(selectCurrentUser);
  
  dashboardCards: DashboardCard[] = [
    {
      title: 'Employees',
      value: '145',
      icon: 'people',
      color: 'primary',
      route: '/hr/employees',
      description: 'Active employees'
    },
    {
      title: 'Revenue',
      value: '$52,340',
      icon: 'trending_up',
      color: 'success',
      route: '/finance/reports',
      description: 'This month'
    },
    {
      title: 'Projects',
      value: '23',
      icon: 'work',
      color: 'accent',
      route: '/projects/list',
      description: 'Active projects'
    },
    {
      title: 'Inventory',
      value: '1,247',
      icon: 'inventory',
      color: 'warn',
      route: '/inventory/stock',
      description: 'Items in stock'
    }
  ];

  ngOnInit(): void {
    // Load dashboard data
  }
}