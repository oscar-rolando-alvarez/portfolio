import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Store } from '@ngrx/store';
import { map, take } from 'rxjs/operators';

import { selectHasAnyRole, selectCurrentUser } from '@core/store/auth/auth.selectors';
import { NotificationService } from '@core/services/notification.service';

export const roleGuard: CanActivateFn = (route, state) => {
  const store = inject(Store);
  const router = inject(Router);
  const notificationService = inject(NotificationService);

  const requiredRoles = route.data?.['roles'] as string[];

  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  return store.select(selectCurrentUser).pipe(
    take(1),
    map(user => {
      if (!user) {
        notificationService.showWarning('Please log in to access this page');
        router.navigate(['/auth/login'], { 
          queryParams: { returnUrl: state.url } 
        });
        return false;
      }

      const userRoles = user.roles.map(role => role.name);
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

      if (hasRequiredRole) {
        return true;
      } else {
        notificationService.showError('You do not have permission to access this page');
        router.navigate(['/dashboard']);
        return false;
      }
    })
  );
};