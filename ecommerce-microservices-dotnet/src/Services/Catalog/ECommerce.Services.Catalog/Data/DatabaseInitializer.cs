using ECommerce.Services.Catalog.Models;
using MongoDB.Driver;

namespace ECommerce.Services.Catalog.Data;

/// <summary>Creates indexes and, when <c>Catalog:SeedData</c> is true, inserts demo products into an empty catalog.</summary>
public static class DatabaseInitializer
{
    public static async Task InitializeCatalogAsync(this WebApplication app, CancellationToken cancellationToken = default)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<CatalogContext>();

        await context.Products.Indexes.CreateManyAsync(
            [
                new CreateIndexModel<Product>(Builders<Product>.IndexKeys.Ascending(p => p.Sku), new CreateIndexOptions { Unique = true }),
                new CreateIndexModel<Product>(Builders<Product>.IndexKeys.Ascending(p => p.Category).Ascending(p => p.Name)),
            ],
            cancellationToken);

        if (!app.Configuration.GetValue("Catalog:SeedData", false))
        {
            return;
        }

        if (await context.Products.EstimatedDocumentCountAsync(cancellationToken: cancellationToken) > 0)
        {
            return;
        }

        await context.Products.InsertManyAsync(SeedProducts(), cancellationToken: cancellationToken);
    }

    private static IEnumerable<Product> SeedProducts() =>
    [
        new()
        {
            Name = "Aurora Smartphone X2",
            Description = "6.3 inch OLED smartphone with a 50 MP camera and all-day battery.",
            Price = 899.00m,
            Category = "Electronics",
            Sku = "PHONE-X2-128",
            StockQuantity = 50,
            Tags = ["smartphone", "mobile", "5g"],
            Specifications = new() { ["Storage"] = "128 GB", ["Screen"] = "6.3 inch OLED" },
        },
        new()
        {
            Name = "Nimbus Laptop 16",
            Description = "16 inch developer laptop with 32 GB RAM and 1 TB SSD.",
            Price = 2199.00m,
            Category = "Electronics",
            Sku = "LAPTOP-N16-32",
            StockQuantity = 25,
            Tags = ["laptop", "computer", "developer"],
            Specifications = new() { ["RAM"] = "32 GB", ["Storage"] = "1 TB SSD" },
        },
        new()
        {
            Name = "Trailblazer Running Shoe",
            Description = "Lightweight running shoe with responsive foam midsole.",
            Price = 129.00m,
            Category = "Footwear",
            Sku = "SHOE-TRAIL-10",
            StockQuantity = 100,
            Tags = ["shoes", "running", "sport"],
            Specifications = new() { ["Size"] = "US 10", ["Material"] = "Mesh" },
        },
    ];
}
