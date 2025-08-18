using ECommerce.Services.Catalog.Models;
using MongoDB.Driver;

namespace ECommerce.Services.Catalog.Data;

public interface ICatalogContext
{
    IMongoCollection<Product> Products { get; }
}