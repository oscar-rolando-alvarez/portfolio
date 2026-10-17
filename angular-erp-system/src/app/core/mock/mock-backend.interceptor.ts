import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import type { Notification } from '@core/models/base.model';
import { User } from '@core/models/user.model';
import { Product, stockStatus } from '@features/inventory/product.model';
import { DEMO_NOTIFICATIONS, DEMO_PASSWORD, DEMO_PRODUCTS, DEMO_USERS } from './mock-data';

const LATENCY_MS = 200;
const TOKEN_PREFIX = 'demo-token.';

/** In-memory data store backing the demo API. One instance per injector, so tests stay isolated. */
@Injectable({ providedIn: 'root' })
export class MockDatabase {
  readonly users: User[] = structuredClone(DEMO_USERS);
  products: Product[] = structuredClone(DEMO_PRODUCTS);
  notifications: Notification[] = structuredClone(DEMO_NOTIFICATIONS);
  private sequence = 100;

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  issueToken(user: User): string {
    return `${TOKEN_PREFIX}${user.id}.${Date.now()}`;
  }

  userFromToken(authorization: string | null): User | undefined {
    const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!token.startsWith(TOKEN_PREFIX)) {
      return undefined;
    }
    const userId = token.slice(TOKEN_PREFIX.length).split('.')[0];
    return this.users.find((u) => u.id === userId);
  }
}

function ok<T>(data: T, status = 200): Observable<HttpResponse<unknown>> {
  const body = { success: true, data, timestamp: new Date(), requestId: crypto.randomUUID() };
  return of(new HttpResponse({ status, body })).pipe(delay(LATENCY_MS));
}

function fail(status: number, message: string, url: string): Observable<never> {
  return throwError(
    () => new HttpErrorResponse({ status, url, error: { success: false, message } }),
  );
}

/**
 * Functional interceptor that emulates the ERP REST API entirely in the browser.
 * Enabled through `environment.enableMocking`; unknown URLs are passed through
 * untouched so a real backend can be introduced endpoint by endpoint.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const match = /\/api\/v\d+\/(.+?)(\?.*)?$/.exec(req.url);
  if (!match) {
    return next(req);
  }
  const db = inject(MockDatabase);
  return handle(db, req, match[1]) ?? next(req);
};

function handle(
  db: MockDatabase,
  req: HttpRequest<unknown>,
  path: string,
): Observable<HttpResponse<unknown>> | null {
  const method = req.method;
  const isPublic = path === 'auth/login' || path === 'auth/refresh';
  const user = db.userFromToken(req.headers.get('Authorization'));

  if (!isPublic && !user && path !== 'auth/validate') {
    return fail(401, 'Not authenticated', req.url);
  }

  switch (`${method} ${path}`) {
    case 'POST auth/login': {
      const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
      const found = db.users.find((u) => u.email.toLowerCase() === email?.toLowerCase());
      if (!found || password !== DEMO_PASSWORD) {
        return fail(400, 'Invalid email or password', req.url);
      }
      return ok({
        user: found,
        token: db.issueToken(found),
        refreshToken: db.issueToken(found),
        expiresIn: 3_600_000,
      });
    }
    case 'POST auth/refresh': {
      const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
      const owner = db.userFromToken(refreshToken ? `Bearer ${refreshToken}` : null);
      return owner
        ? ok({
            token: db.issueToken(owner),
            refreshToken: db.issueToken(owner),
            expiresIn: 3_600_000,
          })
        : fail(401, 'Invalid refresh token', req.url);
    }
    case 'GET auth/validate':
      return ok({ valid: !!user });
    case 'GET auth/me':
      return ok(user);
    case 'POST auth/logout':
      return ok(null);
    case 'GET notifications':
      return ok({
        data: db.notifications,
        pagination: {
          page: 1,
          limit: 50,
          total: db.notifications.length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    case 'PATCH notifications/mark-all-read':
      db.notifications = db.notifications.map((n) => ({ ...n, isRead: true }));
      return ok(null);
    case 'GET inventory/products':
      return ok(db.products);
    case 'POST inventory/products': {
      const input = req.body as Omit<Product, 'id' | 'updatedAt'>;
      const product: Product = {
        ...input,
        id: db.nextId('p'),
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      db.products = [...db.products, product];
      return ok(product, 201);
    }
    case 'GET dashboard/summary': {
      const lowStock = db.products.filter((p) => stockStatus(p) !== 'in_stock').length;
      const inventoryValue = db.products.reduce((sum, p) => sum + p.quantity * p.unitCost, 0);
      return ok({
        products: db.products.length,
        lowStock,
        inventoryValue: Math.round(inventoryValue),
        unreadNotifications: db.notifications.filter((n) => !n.isRead).length,
      });
    }
  }

  const adjust = /^inventory\/products\/([\w-]+)$/.exec(path);
  if (adjust && method === 'PATCH') {
    const { quantity } = req.body as { quantity: number };
    const existing = db.products.find((p) => p.id === adjust[1]);
    if (!existing) {
      return fail(404, 'Product not found', req.url);
    }
    const updated = { ...existing, quantity, updatedAt: new Date().toISOString().slice(0, 10) };
    db.products = db.products.map((p) => (p.id === updated.id ? updated : p));
    return ok(updated);
  }

  const read = /^notifications\/([\w-]+)\/read$/.exec(path);
  if (read && method === 'PATCH') {
    db.notifications = db.notifications.map((n) => (n.id === read[1] ? { ...n, isRead: true } : n));
    return ok(null);
  }

  return null;
}
