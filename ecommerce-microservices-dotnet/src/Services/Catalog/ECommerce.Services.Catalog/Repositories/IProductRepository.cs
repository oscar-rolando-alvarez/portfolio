using ECommerce.Services.Catalog.Models;
using ECommerce.Shared.Common.Models;

namespace ECommerce.Services.Catalog.Repositories;

public interface IProductRepository
{
    Task<IEnumerable<Product>> GetProductsAsync();
    Task<Product?> GetProductAsync(Guid id);
    Task<Product?> GetProductBySkuAsync(string sku);
    Task<PagedResult<Product>> GetProductsPagedAsync(int pageNumber, int pageSize, string? category = null, string? searchTerm = null);
    Task<IEnumerable<Product>> GetProductsByCategoryAsync(string category);
    Task<IEnumerable<Product>> SearchProductsAsync(string searchTerm);
    Task<Product> CreateProductAsync(Product product);
    Task<bool> UpdateProductAsync(Product product);
    Task<bool> DeleteProductAsync(Guid id);
    Task<bool> UpdateStockAsync(Guid productId, int newStock);
}