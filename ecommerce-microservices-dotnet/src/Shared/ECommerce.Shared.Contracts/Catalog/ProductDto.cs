namespace ECommerce.Shared.Contracts.Catalog;

public class ProductDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Category { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public int StockQuantity { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class CreateProductRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Category { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public string Sku { get; set; } = string.Empty;
    public int StockQuantity { get; set; }
}

public class UpdateProductRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Category { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public int StockQuantity { get; set; }
}