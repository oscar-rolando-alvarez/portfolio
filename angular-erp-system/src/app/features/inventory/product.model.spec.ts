import { stockStatus } from './product.model';

describe('stockStatus', () => {
  it('reports out of stock when quantity is zero', () => {
    expect(stockStatus({ quantity: 0, reorderPoint: 5 })).toBe('out_of_stock');
  });

  it('reports low stock at or below the reorder point', () => {
    expect(stockStatus({ quantity: 5, reorderPoint: 5 })).toBe('low_stock');
    expect(stockStatus({ quantity: 1, reorderPoint: 5 })).toBe('low_stock');
  });

  it('reports in stock above the reorder point', () => {
    expect(stockStatus({ quantity: 6, reorderPoint: 5 })).toBe('in_stock');
  });
});
