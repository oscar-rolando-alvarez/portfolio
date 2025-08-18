import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { environment } from '@environments/environment';
import { Notification } from '@core/models/base.model';
import { ApiResponse, PaginatedResponse } from '@core/models/base.model';
import * as NotificationActions from '@core/store/notification/notification.actions';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);
  private store = inject(Store);
  
  private readonly apiUrl = `${environment.apiUrl}/${environment.apiVersion}/notifications`;

  initialize(): void {
    this.loadNotifications();
    this.setupWebSocketConnection();
    this.setupServiceWorkerNotifications();
  }

  loadNotifications(): void {
    this.store.dispatch(NotificationActions.loadNotifications());
    
    this.http.get<ApiResponse<PaginatedResponse<Notification>>>(this.apiUrl).pipe(
      map(response => response.data!.data),
      catchError(error => {
        this.store.dispatch(NotificationActions.loadNotificationsFailure({ 
          error: error.message || 'Failed to load notifications' 
        }));
        return [];
      })
    ).subscribe(notifications => {
      this.store.dispatch(NotificationActions.loadNotificationsSuccess({ notifications }));
    });
  }

  markAsRead(id: string): void {
    this.store.dispatch(NotificationActions.markAsRead({ id }));
    
    this.http.patch(`${this.apiUrl}/${id}/read`, {}).subscribe({
      error: (error) => {
        console.error('Failed to mark notification as read:', error);
        // Optionally revert the optimistic update
      }
    });
  }

  markAllAsRead(): void {
    this.store.dispatch(NotificationActions.markAllAsRead());
    
    this.http.patch(`${this.apiUrl}/mark-all-read`, {}).subscribe({
      error: (error) => {
        console.error('Failed to mark all notifications as read:', error);
        // Optionally revert the optimistic update
      }
    });
  }

  deleteNotification(id: string): void {
    this.store.dispatch(NotificationActions.removeNotification({ id }));
    
    this.http.delete(`${this.apiUrl}/${id}`).subscribe({
      error: (error) => {
        console.error('Failed to delete notification:', error);
        // Optionally revert the optimistic update
      }
    });
  }

  clearAllNotifications(): void {
    this.store.dispatch(NotificationActions.clearAllNotifications());
    
    this.http.delete(`${this.apiUrl}/clear-all`).subscribe({
      error: (error) => {
        console.error('Failed to clear all notifications:', error);
        // Optionally revert the optimistic update
      }
    });
  }

  // Show different types of notifications
  showSuccess(message: string, title = 'Success', duration = 5000): void {
    this.store.dispatch(NotificationActions.showNotification({
      type: 'success',
      title,
      message,
      duration
    }));
  }

  showError(message: string, title = 'Error', duration = 8000): void {
    this.store.dispatch(NotificationActions.showNotification({
      type: 'error',
      title,
      message,
      duration
    }));
  }

  showWarning(message: string, title = 'Warning', duration = 6000): void {
    this.store.dispatch(NotificationActions.showNotification({
      type: 'warning',
      title,
      message,
      duration
    }));
  }

  showInfo(message: string, title = 'Information', duration = 5000): void {
    this.store.dispatch(NotificationActions.showNotification({
      type: 'info',
      title,
      message,
      duration
    }));
  }

  showActionNotification(
    message: string, 
    actionText: string, 
    actionUrl: string, 
    title = 'Action Required'
  ): void {
    this.store.dispatch(NotificationActions.showNotification({
      type: 'info',
      title,
      message,
      actionText,
      actionUrl,
      duration: 10000
    }));
  }

  // Create system notification
  createNotification(
    type: 'info' | 'success' | 'warning' | 'error',
    title: string,
    message: string,
    options?: {
      userId?: string;
      actionUrl?: string;
      actionText?: string;
      expiresAt?: Date;
      metadata?: Record<string, any>;
    }
  ): Observable<Notification> {
    const notification = {
      type,
      title,
      message,
      ...options
    };

    return this.http.post<ApiResponse<Notification>>(this.apiUrl, notification).pipe(
      map(response => response.data!),
      catchError(this.handleError)
    );
  }

  // Browser notifications (Web API)
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications');
    }

    const permission = await Notification.requestPermission();
    return permission;
  }

  showBrowserNotification(
    title: string, 
    options?: NotificationOptions
  ): void {
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'erp-notification',
        renotify: true,
        ...options
      });

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    }
  }

  // WebSocket for real-time notifications
  private setupWebSocketConnection(): void {
    if (!environment.features.enableRealtimeUpdates) return;

    // WebSocket implementation would go here
    // For demo purposes, simulate real-time notifications
    if (environment.enableMocking) {
      this.simulateRealtimeNotifications();
    }
  }

  // Service Worker notifications
  private setupServiceWorkerNotifications(): void {
    if (!environment.enablePWA || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(registration => {
      // Set up push notification subscription
      // Implementation would depend on your push service (Firebase, etc.)
    });
  }

  // Simulate real-time notifications for demo
  private simulateRealtimeNotifications(): void {
    const demoNotifications = [
      { type: 'info' as const, title: 'New Message', message: 'You have a new message from John Doe' },
      { type: 'success' as const, title: 'Task Completed', message: 'Invoice #INV-001 has been approved' },
      { type: 'warning' as const, title: 'Low Stock Alert', message: 'Product ABC is running low on stock' },
      { type: 'error' as const, title: 'System Error', message: 'Failed to sync data with external service' }
    ];

    let index = 0;
    setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance every interval
        const notificationData = demoNotifications[index % demoNotifications.length];
        
        const notification: Notification = {
          id: Date.now().toString(),
          ...notificationData,
          isRead: false,
          createdAt: new Date()
        };

        this.store.dispatch(NotificationActions.addNotification({ notification }));
        
        // Show browser notification if permission granted
        if (Notification.permission === 'granted') {
          this.showBrowserNotification(notification.title, {
            body: notification.message,
            icon: '/icons/icon-192x192.png'
          });
        }

        index++;
      }
    }, 30000); // Check every 30 seconds
  }

  private handleError = (error: any) => {
    console.error('Notification Service Error:', error);
    throw error;
  };
}