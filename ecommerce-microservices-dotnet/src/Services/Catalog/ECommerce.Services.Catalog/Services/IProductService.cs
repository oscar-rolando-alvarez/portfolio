using ECommerce.Shared.Common.Models;
using ECommerce.Shared.Contracts.Catalog;

namespace ECommerce.Services.Catalog.Services;

public interface IProductService
{
    Task<PagedResult<ProductDto>> GetProductsAsync(int pageNumber, int pageSize, string? category = null, string? searchTerm = null);
    Task<ProductDto?> GetProductByIdAsync(Guid id);
    Task<ProductDto?> GetProductBySkuAsync(string sku);
    Task<IEnumerable<ProductDto>> GetProductsByCategoryAsync(string category);
    Task<IEnumerable<ProductDto>> SearchProductsAsync(string searchTerm);
    Task<ProductDto> CreateProductAsync(CreateProductRequest request);
    Task<ProductDto?> UpdateProductAsync(Guid id, UpdateProductRequest request);
    Task<bool> DeleteProductAsync(Guid id);
    Task<bool> UpdateStockAsync(Guid productId, int newStock);
}