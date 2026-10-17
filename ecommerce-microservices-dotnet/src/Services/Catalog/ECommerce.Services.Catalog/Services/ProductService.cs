using ECommerce.Services.Catalog.Models;
using ECommerce.Services.Catalog.Repositories;
using ECommerce.Shared.Contracts;
using ECommerce.Shared.Contracts.Catalog;

namespace ECommerce.Services.Catalog.Services;

public interface IProductService
{
    Task<PagedResult<ProductDto>> GetProductsAsync(int pageNumber, int pageSize, string? category, string? searchTerm, CancellationToken cancellationToken = default);

    Task<ProductDto?> GetProductAsync(Guid id, CancellationToken cancellationToken = default);

    Task<ProductDto?> GetProductBySkuAsync(string sku, CancellationToken cancellationToken = default);

    Task<ProductDto> CreateProductAsync(CreateProductRequest request, CancellationToken cancellationToken = default);

    Task<ProductDto?> UpdateProductAsync(Guid id, UpdateProductRequest request, CancellationToken cancellationToken = default);

    Task<bool> DeleteProductAsync(Guid id, CancellationToken cancellationToken = default);

    Task<bool> UpdateStockAsync(Guid id, int newStock, CancellationToken cancellationToken = default);
}

public sealed class DuplicateSkuException(string sku)
    : InvalidOperationException($"A product with SKU '{sku}' already exists.");

public sealed partial class ProductService(IProductRepository repository, ILogger<ProductService> logger) : IProductService
{
    public const int MaxPageSize = 100;

    public async Task<PagedResult<ProductDto>> GetProductsAsync(
        int pageNumber, int pageSize, string? category, string? searchTerm, CancellationToken cancellationToken = default)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var (items, total) = await repository.GetPageAsync(pageNumber, pageSize, category, searchTerm, cancellationToken);
        return new PagedResult<ProductDto>([.. items.Select(p => p.ToDto())], total, pageNumber, pageSize);
    }

    public async Task<ProductDto?> GetProductAsync(Guid id, CancellationToken cancellationToken = default) =>
        (await repository.GetAsync(id, cancellationToken))?.ToDto();

    public async Task<ProductDto?> GetProductBySkuAsync(string sku, CancellationToken cancellationToken = default)
    {
        var product = await repository.GetBySkuAsync(sku, cancellationToken);
        return product is { IsActive: true } ? product.ToDto() : null;
    }

    public async Task<ProductDto> CreateProductAsync(CreateProductRequest request, CancellationToken cancellationToken = default)
    {
        if (await repository.GetBySkuAsync(request.Sku, cancellationToken) is not null)
        {
            throw new DuplicateSkuException(request.Sku);
        }

        var product = new Product
        {
            Name = request.Name.Trim(),
            Description = request.Description.Trim(),
            Price = request.Price,
            Category = request.Category.Trim(),
            ImageUrl = request.ImageUrl,
            Sku = request.Sku.Trim().ToUpperInvariant(),
            StockQuantity = request.StockQuantity,
            Tags = NormalizeTags(request.Tags),
        };

        await repository.CreateAsync(product, cancellationToken);
        LogProductCreated(logger, product.Id, product.Sku);
        return product.ToDto();
    }

    public async Task<ProductDto?> UpdateProductAsync(Guid id, UpdateProductRequest request, CancellationToken cancellationToken = default)
    {
        var product = await repository.GetAsync(id, cancellationToken);
        if (product is null)
        {
            return null;
        }

        product.Name = request.Name.Trim();
        product.Description = request.Description.Trim();
        product.Price = request.Price;
        product.Category = request.Category.Trim();
        product.ImageUrl = request.ImageUrl;
        product.StockQuantity = request.StockQuantity;
        if (request.Tags is not null)
        {
            product.Tags = NormalizeTags(request.Tags);
        }

        return await repository.ReplaceAsync(product, cancellationToken) ? product.ToDto() : null;
    }

    public Task<bool> DeleteProductAsync(Guid id, CancellationToken cancellationToken = default) =>
        repository.DeactivateAsync(id, cancellationToken);

    public Task<bool> UpdateStockAsync(Guid id, int newStock, CancellationToken cancellationToken = default)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(newStock);
        return repository.UpdateStockAsync(id, newStock, cancellationToken);
    }

    private static List<string> NormalizeTags(IReadOnlyList<string>? tags) =>
        tags is null
            ? []
            : [.. tags.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim().ToLowerInvariant()).Distinct()];

    [LoggerMessage(Level = LogLevel.Information, Message = "Product {ProductId} created with SKU {Sku}")]
    private static partial void LogProductCreated(ILogger logger, Guid productId, string sku);
}

public static class ProductMappings
{
    public static ProductDto ToDto(this Product product) => new(
        product.Id,
        product.Name,
        product.Description,
        product.Price,
        product.Category,
        product.ImageUrl,
        product.Sku,
        product.StockQuantity,
        product.IsActive,
        product.Tags,
        product.CreatedAt,
        product.UpdatedAt);
}
