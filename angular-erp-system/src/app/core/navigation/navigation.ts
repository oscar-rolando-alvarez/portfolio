export interface NavigationItem {
  label: string;
  icon: string;
  route: string;
  /** Roles allowed to see the entry; omitted means every signed-in user. */
  roles?: string[];
}

/** Navigation entries. Keep `roles` in sync with the matching route's roleGuard data. */
export const NAVIGATION: NavigationItem[] = [
  { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
  {
    label: 'Inventory',
    icon: 'inventory_2',
    route: '/inventory',
    roles: ['admin', 'inventory_manager', 'warehouse_employee'],
  },
];

export function visibleNavigation(items: NavigationItem[], userRoles: string[]): NavigationItem[] {
  return items.filter((item) => !item.roles || item.roles.some((role) => userRoles.includes(role)));
}
