import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { tap } from 'rxjs/operators';

import * as NotificationActions from './notification.actions';

@Injectable()
export class NotificationEffects {
  private readonly actions$ = inject(Actions);
  private readonly snackBar = inject(MatSnackBar);

  /** Renders transient toasts; the inbox itself is loaded via NotificationService. */
  showNotification$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(NotificationActions.showNotification),
        tap(({ level, title, message, duration = 5000, actionText }) => {
          this.snackBar.open(`${title}: ${message}`, actionText ?? 'Close', {
            duration,
            horizontalPosition: 'right',
            verticalPosition: 'top',
            panelClass: [`notification-${level}`],
            politeness: level === 'error' ? 'assertive' : 'polite',
          });
        }),
      ),
    { dispatch: false },
  );
}
