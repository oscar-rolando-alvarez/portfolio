import { createReducer, on } from '@ngrx/store';
import { Notification } from '@core/models/base.model';
import * as NotificationActions from './notification.actions';

export interface NotificationState {
  notifications: Notification[];
  isLoading: boolean;
  error: string | null;
}

export const initialState: NotificationState = {
  notifications: [],
  isLoading: false,
  error: null
};

export const notificationReducer = createReducer(
  initialState,

  on(NotificationActions.loadNotifications, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(NotificationActions.loadNotificationsSuccess, (state, { notifications }) => ({
    ...state,
    notifications,
    isLoading: false,
    error: null
  })),

  on(NotificationActions.loadNotificationsFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error
  })),

  on(NotificationActions.addNotification, (state, { notification }) => ({
    ...state,
    notifications: [notification, ...state.notifications]
  })),

  on(NotificationActions.removeNotification, (state, { id }) => ({
    ...state,
    notifications: state.notifications.filter(notification => notification.id !== id)
  })),

  on(NotificationActions.markAsRead, (state, { id }) => ({
    ...state,
    notifications: state.notifications.map(notification =>
      notification.id === id
        ? { ...notification, isRead: true }
        : notification
    )
  })),

  on(NotificationActions.markAllAsRead, (state) => ({
    ...state,
    notifications: state.notifications.map(notification => ({
      ...notification,
      isRead: true
    }))
  })),

  on(NotificationActions.clearAllNotifications, (state) => ({
    ...state,
    notifications: []
  })),

  on(NotificationActions.showNotification, (state, { type, title, message, actionUrl, actionText }) => {
    const notification: Notification = {
      id: Date.now().toString(),
      type,
      title,
      message,
      isRead: false,
      createdAt: new Date(),
      actionUrl,
      actionText
    };

    return {
      ...state,
      notifications: [notification, ...state.notifications]
    };
  })
);