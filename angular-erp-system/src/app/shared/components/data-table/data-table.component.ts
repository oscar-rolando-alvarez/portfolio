import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';

export type Row = Record<string, unknown>;

export interface TableColumn<T extends object = Row> {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  type?: 'text' | 'number' | 'date' | 'currency';
  /** Optional custom formatter; takes precedence over `type`. */
  format?: (row: T) => string;
  /** Optional CSS class resolver for the cell, e.g. to colour status chips. */
  cellClass?: (row: T) => string;
}

export interface TableAction<T extends object = Row> {
  id: string;
  label: string;
  icon: string;
  disabled?: (row: T) => boolean;
}

export interface TableActionEvent<T extends object = Row> {
  action: string;
  row: T;
}

/**
 * Generic, signal-driven Material table with sorting, pagination and a row action menu.
 * Filtering is intentionally left to the parent (usually a `computed()`), keeping this component dumb.
 */
@Component({
  selector: 'app-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
  ],
  template: `
    <div class="table-wrapper">
      <table mat-table [dataSource]="dataSource" matSort [attr.aria-label]="caption()">
        @for (column of columns(); track column.key) {
          <ng-container [matColumnDef]="column.key">
            <th mat-header-cell *matHeaderCellDef mat-sort-header [disabled]="!column.sortable">
              {{ column.label }}
            </th>
            <td mat-cell *matCellDef="let row" [class]="column.cellClass?.(row) ?? ''">
              @if (column.format) {
                {{ column.format(row) }}
              } @else {
                @switch (column.type) {
                  @case ('number') {
                    <span class="numeric">{{ $any(row)[column.key] | number }}</span>
                  }
                  @case ('currency') {
                    <span class="numeric">{{ $any(row)[column.key] | currency }}</span>
                  }
                  @case ('date') {
                    {{ $any(row)[column.key] | date: 'mediumDate' }}
                  }
                  @default {
                    {{ $any(row)[column.key] }}
                  }
                }
              }
            </td>
          </ng-container>
        }

        @if (actions().length > 0) {
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
            <td mat-cell *matCellDef="let row" class="actions-cell">
              <button
                mat-icon-button
                type="button"
                [matMenuTriggerFor]="menu"
                aria-label="Row actions"
              >
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #menu="matMenu">
                @for (action of actions(); track action.id) {
                  <button
                    mat-menu-item
                    type="button"
                    [disabled]="action.disabled?.(row) ?? false"
                    (click)="actionClick.emit({ action: action.id, row })"
                  >
                    <mat-icon>{{ action.icon }}</mat-icon>
                    <span>{{ action.label }}</span>
                  </button>
                }
              </mat-menu>
            </td>
          </ng-container>
        }

        <tr mat-header-row *matHeaderRowDef="displayedColumns(); sticky: true"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns()"></tr>
        <tr class="mat-row" *matNoDataRow>
          <td class="no-data" [attr.colspan]="displayedColumns().length">{{ emptyMessage() }}</td>
        </tr>
      </table>
    </div>
    <mat-paginator [pageSizeOptions]="[5, 10, 25]" [pageSize]="pageSize()" showFirstLastButtons />
  `,
  styles: `
    .table-wrapper {
      overflow: auto;
    }
    table {
      width: 100%;
    }
    .numeric {
      font-variant-numeric: tabular-nums;
    }
    .actions-cell {
      width: 56px;
      text-align: right;
    }
    .no-data {
      padding: 24px;
      text-align: center;
      opacity: 0.7;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class DataTableComponent<T extends object = Row> {
  readonly data = input.required<readonly T[]>();
  readonly columns = input.required<TableColumn<T>[]>();
  readonly actions = input<TableAction<T>[]>([]);
  readonly caption = input('Data table');
  readonly emptyMessage = input('No data available');
  readonly pageSize = input(10);

  readonly actionClick = output<TableActionEvent<T>>();

  private readonly paginator = viewChild.required(MatPaginator);
  private readonly sort = viewChild.required(MatSort);

  protected readonly dataSource = new MatTableDataSource<T>([]);

  protected readonly displayedColumns = computed(() => {
    const keys: string[] = this.columns().map((c) => c.key);
    return this.actions().length > 0 ? [...keys, 'actions'] : keys;
  });

  constructor() {
    effect(() => {
      this.dataSource.data = [...this.data()];
    });
    effect(() => {
      this.dataSource.paginator = this.paginator();
      this.dataSource.sort = this.sort();
    });
  }
}
