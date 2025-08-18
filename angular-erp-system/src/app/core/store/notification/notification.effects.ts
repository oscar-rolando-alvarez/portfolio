import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { MatSnackBar } from '@angular/material/snack-bar';
import { tap, delay } from 'rxjs/operators';
import * as NotificationActions from './notification.actions';

@Injectable()
export class NotificationEffects {
  private actions$ = inject(Actions);
  private snackBar = inject(MatSnackBar);

  showNotification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(NotificationActions.showNotification),
      tap(({ type, title, message, duration = 5000, actionText }) => {
        const config = {
          duration,
          horizontalPosition: 'right' as const,
          verticalPosition: 'top' as const,
          panelClass: [`notification-${type}`]
        };

        if (actionText) {
          this.snackBar.open(`${title}: ${message}`, actionText, config);
        } else {
          this.snackBar.open(`${title}: ${message}`, 'Close', config);
        }
      })
    ),
    { dispatch: false }
  );

  // Auto-remove notifications after expiry
  autoRemoveExpiredNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(NotificationActions.addNotification),
      delay(30000), // Check after 30 seconds
      tap(({ notification }) => {
        if (notification.expiresAt && new Date() > new Date(notification.expiresAt)) {
          // Dispatch remove action
          // Note: In a real implementation, you'd dispatch the remove action here
        }
      })
    ),
    { dispatch: false }
  );
}