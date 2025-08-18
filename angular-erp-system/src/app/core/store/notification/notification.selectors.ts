import { createFeatureSelector, createSelector } from '@ngrx/store';
import { NotificationState } from './notification.reducer';

export const selectNotificationState = createFeatureSelector<NotificationState>('notification');

export const selectAllNotifications = createSelector(
  selectNotificationState,
  (state: NotificationState) => state.notifications
);

export const selectUnreadNotifications = createSelector(
  selectAllNotifications,
  (notifications) => notifications.filter(notification => !notification.isRead)
);

export const selectUnreadNotificationsCount = createSelector(
  selectUnreadNotifications,
  (notifications) => notifications.length
);

export const selectNotificationsByType = (type: 'info' | 'success' | 'warning' | 'error') =>
  createSelector(
    selectAllNotifications,
    (notifications) => notifications.filter(notification => notification.type === type)
  );

export const selectRecentNotifications = createSelector(
  selectAllNotifications,
  (notifications) => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return notifications.filter(notification => 
      new Date(notification.createdAt) > oneDayAgo
    );
  }
);

export const selectNotificationsLoading = createSelector(
  selectNotificationState,
  (state: NotificationState) => state.isLoading
);

export const selectNotificationsError = createSelector(
  selectNotificationState,
  (state: NotificationState) => state.error
);