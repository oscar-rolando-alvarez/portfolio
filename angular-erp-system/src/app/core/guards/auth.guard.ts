import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';

import { selectIsAuthenticated } from '@core/store/auth/auth.selectors';

/** Redirects anonymous users to the login page, remembering where they were heading. */
export const authGuard: CanActivateFn = (_route, state) => {
  const isAuthenticated = inject(Store).selectSignal(selectIsAuthenticated)();
  return isAuthenticated
    ? true
    : inject(Router).createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};
