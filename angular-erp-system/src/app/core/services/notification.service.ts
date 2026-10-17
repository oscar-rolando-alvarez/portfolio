import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { EMPTY } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { apiUrl, unwrap } from '@core/http/api';
import type { Notification, PaginatedResponse } from '@core/models/base.model';
import * as NotificationActions from '@core/store/notification/notification.actions';

type Level = 'info' | 'success' | 'warning' | 'error';

/**
 * Facade over the notification slice: loads the inbox from the API and exposes
 * convenience methods for transient toasts (rendered by NotificationEffects).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);

  loadNotifications(): void {
    this.store.dispatch(NotificationActions.loadNotifications());
    this.http
      .get(apiUrl('notifications'))
      .pipe(
        map((raw) => unwrap<PaginatedResponse<Notification>>(raw).data),
        catchError((error: { message?: string }) => {
          this.store.dispatch(
            NotificationActions.loadNotificationsFailure({
              error: error.message ?? 'Failed to load notifications',
            }),
          );
          return EMPTY;
        }),
      )
      .subscribe((notifications) =>
        this.store.dispatch(NotificationActions.loadNotificationsSuccess({ notifications })),
      );
  }

  markAsRead(id: string): void {
    // Optimistic update; the server call is fire-and-forget.
    this.store.dispatch(NotificationActions.markAsRead({ id }));
    this.http.patch(apiUrl(`notifications/${id}/read`), {}).subscribe({ error: () => undefined });
  }

  markAllAsRead(): void {
    this.store.dispatch(NotificationActions.markAllAsRead());
    this.http.patch(apiUrl('notifications/mark-all-read'), {}).subscribe({ error: () => undefined });
  }

  showSuccess(message: string, title = 'Success', duration = 4000): void {
    this.show('success', title, message, duration);
  }

  showError(message: string, title = 'Error', duration = 8000): void {
    this.show('error', title, message, duration);
  }

  showWarning(message: string, title = 'Warning', duration = 6000): void {
    this.show('warning', title, message, duration);
  }

  showInfo(message: string, title = 'Information', duration = 4000): void {
    this.show('info', title, message, duration);
  }

  private show(level: Level, title: string, message: string, duration: number): void {
    this.store.dispatch(NotificationActions.showNotification({ level, title, message, duration }));
  }
}
