import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { apiUrl } from '@core/http/api';
import { Product } from '@features/inventory/product.model';
import { mockBackendInterceptor } from './mock-backend.interceptor';
import { DEMO_PASSWORD } from './mock-data';

interface Envelope<T> {
  success: boolean;
  data: T;
}

describe('mockBackendInterceptor', () => {
  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockBackendInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
  });

  async function login(email = 'admin@erp.local', password = DEMO_PASSWORD): Promise<string> {
    const res = await firstValueFrom(
      http.post<Envelope<{ token: string }>>(apiUrl('auth/login'), { email, password }),
    );
    return res.data.token;
  }

  it('issues a token for valid demo credentials', async () => {
    const token = await login();
    expect(token).toMatch(/^demo-token\./);
  });

  it('rejects invalid credentials with 400', async () => {
    const error = await firstValueFrom(
      http.post(apiUrl('auth/login'), { email: 'admin@erp.local', password: 'wrong-password' }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(400);
  });

  it('requires a token for protected endpoints', async () => {
    const error = await firstValueFrom(http.get(apiUrl('inventory/products'))).catch((e: unknown) => e);
    expect((error as HttpErrorResponse).status).toBe(401);
  });

  it('lists products and persists quantity adjustments', async () => {
    const headers = { Authorization: `Bearer ${await login()}` };
    const list = await firstValueFrom(http.get<Envelope<Product[]>>(apiUrl('inventory/products'), { headers }));
    const first = list.data[0];

    await firstValueFrom(
      http.patch(apiUrl(`inventory/products/${first.id}`), { quantity: first.quantity + 5 }, { headers }),
    );

    const after = await firstValueFrom(http.get<Envelope<Product[]>>(apiUrl('inventory/products'), { headers }));
    expect(after.data[0].quantity).toBe(first.quantity + 5);
  });

  it('passes through requests outside the API namespace', async () => {
    const response = firstValueFrom(http.get('/assets/config.json'));
    TestBed.inject(HttpTestingController).expectOne('/assets/config.json').flush({ ok: true });
    expect(await response).toEqual({ ok: true });
  });
});
