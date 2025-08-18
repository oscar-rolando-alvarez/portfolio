import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarRef, SimpleSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject, Observable } from 'rxjs';

export interface NotificationAction {
  label: string;
  action: () => void;
}

export interface NotificationConfig {
  duration?: number;
  action?: NotificationAction;
  panelClass?: string[];
  horizontalPosition?: 'start' | 'center' | 'end' | 'left' | 'right';
  verticalPosition?: 'top' | 'bottom';
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);
  private notificationCount$ = new BehaviorSubject<number>(0);

  showSuccess(message: string, config?: NotificationConfig): MatSnackBarRef<SimpleSnackBar> {
    return this.show(message, {
      ...config,
      panelClass: ['success-snackbar', ...(config?.panelClass || [])],
      duration: config?.duration || 5000
    });
  }

  showError(message: string, config?: NotificationConfig): MatSnackBarRef<SimpleSnackBar> {
    return this.show(message, {
      ...config,
      panelClass: ['error-snackbar', ...(config?.panelClass || [])],
      duration: config?.duration || 8000
    });
  }

  showWarning(message: string, config?: NotificationConfig): MatSnackBarRef<SimpleSnackBar> {
    return this.show(message, {
      ...config,
      panelClass: ['warning-snackbar', ...(config?.panelClass || [])],
      duration: config?.duration || 6000
    });
  }

  showInfo(message: string, config?: NotificationConfig): MatSnackBarRef<SimpleSnackBar> {
    return this.show(message, {
      ...config,
      panelClass: ['info-snackbar', ...(config?.panelClass || [])],
      duration: config?.duration || 5000
    });
  }

  showUpdateAvailable(onUpdate: () => void): MatSnackBarRef<SimpleSnackBar> {
    return this.show('A new version is available!', {
      action: {
        label: 'Update',
        action: onUpdate
      },
      duration: 0, // Don't auto-dismiss
      panelClass: ['update-snackbar']
    });
  }

  private show(message: string, config?: NotificationConfig): MatSnackBarRef<SimpleSnackBar> {
    const actionLabel = config?.action?.label || 'Close';
    
    const snackBarRef = this.snackBar.open(message, actionLabel, {
      duration: config?.duration || 5000,
      horizontalPosition: config?.horizontalPosition || 'end',
      verticalPosition: config?.verticalPosition || 'top',
      panelClass: config?.panelClass || []
    });

    if (config?.action) {
      snackBarRef.onAction().subscribe(() => {
        config.action!.action();
      });
    }

    return snackBarRef;
  }

  getNotificationCount(): Observable<number> {
    return this.notificationCount$.asObservable();
  }

  updateNotificationCount(count: number): void {
    this.notificationCount$.next(count);
  }
}