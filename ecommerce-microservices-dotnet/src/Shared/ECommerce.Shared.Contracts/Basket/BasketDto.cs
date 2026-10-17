namespace ECommerce.Shared.Contracts.Basket;

public sealed record BasketDto(
    Guid CustomerId,
    IReadOnlyList<BasketItemDto> Items,
    decimal TotalPrice,
    DateTime LastUpdated);

public sealed record BasketItemDto(
    Guid ProductId,
    string ProductName,
    int Quantity,
    decimal Price,
    decimal TotalPrice,
    string ImageUrl);

/// <summary>Adds a product to the caller's basket. The customer is taken from the access token.</summary>
public sealed record AddToBasketRequest(Guid ProductId, int Quantity);

/// <summary>Sets the quantity of a basket line; zero or less removes the line.</summary>
public sealed record UpdateBasketItemRequest(int Quantity);
