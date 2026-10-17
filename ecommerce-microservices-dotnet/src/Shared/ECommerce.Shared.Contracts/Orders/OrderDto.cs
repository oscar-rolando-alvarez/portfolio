namespace ECommerce.Shared.Contracts.Orders;

public sealed record OrderDto(
    Guid Id,
    Guid CustomerId,
    string OrderNumber,
    OrderStatus Status,
    decimal TotalAmount,
    IReadOnlyList<OrderItemDto> Items,
    AddressDto ShippingAddress,
    AddressDto BillingAddress,
    string PaymentMethod,
    string? FailureReason,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record OrderItemDto(Guid ProductId, string ProductName, int Quantity, decimal Price, decimal Total);

public sealed record AddressDto(string Street, string City, string State, string Country, string PostalCode);

/// <summary>Places an order for the caller. Prices are resolved server-side from the catalog.</summary>
public sealed record CreateOrderRequest(
    IReadOnlyList<OrderItemRequest> Items,
    AddressDto ShippingAddress,
    AddressDto? BillingAddress,
    string PaymentMethod);

public sealed record OrderItemRequest(Guid ProductId, int Quantity);

public enum OrderStatus
{
    Pending = 0,
    Confirmed = 1,
    Paid = 2,
    Shipped = 3,
    Delivered = 4,
    Cancelled = 5,
}
