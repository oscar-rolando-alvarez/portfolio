import { ApiResponse } from '@core/models/base.model';
import { environment } from '@environments/environment';

/** Builds a versioned API URL, e.g. `apiUrl('inventory/products')`. */
export function apiUrl(path: string): string {
  return `${environment.apiUrl}/${environment.apiVersion}/${path}`;
}

/** Unwraps the `{ success, data }` envelope used by every ERP endpoint. */
export function unwrap<T>(response: unknown): T {
  const envelope = response as ApiResponse<T>;
  if (!envelope?.success || envelope.data === undefined) {
    throw new Error(envelope?.message ?? 'Unexpected API response');
  }
  return envelope.data;
}
