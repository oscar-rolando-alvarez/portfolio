using ECommerce.Shared.Events.Base;

namespace ECommerce.Shared.Events.Events;

public class OrderCreated : IntegrationEvent
{
    public Guid OrderId { get; set; }
    public Guid CustomerId { get; set; }
    public decimal TotalAmount { get; set; }
    public List<OrderItem> Items { get; set; } = new();
    public Address ShippingAddress { get; set; } = new();
    public string PaymentMethod { get; set; } = string.Empty;
}

public class OrderPaid : IntegrationEvent
{
    public Guid OrderId { get; set; }
    public Guid PaymentId { get; set; }
    public decimal Amount { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
}

public class OrderShipped : IntegrationEvent
{
    public Guid OrderId { get; set; }
    public string TrackingNumber { get; set; } = string.Empty;
    public string Carrier { get; set; } = string.Empty;
    public DateTime ShippedAt { get; set; }
}

public class OrderCancelled : IntegrationEvent
{
    public Guid OrderId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DateTime CancelledAt { get; set; }
}

public class OrderItem
{
    public Guid ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
}

public class Address
{
    public string Street { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public string PostalCode { get; set; } = string.Empty;
}