import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { Alert } from '@/types';
import { NotificationState } from './types';
import { generateId } from '@/utils/helpers';

export const useNotificationStore = create<NotificationState>()(
  devtools(
    persist(
      immer((set, get) => ({
        alerts: [],
        unreadCount: 0,
        isOpen: false,

        addAlert: (alert) =>
          set((state) => {
            const newAlert = {
              ...alert,
              id: alert.id || generateId(),
              timestamp: alert.timestamp || new Date(),
              read: false,
            };
            
            state.alerts.unshift(newAlert);
            state.unreadCount += 1;
            
            // Limit the number of stored alerts
            if (state.alerts.length > 100) {
              state.alerts = state.alerts.slice(0, 100);
            }
          }),

        removeAlert: (id) =>
          set((state) => {
            const alertIndex = state.alerts.findIndex((alert) => alert.id === id);
            if (alertIndex !== -1) {
              const alert = state.alerts[alertIndex];
              if (!alert.read) {
                state.unreadCount = Math.max(0, state.unreadCount - 1);
              }
              state.alerts.splice(alertIndex, 1);
            }
          }),

        markAsRead: (id) =>
          set((state) => {
            const alert = state.alerts.find((alert) => alert.id === id);
            if (alert && !alert.read) {
              alert.read = true;
              state.unreadCount = Math.max(0, state.unreadCount - 1);
            }
          }),

        markAllAsRead: () =>
          set((state) => {
            state.alerts.forEach((alert) => {
              alert.read = true;
            });
            state.unreadCount = 0;
          }),

        clearAlerts: () =>
          set((state) => {
            state.alerts = [];
            state.unreadCount = 0;
          }),

        setIsOpen: (open) =>
          set((state) => {
            state.isOpen = open;
          }),
      })),
      {
        name: 'notification-store',
        partialize: (state) => ({
          alerts: state.alerts.slice(0, 50), // Only persist recent alerts
          unreadCount: state.unreadCount,
        }),
      }
    ),
    {
      name: 'notification-store',
    }
  )
);

// Utility functions for common alert types
export const createAlert = {
  success: (title: string, message: string): Alert => ({
    id: generateId(),
    type: 'success',
    title,
    message,
    timestamp: new Date(),
    read: false,
  }),

  error: (title: string, message: string): Alert => ({
    id: generateId(),
    type: 'error',
    title,
    message,
    timestamp: new Date(),
    read: false,
  }),

  warning: (title: string, message: string): Alert => ({
    id: generateId(),
    type: 'warning',
    title,
    message,
    timestamp: new Date(),
    read: false,
  }),

  info: (title: string, message: string): Alert => ({
    id: generateId(),
    type: 'info',
    title,
    message,
    timestamp: new Date(),
    read: false,
  }),
};