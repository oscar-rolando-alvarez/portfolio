import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';

import { LoadingService } from '@core/services/loading.service';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  // Skip loading for certain endpoints
  const skipLoadingEndpoints = [
    '/auth/validate',
    '/notifications',
    '/heartbeat',
    '/health'
  ];

  const shouldSkipLoading = skipLoadingEndpoints.some(endpoint => 
    req.url.includes(endpoint)
  );

  if (shouldSkipLoading) {
    return next(req);
  }

  // Generate a unique scope for this request
  const scope = `${req.method}-${req.url}-${Date.now()}`;
  
  // Show loading for this scope
  loadingService.showScoped(scope);

  return next(req).pipe(
    finalize(() => {
      // Hide loading when request completes (success or error)
      loadingService.hideScoped(scope);
    })
  );
};