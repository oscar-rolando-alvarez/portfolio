'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { Alert } from '@/types';

interface NotificationContextType {
  showNotification: (alert: Alert) => void;
  hideNotification: (id: string) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { addAlert, removeAlert, clearAlerts } = useNotificationStore();

  const showNotification = (alert: Alert) => {
    addAlert(alert);

    // Auto-remove success and info notifications after 5 seconds
    if (alert.type === 'success' || alert.type === 'info') {
      setTimeout(() => {
        removeAlert(alert.id);
      }, 5000);
    }
  };

  const hideNotification = (id: string) => {
    removeAlert(id);
  };

  const clearNotifications = () => {
    clearAlerts();
  };

  // Set up global error handling
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      
      // Only show notification for unhandled errors in production
      if (process.env.NODE_ENV === 'production') {
        showNotification({
          id: `error-${Date.now()}`,
          type: 'error',
          title: 'Unexpected Error',
          message: 'An unexpected error occurred. Please try refreshing the page.',
          timestamp: new Date(),
          read: false,
        });
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      if (process.env.NODE_ENV === 'production') {
        showNotification({
          id: `rejection-${Date.now()}`,
          type: 'error',
          title: 'Network Error',
          message: 'A network request failed. Please check your connection and try again.',
          timestamp: new Date(),
          read: false,
        });
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const contextValue: NotificationContextType = {
    showNotification,
    hideNotification,
    clearNotifications,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

// Utility hooks for common notification patterns
export function useSuccessNotification() {
  const { showNotification } = useNotifications();
  
  return (title: string, message: string) => {
    showNotification({
      id: `success-${Date.now()}`,
      type: 'success',
      title,
      message,
      timestamp: new Date(),
      read: false,
    });
  };
}

export function useErrorNotification() {
  const { showNotification } = useNotifications();
  
  return (title: string, message: string) => {
    showNotification({
      id: `error-${Date.now()}`,
      type: 'error',
      title,
      message,
      timestamp: new Date(),
      read: false,
    });
  };
}

export function useWarningNotification() {
  const { showNotification } = useNotifications();
  
  return (title: string, message: string) => {
    showNotification({
      id: `warning-${Date.now()}`,
      type: 'warning',
      title,
      message,
      timestamp: new Date(),
      read: false,
    });
  };
}

export function useInfoNotification() {
  const { showNotification } = useNotifications();
  
  return (title: string, message: string) => {
    showNotification({
      id: `info-${Date.now()}`,
      type: 'info',
      title,
      message,
      timestamp: new Date(),
      read: false,
    });
  };
}