using ECommerce.Services.Catalog.Models;
using MongoDB.Driver;

namespace ECommerce.Services.Catalog.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ICatalogContext>();

        // Create indexes
        var indexKeysDefinition = Builders<Product>.IndexKeys
            .Ascending(x => x.Name)
            .Ascending(x => x.Category)
            .Ascending(x => x.Sku);

        await context.Products.Indexes.CreateOneAsync(
            new CreateIndexModel<Product>(indexKeysDefinition));

        // Seed data if collection is empty
        var count = await context.Products.CountDocumentsAsync(Builders<Product>.Filter.Empty);
        if (count == 0)
        {
            await SeedDataAsync(context);
        }
    }

    private static async Task SeedDataAsync(ICatalogContext context)
    {
        var products = new List<Product>
        {
            new Product
            {
                Name = "iPhone 15 Pro",
                Description = "Latest iPhone with advanced features",
                Price = 999.99m,
                Category = "Electronics",
                ImageUrl = "https://example.com/iphone15pro.jpg",
                Sku = "IPHONE15PRO001",
                StockQuantity = 50,
                Tags = new List<string> { "smartphone", "apple", "mobile" },
                Specifications = new Dictionary<string, string>
                {
                    { "Color", "Space Black" },
                    { "Storage", "128GB" },
                    { "Screen Size", "6.1 inch" }
                }
            },
            new Product
            {
                Name = "MacBook Pro 16\"",
                Description = "Powerful laptop for professionals",
                Price = 2399.99m,
                Category = "Electronics",
                ImageUrl = "https://example.com/macbookpro16.jpg",
                Sku = "MACBOOKPRO16001",
                StockQuantity = 25,
                Tags = new List<string> { "laptop", "apple", "computer" },
                Specifications = new Dictionary<string, string>
                {
                    { "Processor", "M3 Pro" },
                    { "RAM", "16GB" },
                    { "Storage", "512GB SSD" }
                }
            },
            new Product
            {
                Name = "Nike Air Max 270",
                Description = "Comfortable running shoes",
                Price = 150.00m,
                Category = "Footwear",
                ImageUrl = "https://example.com/nikeairmax270.jpg",
                Sku = "NIKEAIRMAX270001",
                StockQuantity = 100,
                Tags = new List<string> { "shoes", "nike", "running" },
                Specifications = new Dictionary<string, string>
                {
                    { "Size", "US 10" },
                    { "Color", "Black/White" },
                    { "Material", "Mesh/Synthetic" }
                }
            }
        };

        await context.Products.InsertManyAsync(products);
    }
}