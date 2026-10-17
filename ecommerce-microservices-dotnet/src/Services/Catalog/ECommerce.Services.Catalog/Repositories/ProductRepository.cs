using System.Text.RegularExpressions;
using ECommerce.Services.Catalog.Data;
using ECommerce.Services.Catalog.Models;
using ECommerce.Services.Catalog.Services;
using MongoDB.Bson;
using MongoDB.Driver;

namespace ECommerce.Services.Catalog.Repositories;

public interface IProductRepository
{
    Task<Product?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    Task<Product?> GetBySkuAsync(string sku, CancellationToken cancellationToken = default);

    Task<(IReadOnlyList<Product> Items, long TotalCount)> GetPageAsync(
        int pageNumber, int pageSize, string? category, string? searchTerm, CancellationToken cancellationToken = default);

    Task CreateAsync(Product product, CancellationToken cancellationToken = default);

    Task<bool> ReplaceAsync(Product product, CancellationToken cancellationToken = default);

    Task<bool> DeactivateAsync(Guid id, CancellationToken cancellationToken = default);

    Task<bool> UpdateStockAsync(Guid id, int newStock, CancellationToken cancellationToken = default);
}

public sealed class ProductRepository(CatalogContext context) : IProductRepository
{
    private static readonly FilterDefinitionBuilder<Product> Filter = Builders<Product>.Filter;

    public async Task<Product?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        await context.Products.Find(p => p.Id == id && p.IsActive).FirstOrDefaultAsync(cancellationToken);

    public async Task<Product?> GetBySkuAsync(string sku, CancellationToken cancellationToken = default) =>
        await context.Products.Find(p => p.Sku == sku).FirstOrDefaultAsync(cancellationToken);

    public async Task<(IReadOnlyList<Product> Items, long TotalCount)> GetPageAsync(
        int pageNumber, int pageSize, string? category, string? searchTerm, CancellationToken cancellationToken = default)
    {
        var filter = Filter.Eq(p => p.IsActive, true);

        if (!string.IsNullOrWhiteSpace(category))
        {
            filter &= Filter.Eq(p => p.Category, category);
        }

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            // Escape user input so it is matched literally (no regex injection / ReDoS).
            var pattern = new BsonRegularExpression(Regex.Escape(searchTerm.Trim()), "i");
            filter &= Filter.Or(
                Filter.Regex(p => p.Name, pattern),
                Filter.Regex(p => p.Description, pattern),
                Filter.AnyEq(p => p.Tags, searchTerm.Trim().ToLowerInvariant()));
        }

        var totalCount = await context.Products.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var items = await context.Products
            .Find(filter)
            .SortBy(p => p.Name)
            .Skip((pageNumber - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task CreateAsync(Product product, CancellationToken cancellationToken = default)
    {
        try
        {
            await context.Products.InsertOneAsync(product, cancellationToken: cancellationToken);
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // The unique SKU index is the source of truth when two requests race.
            throw new DuplicateSkuException(product.Sku);
        }
    }

    public async Task<bool> ReplaceAsync(Product product, CancellationToken cancellationToken = default)
    {
        product.UpdatedAt = DateTime.UtcNow;
        var result = await context.Products.ReplaceOneAsync(p => p.Id == product.Id, product, cancellationToken: cancellationToken);
        return result.IsAcknowledged && result.MatchedCount > 0;
    }

    public async Task<bool> DeactivateAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var update = Builders<Product>.Update
            .Set(p => p.IsActive, false)
            .Set(p => p.UpdatedAt, DateTime.UtcNow);

        var result = await context.Products.UpdateOneAsync(p => p.Id == id && p.IsActive, update, cancellationToken: cancellationToken);
        return result.IsAcknowledged && result.MatchedCount > 0;
    }

    public async Task<bool> UpdateStockAsync(Guid id, int newStock, CancellationToken cancellationToken = default)
    {
        var update = Builders<Product>.Update
            .Set(p => p.StockQuantity, newStock)
            .Set(p => p.UpdatedAt, DateTime.UtcNow);

        var result = await context.Products.UpdateOneAsync(p => p.Id == id && p.IsActive, update, cancellationToken: cancellationToken);
        return result.IsAcknowledged && result.MatchedCount > 0;
    }
}
