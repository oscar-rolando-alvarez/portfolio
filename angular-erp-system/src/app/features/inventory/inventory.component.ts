import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { NotificationService } from '@core/services/notification.service';
import {
  DataTableComponent,
  TableAction,
  TableActionEvent,
  TableColumn,
} from '@shared/components/data-table/data-table.component';
import { InventoryService } from './inventory.service';
import { Product, ProductCategory, StockStatus, stockStatus } from './product.model';

type StatusFilter = 'all' | StockStatus;

const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
};

@Component({
  selector: 'app-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InventoryService],
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    DataTableComponent,
  ],
  template: `
    <header class="page-header">
      <div>
        <h1>Inventory</h1>
        <p>Track stock levels across warehouses and react to low-stock alerts.</p>
      </div>
      <button mat-flat-button type="button" (click)="showForm.set(!showForm())">
        <mat-icon>{{ showForm() ? 'close' : 'add' }}</mat-icon>
        {{ showForm() ? 'Cancel' : 'Add product' }}
      </button>
    </header>

    <section class="kpis" aria-label="Inventory KPIs">
      <mat-card appearance="outlined">
        <mat-card-content>
          <span class="kpi-label">Products</span>
          <span class="kpi-value" data-testid="kpi-products">{{ inventory.products.value().length }}</span>
        </mat-card-content>
      </mat-card>
      <mat-card appearance="outlined">
        <mat-card-content>
          <span class="kpi-label">Needs reorder</span>
          <span class="kpi-value warn" data-testid="kpi-low-stock">{{ inventory.lowStockCount() }}</span>
        </mat-card-content>
      </mat-card>
      <mat-card appearance="outlined">
        <mat-card-content>
          <span class="kpi-label">Stock value</span>
          <span class="kpi-value">{{ inventory.inventoryValue() | currency: 'USD' : 'symbol' : '1.0-0' }}</span>
        </mat-card-content>
      </mat-card>
    </section>

    @if (showForm()) {
      <mat-card appearance="outlined" class="new-product">
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="create()" class="form-grid">
            <mat-form-field>
              <mat-label>SKU</mat-label>
              <input matInput formControlName="sku" required />
            </mat-form-field>
            <mat-form-field class="wide">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" required />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Category</mat-label>
              <mat-select formControlName="category">
                @for (c of categories; track c) {
                  <mat-option [value]="c">{{ c }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Warehouse</mat-label>
              <input matInput formControlName="warehouse" required />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Quantity</mat-label>
              <input matInput type="number" min="0" formControlName="quantity" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Reorder point</mat-label>
              <input matInput type="number" min="0" formControlName="reorderPoint" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Unit cost (USD)</mat-label>
              <input matInput type="number" min="0" step="0.01" formControlName="unitCost" />
            </mat-form-field>
            <button mat-flat-button type="submit" [disabled]="form.invalid">Save</button>
          </form>
        </mat-card-content>
      </mat-card>
    }

    <section class="filters" aria-label="Filters">
      <mat-form-field class="search" subscriptSizing="dynamic">
        <mat-label>Search by SKU or name</mat-label>
        <input matInput [value]="query()" (input)="query.set($any($event.target).value)" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic" floatLabel="always">
        <mat-label>Category</mat-label>
        <mat-select [value]="category()" (valueChange)="category.set($event)">
          <mat-option value="all">All categories</mat-option>
          @for (c of categories; track c) {
            <mat-option [value]="c">{{ c }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-button-toggle-group
        [value]="status()"
        (change)="status.set($event.value)"
        aria-label="Stock status"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle value="all">All</mat-button-toggle>
        <mat-button-toggle value="low_stock">Low</mat-button-toggle>
        <mat-button-toggle value="out_of_stock">Out</mat-button-toggle>
      </mat-button-toggle-group>
    </section>

    @if (inventory.products.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (inventory.products.error()) {
      <p class="error" role="alert">Could not load products. Please try again.</p>
    }

    <app-data-table
      caption="Products"
      emptyMessage="No products match the current filters"
      [data]="filtered()"
      [columns]="columns"
      [actions]="actions"
      (actionClick)="onAction($event)"
    />
  `,
  styles: `
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
    }
    .page-header p {
      margin: 4px 0 0;
      opacity: 0.7;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin: 24px 0;
    }
    .kpis mat-card-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-label {
      font-size: 0.85rem;
      opacity: 0.7;
    }
    .kpi-value {
      font-size: 1.75rem;
      font-weight: 500;
    }
    .kpi-value.warn {
      color: var(--mat-sys-error);
    }
    .new-product {
      margin-bottom: 24px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0 16px;
      align-items: center;
    }
    .form-grid .wide {
      grid-column: span 2;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      margin-bottom: 16px;
    }
    .search {
      flex: 1 1 260px;
    }
    .error {
      color: var(--mat-sys-error);
    }
    :host ::ng-deep .status-low_stock {
      color: #b26a00;
      font-weight: 500;
    }
    :host ::ng-deep .status-out_of_stock {
      color: var(--mat-sys-error);
      font-weight: 500;
    }
  `,
})
export class InventoryComponent {
  protected readonly inventory = inject(InventoryService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly categories: ProductCategory[] = ['Hardware', 'Office', 'Packaging', 'Electronics', 'Furniture'];

  protected readonly query = signal('');
  protected readonly category = signal<'all' | ProductCategory>('all');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly showForm = signal(false);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const category = this.category();
    const status = this.status();
    return this.inventory.products.value().filter(
      (p) =>
        (!q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) &&
        (category === 'all' || p.category === category) &&
        (status === 'all' || stockStatus(p) === status),
    );
  });

  protected readonly columns: TableColumn<Product>[] = [
    { key: 'sku', label: 'SKU', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'warehouse', label: 'Warehouse', sortable: true },
    { key: 'quantity', label: 'Qty', sortable: true, type: 'number' },
    { key: 'unitCost', label: 'Unit cost', sortable: true, type: 'currency' },
    {
      key: 'reorderPoint',
      label: 'Status',
      format: (p) => STATUS_LABEL[stockStatus(p)],
      cellClass: (p) => `status-${stockStatus(p)}`,
    },
  ];

  protected readonly actions: TableAction<Product>[] = [
    { id: 'receive', label: 'Receive 10 units', icon: 'add_box' },
    { id: 'issue', label: 'Issue 1 unit', icon: 'outbox', disabled: (p) => p.quantity === 0 },
  ];

  protected readonly form = this.fb.group({
    sku: ['', [Validators.required, Validators.pattern(/^[A-Z]{2}-\d{4}$/)]],
    name: ['', Validators.required],
    category: this.fb.control<ProductCategory>('Hardware'),
    warehouse: ['Central', Validators.required],
    quantity: [0, [Validators.required, Validators.min(0)]],
    reorderPoint: [10, [Validators.required, Validators.min(0)]],
    unitCost: [1, [Validators.required, Validators.min(0)]],
  });

  protected onAction({ action, row }: TableActionEvent<Product>): void {
    const delta = action === 'receive' ? 10 : -1;
    this.inventory.adjustQuantity(row, delta).subscribe((updated) => {
      this.notifications.showSuccess(`${updated.sku} quantity is now ${updated.quantity}`, 'Stock updated', 3000);
    });
  }

  protected create(): void {
    if (this.form.invalid) {
      return;
    }
    this.inventory.create(this.form.getRawValue()).subscribe((created) => {
      this.notifications.showSuccess(`${created.name} added`, 'Product created', 3000);
      this.form.reset();
      this.showForm.set(false);
    });
  }
}
