import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { apiUrl, unwrap } from '@core/http/api';
import { Product, stockStatus } from './product.model';

export type NewProduct = Omit<Product, 'id' | 'updatedAt'>;

/**
 * Signal-based inventory store. Reads go through `httpResource` (reactive, cancellable);
 * writes use HttpClient and patch the resource value locally for instant feedback.
 * Provided at the route component so data is fresh on every visit.
 */
@Injectable()
export class InventoryService {
  private readonly http = inject(HttpClient);

  readonly products = httpResource<Product[]>(() => apiUrl('inventory/products'), {
    parse: (raw) => unwrap<Product[]>(raw),
    defaultValue: [],
  });

  readonly lowStockCount = computed(
    () => this.products.value().filter((p) => stockStatus(p) !== 'in_stock').length,
  );

  readonly inventoryValue = computed(() =>
    this.products.value().reduce((sum, p) => sum + p.quantity * p.unitCost, 0),
  );

  create(product: NewProduct): Observable<Product> {
    return this.http.post(apiUrl('inventory/products'), product).pipe(
      map((raw) => unwrap<Product>(raw)),
      tap((created) => this.products.update((list) => [...list, created])),
    );
  }

  adjustQuantity(product: Product, delta: number): Observable<Product> {
    const quantity = Math.max(0, product.quantity + delta);
    return this.http.patch(apiUrl(`inventory/products/${product.id}`), { quantity }).pipe(
      map((raw) => unwrap<Product>(raw)),
      tap((updated) =>
        this.products.update((list) => list.map((p) => (p.id === updated.id ? updated : p))),
      ),
    );
  }
}
