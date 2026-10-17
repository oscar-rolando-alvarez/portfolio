export type ProductCategory = 'Hardware' | 'Office' | 'Packaging' | 'Electronics' | 'Furniture';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  warehouse: string;
  quantity: number;
  reorderPoint: number;
  unitCost: number;
  updatedAt: string;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function stockStatus(product: Pick<Product, 'quantity' | 'reorderPoint'>): StockStatus {
  if (product.quantity <= 0) {
    return 'out_of_stock';
  }
  return product.quantity <= product.reorderPoint ? 'low_stock' : 'in_stock';
}
