namespace ECommerce.Shared.Contracts.Orders;

public class OrderDto
{
    public Guid Id { get; set; }
    public Guid CustomerId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public OrderStatus Status { get; set; }
    public decimal TotalAmount { get; set; }
    public List<OrderItemDto> Items { get; set; } = new();
    public AddressDto ShippingAddress { get; set; } = new();
    public AddressDto BillingAddress { get; set; } = new();
    public string PaymentMethod { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class OrderItemDto
{
    public Guid ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
    public decimal Total { get; set; }
}

public class AddressDto
{
    public string Street { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public string PostalCode { get; set; } = string.Empty;
}

public class CreateOrderRequest
{
    public Guid CustomerId { get; set; }
    public List<OrderItemRequest> Items { get; set; } = new();
    public AddressDto ShippingAddress { get; set; } = new();
    public AddressDto BillingAddress { get; set; } = new();
    public string PaymentMethod { get; set; } = string.Empty;
}

public class OrderItemRequest
{
    public Guid ProductId { get; set; }
    public int Quantity { get; set; }
}

public enum OrderStatus
{
    Pending = 0,
    Confirmed = 1,
    Paid = 2,
    Shipped = 3,
    Delivered = 4,
    Cancelled = 5
}