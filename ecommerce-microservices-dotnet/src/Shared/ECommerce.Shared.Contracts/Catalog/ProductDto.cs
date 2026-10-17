namespace ECommerce.Shared.Contracts.Catalog;

public sealed record ProductDto(
    Guid Id,
    string Name,
    string Description,
    decimal Price,
    string Category,
    string ImageUrl,
    string Sku,
    int StockQuantity,
    bool IsActive,
    IReadOnlyList<string> Tags,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record CreateProductRequest(
    string Name,
    string Description,
    decimal Price,
    string Category,
    string ImageUrl,
    string Sku,
    int StockQuantity,
    IReadOnlyList<string>? Tags = null);

public sealed record UpdateProductRequest(
    string Name,
    string Description,
    decimal Price,
    string Category,
    string ImageUrl,
    int StockQuantity,
    IReadOnlyList<string>? Tags = null);

public sealed record UpdateStockRequest(int NewStock);
