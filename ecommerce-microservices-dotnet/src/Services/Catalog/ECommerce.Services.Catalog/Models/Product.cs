using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace ECommerce.Services.Catalog.Models;

public class Product
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("description")]
    public string Description { get; set; } = string.Empty;

    [BsonElement("price")]
    public decimal Price { get; set; }

    [BsonElement("category")]
    public string Category { get; set; } = string.Empty;

    [BsonElement("imageUrl")]
    public string ImageUrl { get; set; } = string.Empty;

    [BsonElement("sku")]
    public string Sku { get; set; } = string.Empty;

    [BsonElement("stockQuantity")]
    public int StockQuantity { get; set; }

    [BsonElement("isActive")]
    public bool IsActive { get; set; } = true;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("updatedAt")]
    public DateTime? UpdatedAt { get; set; }

    [BsonElement("tags")]
    public List<string> Tags { get; set; } = new();

    [BsonElement("specifications")]
    public Dictionary<string, string> Specifications { get; set; } = new();
}