import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { adminGuard } from '@core/guards/admin.guard';
import { roleGuard } from '@core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent),
    children: [
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      },
      {
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
      },
      {
        path: 'forgot-password',
        loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
      }
    ]
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'hr',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'hr_manager', 'hr_employee'] },
    loadChildren: () => import('./features/hr/hr.routes').then(m => m.HR_ROUTES)
  },
  {
    path: 'finance',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'finance_manager', 'accountant'] },
    loadChildren: () => import('./features/finance/finance.routes').then(m => m.FINANCE_ROUTES)
  },
  {
    path: 'inventory',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'inventory_manager', 'warehouse_employee'] },
    loadChildren: () => import('./features/inventory/inventory.routes').then(m => m.INVENTORY_ROUTES)
  },
  {
    path: 'crm',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'sales_manager', 'sales_rep'] },
    loadChildren: () => import('./features/crm/crm.routes').then(m => m.CRM_ROUTES)
  },
  {
    path: 'projects',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'project_manager', 'team_member'] },
    loadChildren: () => import('./features/projects/projects.routes').then(m => m.PROJECTS_ROUTES)
  },
  {
    path: 'sales',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'sales_manager', 'sales_rep'] },
    loadChildren: () => import('./features/sales/sales.routes').then(m => m.SALES_ROUTES)
  },
  {
    path: 'analytics',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'analyst', 'manager'] },
    loadChildren: () => import('./features/analytics/analytics.routes').then(m => m.ANALYTICS_ROUTES)
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES)
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    path: 'help',
    loadComponent: () => import('./features/help/help.component').then(m => m.HelpComponent)
  },
  {
    path: '404',
    loadComponent: () => import('@shared/components/not-found/not-found.component').then(m => m.NotFoundComponent)
  },
  {
    path: '**',
    redirectTo: '/404'
  }
];