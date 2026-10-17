import type { Notification } from '@core/models/base.model';
import { User } from '@core/models/user.model';
import { Product } from '@features/inventory/product.model';

/**
 * Seed data for the in-browser demo backend. These are fixtures for local
 * development and the public demo only; no real accounts exist.
 */
export const DEMO_PASSWORD = 'demo1234';

const now = new Date('2026-01-01T09:00:00Z');

function demoUser(
  id: string,
  email: string,
  firstName: string,
  lastName: string,
  roles: string[],
): User {
  return {
    id,
    email,
    firstName,
    lastName,
    roles: roles.map((name) => ({ id: `role-${name}`, name, description: name, permissions: [] })),
    permissions: [],
    department: roles.includes('admin') ? 'IT' : 'Operations',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    preferences: {
      theme: 'auto',
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'yyyy-MM-dd',
      timeFormat: '24h',
      currency: 'USD',
      notifications: {
        email: true,
        browser: false,
        mobile: false,
        desktop: false,
        types: { system: true, security: true, updates: true, reminders: true, marketing: false },
      },
      dashboard: { layout: 'grid', widgets: [], refreshInterval: 60 },
    },
  };
}

export const DEMO_USERS: User[] = [
  demoUser('u-1', 'admin@erp.local', 'Ada', 'Admin', ['admin']),
  demoUser('u-2', 'warehouse@erp.local', 'Wes', 'Warehouse', ['warehouse_employee']),
  demoUser('u-3', 'sales@erp.local', 'Sam', 'Sales', ['sales_rep']),
];

export const DEMO_PRODUCTS: Product[] = [
  {
    id: 'p-1',
    sku: 'HW-1001',
    name: 'Hex bolt M8 (box of 100)',
    category: 'Hardware',
    warehouse: 'North',
    quantity: 420,
    reorderPoint: 100,
    unitCost: 7.5,
    updatedAt: '2026-09-30',
  },
  {
    id: 'p-2',
    sku: 'HW-1002',
    name: 'Steel bracket 90 degree',
    category: 'Hardware',
    warehouse: 'North',
    quantity: 35,
    reorderPoint: 50,
    unitCost: 2.1,
    updatedAt: '2026-10-02',
  },
  {
    id: 'p-3',
    sku: 'OF-2001',
    name: 'A4 copy paper (5 reams)',
    category: 'Office',
    warehouse: 'Central',
    quantity: 0,
    reorderPoint: 20,
    unitCost: 24.9,
    updatedAt: '2026-10-05',
  },
  {
    id: 'p-4',
    sku: 'OF-2002',
    name: 'Gel pen, blue (12 pack)',
    category: 'Office',
    warehouse: 'Central',
    quantity: 160,
    reorderPoint: 40,
    unitCost: 9.99,
    updatedAt: '2026-09-21',
  },
  {
    id: 'p-5',
    sku: 'PK-3001',
    name: 'Corrugated box 40x30x30',
    category: 'Packaging',
    warehouse: 'South',
    quantity: 1200,
    reorderPoint: 300,
    unitCost: 0.85,
    updatedAt: '2026-10-10',
  },
  {
    id: 'p-6',
    sku: 'PK-3002',
    name: 'Stretch film roll 500 mm',
    category: 'Packaging',
    warehouse: 'South',
    quantity: 18,
    reorderPoint: 25,
    unitCost: 14.3,
    updatedAt: '2026-10-11',
  },
  {
    id: 'p-7',
    sku: 'EL-4001',
    name: 'Barcode scanner, wireless',
    category: 'Electronics',
    warehouse: 'Central',
    quantity: 12,
    reorderPoint: 5,
    unitCost: 129,
    updatedAt: '2026-08-14',
  },
  {
    id: 'p-8',
    sku: 'EL-4002',
    name: 'Thermal label printer',
    category: 'Electronics',
    warehouse: 'Central',
    quantity: 3,
    reorderPoint: 4,
    unitCost: 349,
    updatedAt: '2026-10-01',
  },
  {
    id: 'p-9',
    sku: 'FU-5001',
    name: 'Pallet rack upright 3 m',
    category: 'Furniture',
    warehouse: 'North',
    quantity: 64,
    reorderPoint: 10,
    unitCost: 89,
    updatedAt: '2026-07-19',
  },
  {
    id: 'p-10',
    sku: 'FU-5002',
    name: 'Ergonomic office chair',
    category: 'Furniture',
    warehouse: 'Central',
    quantity: 9,
    reorderPoint: 6,
    unitCost: 219,
    updatedAt: '2026-09-02',
  },
];

export const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 'n-1',
    type: 'warning',
    title: 'Low stock',
    message: 'Stretch film roll 500 mm is below its reorder point',
    isRead: false,
    createdAt: now,
    actionUrl: '/inventory',
  },
  {
    id: 'n-2',
    type: 'info',
    title: 'System update',
    message: 'Inventory module now supports live search',
    isRead: false,
    createdAt: now,
  },
  {
    id: 'n-3',
    type: 'success',
    title: 'Purchase order approved',
    message: 'PO-2026-0142 was approved by Finance',
    isRead: true,
    createdAt: now,
  },
];
