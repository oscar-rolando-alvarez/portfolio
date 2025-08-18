using ECommerce.Services.Catalog.Models;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace ECommerce.Services.Catalog.Data;

public class CatalogContext : ICatalogContext
{
    public CatalogContext(IMongoClient mongoClient, IOptions<CatalogDatabaseSettings> settings)
    {
        var database = mongoClient.GetDatabase(settings.Value.DatabaseName);
        Products = database.GetCollection<Product>(settings.Value.ProductsCollectionName);
    }

    public IMongoCollection<Product> Products { get; }
}