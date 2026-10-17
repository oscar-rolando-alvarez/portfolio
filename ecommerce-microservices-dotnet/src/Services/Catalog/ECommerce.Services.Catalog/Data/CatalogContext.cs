using ECommerce.Services.Catalog.Models;
using MongoDB.Driver;

namespace ECommerce.Services.Catalog.Data;

public sealed class CatalogContext(IMongoDatabase database)
{
    public const string ProductsCollectionName = "products";

    public IMongoCollection<Product> Products { get; } = database.GetCollection<Product>(ProductsCollectionName);
}
