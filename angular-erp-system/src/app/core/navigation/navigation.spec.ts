import { NAVIGATION, visibleNavigation } from './navigation';

describe('visibleNavigation', () => {
  it('shows role-restricted entries only to matching roles', () => {
    const routes = (roles: string[]) => visibleNavigation(NAVIGATION, roles).map((i) => i.route);

    expect(routes(['admin'])).toEqual(['/dashboard', '/inventory']);
    expect(routes(['warehouse_employee'])).toContain('/inventory');
    expect(routes(['sales_rep'])).toEqual(['/dashboard']);
    expect(routes([])).toEqual(['/dashboard']);
  });
});
