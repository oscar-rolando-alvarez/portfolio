using ECommerce.Services.Catalog.Data;
using ECommerce.Services.Catalog.Models;
using ECommerce.Shared.Common.Models;
using MongoDB.Driver;

namespace ECommerce.Services.Catalog.Repositories;

public class ProductRepository : IProductRepository
{
    private readonly ICatalogContext _context;

    public ProductRepository(ICatalogContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Product>> GetProductsAsync()
    {
        return await _context.Products
            .Find(p => p.IsActive)
            .ToListAsync();
    }

    public async Task<Product?> GetProductAsync(Guid id)
    {
        return await _context.Products
            .Find(p => p.Id == id && p.IsActive)
            .FirstOrDefaultAsync();
    }

    public async Task<Product?> GetProductBySkuAsync(string sku)
    {
        return await _context.Products
            .Find(p => p.Sku == sku && p.IsActive)
            .FirstOrDefaultAsync();
    }

    public async Task<PagedResult<Product>> GetProductsPagedAsync(int pageNumber, int pageSize, string? category = null, string? searchTerm = null)
    {
        var filterBuilder = Builders<Product>.Filter;
        var filter = filterBuilder.Eq(p => p.IsActive, true);

        if (!string.IsNullOrEmpty(category))
        {
            filter = filterBuilder.And(filter, filterBuilder.Eq(p => p.Category, category));
        }

        if (!string.IsNullOrEmpty(searchTerm))
        {
            var searchFilter = filterBuilder.Or(
                filterBuilder.Regex(p => p.Name, new MongoDB.Bson.BsonRegularExpression(searchTerm, "i")),
                filterBuilder.Regex(p => p.Description, new MongoDB.Bson.BsonRegularExpression(searchTerm, "i"))
            );
            filter = filterBuilder.And(filter, searchFilter);
        }

        var totalCount = await _context.Products.CountDocumentsAsync(filter);
        var items = await _context.Products
            .Find(filter)
            .Skip((pageNumber - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync();

        return new PagedResult<Product>(items, (int)totalCount, pageNumber, pageSize);
    }

    public async Task<IEnumerable<Product>> GetProductsByCategoryAsync(string category)
    {
        return await _context.Products
            .Find(p => p.Category == category && p.IsActive)
            .ToListAsync();
    }

    public async Task<IEnumerable<Product>> SearchProductsAsync(string searchTerm)
    {
        var filter = Builders<Product>.Filter.And(
            Builders<Product>.Filter.Eq(p => p.IsActive, true),
            Builders<Product>.Filter.Or(
                Builders<Product>.Filter.Regex(p => p.Name, new MongoDB.Bson.BsonRegularExpression(searchTerm, "i")),
                Builders<Product>.Filter.Regex(p => p.Description, new MongoDB.Bson.BsonRegularExpression(searchTerm, "i")),
                Builders<Product>.Filter.AnyIn(p => p.Tags, new[] { searchTerm })
            )
        );

        return await _context.Products
            .Find(filter)
            .ToListAsync();
    }

    public async Task<Product> CreateProductAsync(Product product)
    {
        product.CreatedAt = DateTime.UtcNow;
        await _context.Products.InsertOneAsync(product);
        return product;
    }

    public async Task<bool> UpdateProductAsync(Product product)
    {
        product.UpdatedAt = DateTime.UtcNow;
        var result = await _context.Products
            .ReplaceOneAsync(p => p.Id == product.Id, product);
        return result.IsAcknowledged && result.ModifiedCount > 0;
    }

    public async Task<bool> DeleteProductAsync(Guid id)
    {
        var update = Builders<Product>.Update
            .Set(p => p.IsActive, false)
            .Set(p => p.UpdatedAt, DateTime.UtcNow);

        var result = await _context.Products
            .UpdateOneAsync(p => p.Id == id, update);
        return result.IsAcknowledged && result.ModifiedCount > 0;
    }

    public async Task<bool> UpdateStockAsync(Guid productId, int newStock)
    {
        var update = Builders<Product>.Update
            .Set(p => p.StockQuantity, newStock)
            .Set(p => p.UpdatedAt, DateTime.UtcNow);

        var result = await _context.Products
            .UpdateOneAsync(p => p.Id == productId, update);
        return result.IsAcknowledged && result.ModifiedCount > 0;
    }
}