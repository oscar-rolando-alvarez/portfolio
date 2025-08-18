export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  roles: Role[];
  permissions: Permission[];
  department?: string;
  position?: string;
  phone?: string;
  address?: Address;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  preferences: UserPreferences;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  currency: string;
  notifications: NotificationPreferences;
  dashboard: DashboardPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  browser: boolean;
  mobile: boolean;
  desktop: boolean;
  types: {
    system: boolean;
    security: boolean;
    updates: boolean;
    reminders: boolean;
    marketing: boolean;
  };
}

export interface DashboardPreferences {
  layout: 'grid' | 'list';
  widgets: DashboardWidget[];
  refreshInterval: number;
}

export interface DashboardWidget {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number; width: number; height: number };
  settings: Record<string, any>;
  isVisible: boolean;
}