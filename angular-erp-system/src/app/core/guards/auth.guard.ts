import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Store } from '@ngrx/store';
import { map, take } from 'rxjs/operators';

import { selectIsAuthenticated } from '@core/store/auth/auth.selectors';
import { NotificationService } from '@core/services/notification.service';

export const authGuard: CanActivateFn = (route, state) => {
  const store = inject(Store);
  const router = inject(Router);
  const notificationService = inject(NotificationService);

  return store.select(selectIsAuthenticated).pipe(
    take(1),
    map(isAuthenticated => {
      if (isAuthenticated) {
        return true;
      } else {
        notificationService.showWarning('Please log in to access this page');
        router.navigate(['/auth/login'], { 
          queryParams: { returnUrl: state.url } 
        });
        return false;
      }
    })
  );
};