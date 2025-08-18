import { Component, Input, Output, EventEmitter, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSortModule, MatSort, SortDirection } from '@angular/material/sort';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SelectionModel } from '@angular/cdk/collections';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  type?: 'text' | 'number' | 'date' | 'currency' | 'boolean' | 'actions';
  width?: string;
  sticky?: 'start' | 'end';
  format?: (value: any) => string;
}

export interface TableAction {
  label: string;
  icon: string;
  color?: 'primary' | 'accent' | 'warn';
  action: (row: any) => void;
  disabled?: (row: any) => boolean;
  visible?: (row: any) => boolean;
}

export interface TableConfig {
  pageSizeOptions: number[];
  defaultPageSize: number;
  showFirstLastButtons: boolean;
  enableSearch: boolean;
  enableSelection: boolean;
  enableActions: boolean;
  stickyHeader: boolean;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCheckboxModule,
    MatTooltipModule
  ],
  template: `
    <div class="data-table-container">
      <!-- Table Header -->
      <div class="table-header" *ngIf="config.enableSearch || enableBulkActions">
        <div class="search-container" *ngIf="config.enableSearch">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="searchControl" placeholder="Search...">
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
        </div>
        
        <div class="bulk-actions" *ngIf="enableBulkActions && selection.hasValue()">
          <span class="selection-count">{{ selection.selected.length }} selected</span>
          <button 
            mat-button 
            color="warn" 
            (click)="clearSelection()"
            matTooltip="Clear selection">
            <mat-icon>clear</mat-icon>
            Clear
          </button>
          <ng-content select="[slot=bulk-actions]"></ng-content>
        </div>
      </div>

      <!-- Table -->
      <div class="table-wrapper">
        <table 
          mat-table 
          [dataSource]="dataSource" 
          matSort 
          [matSortActive]="defaultSortColumn"
          [matSortDirection]="defaultSortDirection"
          class="data-table"
          [class.sticky-header]="config.stickyHeader">

          <!-- Selection Column -->
          <ng-container matColumnDef="select" *ngIf="config.enableSelection">
            <th mat-header-cell *matHeaderCellDef>
              <mat-checkbox 
                (change)="$event ? toggleAllRows() : null"
                [checked]="selection.hasValue() && isAllSelected()"
                [indeterminate]="selection.hasValue() && !isAllSelected()"
                [aria-label]="checkboxLabel()">
              </mat-checkbox>
            </th>
            <td mat-cell *matCellDef="let row">
              <mat-checkbox 
                (click)="$event.stopPropagation()"
                (change)="$event ? selection.toggle(row) : null"
                [checked]="selection.isSelected(row)"
                [aria-label]="checkboxLabel(row)">
              </mat-checkbox>
            </td>
          </ng-container>

          <!-- Data Columns -->
          <ng-container *ngFor="let column of columns" [matColumnDef]="column.key">
            <th 
              mat-header-cell 
              *matHeaderCellDef 
              [mat-sort-header]="column.sortable ? column.key : undefined"
              [style.width]="column.width"
              [class.sticky-start]="column.sticky === 'start'"
              [class.sticky-end]="column.sticky === 'end'">
              {{ column.label }}
            </th>
            <td 
              mat-cell 
              *matCellDef="let row" 
              [style.width]="column.width"
              [class.sticky-start]="column.sticky === 'start'"
              [class.sticky-end]="column.sticky === 'end'">
              
              <ng-container [ngSwitch]="column.type">
                <!-- Text -->
                <span *ngSwitchCase="'text'">
                  {{ column.format ? column.format(row[column.key]) : row[column.key] }}
                </span>
                
                <!-- Number -->
                <span *ngSwitchCase="'number'" class="number-cell">
                  {{ column.format ? column.format(row[column.key]) : (row[column.key] | number) }}
                </span>
                
                <!-- Date -->
                <span *ngSwitchCase="'date'">
                  {{ column.format ? column.format(row[column.key]) : (row[column.key] | date:'medium') }}
                </span>
                
                <!-- Currency -->
                <span *ngSwitchCase="'currency'" class="currency-cell">
                  {{ column.format ? column.format(row[column.key]) : (row[column.key] | currency) }}
                </span>
                
                <!-- Boolean -->
                <mat-icon *ngSwitchCase="'boolean'" [class.success-icon]="row[column.key]" [class.error-icon]="!row[column.key]">
                  {{ row[column.key] ? 'check_circle' : 'cancel' }}
                </mat-icon>
                
                <!-- Default -->
                <span *ngSwitchDefault>
                  {{ column.format ? column.format(row[column.key]) : row[column.key] }}
                </span>
              </ng-container>
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions" *ngIf="config.enableActions && actions.length > 0">
            <th mat-header-cell *matHeaderCellDef class="actions-header">Actions</th>
            <td mat-cell *matCellDef="let row" class="actions-cell">
              <button 
                mat-icon-button 
                [matMenuTriggerFor]="actionMenu"
                matTooltip="Actions"
                class="action-menu-trigger">
                <mat-icon>more_vert</mat-icon>
              </button>
              
              <mat-menu #actionMenu="matMenu">
                <button 
                  mat-menu-item 
                  *ngFor="let action of getVisibleActions(row)"
                  [disabled]="action.disabled ? action.disabled(row) : false"
                  (click)="action.action(row)">
                  <mat-icon [color]="action.color">{{ action.icon }}</mat-icon>
                  <span>{{ action.label }}</span>
                </button>
              </mat-menu>
            </td>
          </ng-container>

          <!-- No Data Row -->
          <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: config.stickyHeader"></tr>
          <tr 
            mat-row 
            *matRowDef="let row; columns: displayedColumns;" 
            (click)="onRowClick(row)"
            [class.clickable]="!!rowClick.observers.length"
            [class.selected]="selection.isSelected(row)">
          </tr>
          
          <!-- No data message -->
          <tr class="no-data-row" *matNoDataRow>
            <td [attr.colspan]="displayedColumns.length" class="no-data-cell">
              <div class="no-data-content">
                <mat-icon>inbox</mat-icon>
                <p>No data available</p>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Paginator -->
      <mat-paginator 
        [pageSizeOptions]="config.pageSizeOptions"
        [pageSize]="config.defaultPageSize"
        [showFirstLastButtons]="config.showFirstLastButtons"
        (page)="onPageChange($event)">
      </mat-paginator>
    </div>
  `,
  styles: [`
    .data-table-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .search-container {
      flex: 1;
      max-width: 400px;
    }

    .search-field {
      width: 100%;
    }

    .bulk-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .selection-count {
      font-size: 0.875rem;
      color: rgba(0, 0, 0, 0.6);
      font-weight: 500;
    }

    .table-wrapper {
      overflow: auto;
      max-height: 70vh;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
    }

    .data-table {
      width: 100%;
      background: white;
    }

    :host-context(.dark-theme) .data-table {
      background: #424242;
    }

    .sticky-header .mat-mdc-header-row {
      position: sticky;
      top: 0;
      z-index: 10;
      background: inherit;
    }

    .sticky-start {
      position: sticky;
      left: 0;
      z-index: 5;
      background: inherit;
    }

    .sticky-end {
      position: sticky;
      right: 0;
      z-index: 5;
      background: inherit;
    }

    .mat-mdc-row:hover {
      background-color: rgba(0, 0, 0, 0.04);
    }

    :host-context(.dark-theme) .mat-mdc-row:hover {
      background-color: rgba(255, 255, 255, 0.04);
    }

    .mat-mdc-row.clickable {
      cursor: pointer;
    }

    .mat-mdc-row.selected {
      background-color: rgba(25, 118, 210, 0.1);
    }

    .number-cell {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .currency-cell {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }

    .success-icon {
      color: #4caf50;
    }

    .error-icon {
      color: #f44336;
    }

    .actions-header {
      text-align: center;
      width: 80px;
    }

    .actions-cell {
      text-align: center;
      width: 80px;
    }

    .action-menu-trigger {
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .mat-mdc-row:hover .action-menu-trigger {
      opacity: 1;
    }

    .no-data-row {
      height: 200px;
    }

    .no-data-cell {
      text-align: center;
      padding: 40px;
    }

    .no-data-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      color: rgba(0, 0, 0, 0.6);
    }

    .no-data-content mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      opacity: 0.5;
    }

    :host-context(.dark-theme) .no-data-content {
      color: rgba(255, 255, 255, 0.6);
    }

    @media (max-width: 768px) {
      .table-header {
        flex-direction: column;
        align-items: stretch;
      }

      .search-container {
        max-width: none;
      }

      .bulk-actions {
        justify-content: center;
      }

      .table-wrapper {
        max-height: 60vh;
      }
    }
  `]
})
export class DataTableComponent implements OnInit, OnDestroy {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() actions: TableAction[] = [];
  @Input() config: TableConfig = {
    pageSizeOptions: [5, 10, 25, 50, 100],
    defaultPageSize: 10,
    showFirstLastButtons: true,
    enableSearch: true,
    enableSelection: false,
    enableActions: true,
    stickyHeader: true
  };
  @Input() defaultSortColumn = '';
  @Input() defaultSortDirection: SortDirection = 'asc';
  @Input() enableBulkActions = false;

  @Output() rowClick = new EventEmitter<any>();
  @Output() pageChange = new EventEmitter<PageEvent>();
  @Output() sortChange = new EventEmitter<{ active: string; direction: SortDirection }>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() selectionChange = new EventEmitter<any[]>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  dataSource = new MatTableDataSource<any>();
  selection = new SelectionModel<any>(true, []);
  searchControl = new FormControl('');
  
  private destroy$ = new Subject<void>();

  get displayedColumns(): string[] {
    const columns: string[] = [];
    
    if (this.config.enableSelection) {
      columns.push('select');
    }
    
    columns.push(...this.columns.map(col => col.key));
    
    if (this.config.enableActions && this.actions.length > 0) {
      columns.push('actions');
    }
    
    return columns;
  }

  ngOnInit(): void {
    this.dataSource.data = this.data;
    
    // Setup search
    if (this.config.enableSearch) {
      this.searchControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      ).subscribe(searchValue => {
        this.dataSource.filter = (searchValue || '').trim().toLowerCase();
        this.searchChange.emit(searchValue || '');
      });
    }
    
    // Setup selection changes
    this.selection.changed.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.selectionChange.emit(this.selection.selected);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    
    // Custom sort accessor for complex data
    this.dataSource.sortingDataAccessor = (data, sortHeaderId) => {
      const column = this.columns.find(col => col.key === sortHeaderId);
      if (column?.format) {
        return column.format(data[sortHeaderId]);
      }
      return data[sortHeaderId];
    };
    
    // Custom filter predicate
    this.dataSource.filterPredicate = (data, filter) => {
      const searchStr = filter.toLowerCase();
      return this.columns.some(column => {
        const value = data[column.key];
        if (value === null || value === undefined) return false;
        return value.toString().toLowerCase().includes(searchStr);
      });
    };
  }

  onRowClick(row: any): void {
    this.rowClick.emit(row);
  }

  onPageChange(event: PageEvent): void {
    this.pageChange.emit(event);
  }

  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  toggleAllRows(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.dataSource.data.forEach(row => this.selection.select(row));
    }
  }

  clearSelection(): void {
    this.selection.clear();
  }

  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row`;
  }

  getVisibleActions(row: any): TableAction[] {
    return this.actions.filter(action => 
      !action.visible || action.visible(row)
    );
  }
}