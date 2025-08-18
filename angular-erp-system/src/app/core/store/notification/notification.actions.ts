import { createAction, props } from '@ngrx/store';
import { Notification } from '@core/models/base.model';

export const loadNotifications = createAction('[Notification] Load Notifications');

export const loadNotificationsSuccess = createAction(
  '[Notification] Load Notifications Success',
  props<{ notifications: Notification[] }>()
);

export const loadNotificationsFailure = createAction(
  '[Notification] Load Notifications Failure',
  props<{ error: string }>()
);

export const addNotification = createAction(
  '[Notification] Add Notification',
  props<{ notification: Notification }>()
);

export const removeNotification = createAction(
  '[Notification] Remove Notification',
  props<{ id: string }>()
);

export const markAsRead = createAction(
  '[Notification] Mark As Read',
  props<{ id: string }>()
);

export const markAllAsRead = createAction('[Notification] Mark All As Read');

export const clearAllNotifications = createAction('[Notification] Clear All Notifications');

export const showNotification = createAction(
  '[Notification] Show Notification',
  props<{ 
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    duration?: number;
    actionUrl?: string;
    actionText?: string;
  }>()
);