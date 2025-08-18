'use client';

import { useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useNotificationStore } from '@/store/notificationStore';
import { Alert } from '@/types';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { alerts, markAsRead, markAllAsRead, removeAlert, clearAlerts } = useNotificationStore();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'success':
        return CheckCircleIcon;
      case 'warning':
        return ExclamationTriangleIcon;
      case 'error':
        return ExclamationTriangleIcon;
      case 'info':
      default:
        return InformationCircleIcon;
    }
  };

  const getAlertColor = (type: Alert['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      case 'info':
      default:
        return 'text-blue-500';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Notifications
        </h3>
        <div className="flex items-center space-x-2">
          {alerts.length > 0 && (
            <>
              <button
                onClick={markAllAsRead}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                Mark all read
              </button>
              <button
                onClick={clearAlerts}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                Clear all
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <InformationCircleIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p>No notifications</p>
            <p className="text-sm mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {alerts.map((alert) => {
              const Icon = getAlertIcon(alert.type);
              const iconColor = getAlertColor(alert.type);

              return (
                <div
                  key={alert.id}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    !alert.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`flex-shrink-0 mt-0.5 ${iconColor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {alert.title}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {alert.message}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                          </p>
                        </div>
                        
                        <div className="flex items-center space-x-1 ml-3">
                          {!alert.read && (
                            <button
                              onClick={() => markAsRead(alert.id)}
                              className="p-1 text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                              title="Mark as read"
                            >
                              <CheckIcon className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => removeAlert(alert.id)}
                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                            title="Dismiss"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Alert Actions */}
                      {alert.actions && alert.actions.length > 0 && (
                        <div className="flex items-center space-x-2 mt-3">
                          {alert.actions.map((action) => (
                            <button
                              key={action.id}
                              onClick={action.action}
                              className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                                action.type === 'primary'
                                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                                  : action.type === 'danger'
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                              }`}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {alerts.length > 0 && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
          <button
            onClick={() => {
              // Navigate to notifications page
              onClose();
            }}
            className="w-full text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}