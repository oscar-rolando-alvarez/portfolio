import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';

import { LoadingService } from '@core/services/loading.service';

const SILENT_ENDPOINTS = ['/auth/validate', '/notifications', '/health'];

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (SILENT_ENDPOINTS.some((endpoint) => req.url.includes(endpoint))) {
    return next(req);
  }

  const loading = inject(LoadingService);
  loading.start();
  return next(req).pipe(finalize(() => loading.stop()));
};
