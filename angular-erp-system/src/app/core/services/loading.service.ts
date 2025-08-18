import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import * as UiActions from '@core/store/ui/ui.actions';
import { selectIsLoading } from '@core/store/ui/ui.selectors';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private store = inject(Store);
  
  private loadingSubjects = new Map<string, BehaviorSubject<boolean>>();
  private loadingCounters = new Map<string, number>();

  // Global loading state
  public readonly isLoading$ = this.store.select(selectIsLoading);

  // Show global loader
  show(): void {
    this.store.dispatch(UiActions.showLoader());
  }

  // Hide global loader
  hide(): void {
    this.store.dispatch(UiActions.hideLoader());
  }

  // Set global loading state
  setLoading(isLoading: boolean): void {
    this.store.dispatch(UiActions.setLoading({ isLoading }));
  }

  // Scoped loading management
  showScoped(scope: string): void {
    const counter = this.loadingCounters.get(scope) || 0;
    this.loadingCounters.set(scope, counter + 1);
    
    if (!this.loadingSubjects.has(scope)) {
      this.loadingSubjects.set(scope, new BehaviorSubject<boolean>(false));
    }
    
    this.loadingSubjects.get(scope)!.next(true);
  }

  hideScoped(scope: string): void {
    const counter = this.loadingCounters.get(scope) || 0;
    const newCounter = Math.max(0, counter - 1);
    this.loadingCounters.set(scope, newCounter);
    
    if (newCounter === 0 && this.loadingSubjects.has(scope)) {
      this.loadingSubjects.get(scope)!.next(false);
    }
  }

  // Get scoped loading observable
  getScopedLoading(scope: string): Observable<boolean> {
    if (!this.loadingSubjects.has(scope)) {
      this.loadingSubjects.set(scope, new BehaviorSubject<boolean>(false));
    }
    
    return this.loadingSubjects.get(scope)!.asObservable();
  }

  // Check if any scope is loading
  isAnyScopeLoading(): Observable<boolean> {
    return new Observable(observer => {
      const checkLoading = () => {
        const hasLoading = Array.from(this.loadingSubjects.values())
          .some(subject => subject.value);
        observer.next(hasLoading);
      };

      // Initial check
      checkLoading();

      // Subscribe to changes in all subjects
      const subscriptions = Array.from(this.loadingSubjects.values())
        .map(subject => subject.subscribe(() => checkLoading()));

      return () => {
        subscriptions.forEach(sub => sub.unsubscribe());
      };
    });
  }

  // Utility method to wrap operations with loading state
  withLoading<T>(
    operation: Observable<T>, 
    scope?: string
  ): Observable<T> {
    return new Observable(observer => {
      // Show loading
      if (scope) {
        this.showScoped(scope);
      } else {
        this.show();
      }

      const subscription = operation.subscribe({
        next: (value) => observer.next(value),
        error: (error) => {
          // Hide loading on error
          if (scope) {
            this.hideScoped(scope);
          } else {
            this.hide();
          }
          observer.error(error);
        },
        complete: () => {
          // Hide loading on completion
          if (scope) {
            this.hideScoped(scope);
          } else {
            this.hide();
          }
          observer.complete();
        }
      });

      return () => subscription.unsubscribe();
    });
  }

  // Cleanup method for components
  clearScope(scope: string): void {
    if (this.loadingSubjects.has(scope)) {
      this.loadingSubjects.get(scope)!.complete();
      this.loadingSubjects.delete(scope);
    }
    this.loadingCounters.delete(scope);
  }

  // Clear all scoped loading states
  clearAllScopes(): void {
    this.loadingSubjects.forEach(subject => subject.complete());
    this.loadingSubjects.clear();
    this.loadingCounters.clear();
  }
}