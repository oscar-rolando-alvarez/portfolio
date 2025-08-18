import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Store } from '@ngrx/store';
import { map, take } from 'rxjs/operators';

import { selectIsAdmin } from '@core/store/auth/auth.selectors';
import { NotificationService } from '@core/services/notification.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const store = inject(Store);
  const router = inject(Router);
  const notificationService = inject(NotificationService);

  return store.select(selectIsAdmin).pipe(
    take(1),
    map(isAdmin => {
      if (isAdmin) {
        return true;
      } else {
        notificationService.showError('Admin access required');
        router.navigate(['/dashboard']);
        return false;
      }
    })
  );
};