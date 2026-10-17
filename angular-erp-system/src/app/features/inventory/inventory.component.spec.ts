import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';

import { apiUrl } from '@core/http/api';
import { DEMO_PRODUCTS } from '@core/mock/mock-data';
import { InventoryComponent } from './inventory.component';

describe('InventoryComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideMockStore()],
    });
    const fixture = TestBed.createComponent(InventoryComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne(apiUrl('inventory/products'))
      .flush({ success: true, data: DEMO_PRODUCTS, timestamp: new Date(), requestId: 'test' });
    await fixture.whenStable();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders KPIs computed from the loaded products', async () => {
    const { el } = await setup();
    const lowStock = DEMO_PRODUCTS.filter((p) => p.quantity <= p.reorderPoint).length;

    expect(el.querySelector('[data-testid="kpi-products"]')?.textContent?.trim()).toBe(String(DEMO_PRODUCTS.length));
    expect(el.querySelector('[data-testid="kpi-low-stock"]')?.textContent?.trim()).toBe(String(lowStock));
  });

  it('filters rows by the search query', async () => {
    const { fixture, el } = await setup();
    const input = el.querySelector<HTMLInputElement>('.search input')!;

    input.value = 'scanner';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('EL-4001');
  });

  it('patches the quantity when a row action is triggered', async () => {
    const { fixture, http } = await setup();
    const product = DEMO_PRODUCTS[0];

    // Invoke the handler directly; the Material menu itself is covered by Angular Material's own tests.
    (fixture.componentInstance as unknown as { onAction: (e: unknown) => void }).onAction({
      action: 'receive',
      row: product,
    });

    const req = http.expectOne(apiUrl(`inventory/products/${product.id}`));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ quantity: product.quantity + 10 });
    req.flush({ success: true, data: { ...product, quantity: product.quantity + 10 }, timestamp: new Date(), requestId: 't' });
  });
});
