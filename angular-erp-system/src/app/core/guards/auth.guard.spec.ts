import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';

import { selectIsAuthenticated } from '@core/store/auth/auth.selectors';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  function run(isAuthenticated: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideMockStore({
          selectors: [{ selector: selectIsAuthenticated, value: isAuthenticated }],
        }),
      ],
    });
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/inventory' } as RouterStateSnapshot),
    );
  }

  it('allows authenticated users', () => {
    expect(run(true)).toBe(true);
  });

  it('redirects anonymous users to login with a return URL', () => {
    const result = run(false) as UrlTree;
    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe('/auth/login?returnUrl=%2Finventory');
  });
});
